import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundReplyRow } from "@/components/admin/InboundReplies";
import type { UnansweredMailRow } from "@/components/admin/UnansweredMails";
import { HOTEL_DESK_LABELS } from "@/lib/crm/hotel-desk";
import { followUpHref, outboundAnchor, supplierAnsweredLatest, UNANSWERED_AFTER_MS, type FollowUpTurn } from "@/lib/crm/mail-followup";
import { replyHref } from "@/lib/crm/mail-reply";
import type { HotelDeskKind } from "@/lib/crm/types";

type SilentRequest = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  kind: string;
  subject: string | null;
  sent_at: string | null;
  last_follow_up_at: string | null;
  follow_up_count: number | null;
  replied_at?: string | null;
};

type ThreadBeat = {
  request_id: string | null;
  message_id: string | null;
  gmail_message_id: string;
  received_at: string;
  direction: string;
  counts_as_reply: boolean;
};

type SilentMessage = {
  id: string;
  booking_id: string;
  booking_item_id: string;
  subject: string | null;
  sent_at: string | null;
  replied_at: string | null;
};

/** Courriers et messages partis, sans réponse depuis 48 h. Deux lectures courtes, puis les noms. */
export async function loadUnansweredMails(supabase: SupabaseClient): Promise<UnansweredMailRow[]> {
  const cutoff = new Date(Date.now() - UNANSWERED_AFTER_MS).toISOString();
  const requestColumns =
    "id, booking_id, booking_item_id, kind, subject, sent_at, last_follow_up_at, follow_up_count, replied_at";
  const [{ data: quiet }, { data: chased }, { data: notes }] = await Promise.all([
    supabase
      .from("crm_hotel_requests")
      .select(requestColumns)
      .in("status", ["sent", "follow_up"])
      .is("last_follow_up_at", null)
      .lt("sent_at", cutoff)
      .order("sent_at", { ascending: true })
      .limit(40),
    supabase
      .from("crm_hotel_requests")
      .select(requestColumns)
      .in("status", ["sent", "follow_up"])
      .lt("last_follow_up_at", cutoff)
      .order("last_follow_up_at", { ascending: true })
      .limit(40),
    supabase
      .from("crm_hotel_messages")
      .select("id, booking_id, booking_item_id, subject, sent_at, replied_at")
      .lt("sent_at", cutoff)
      .order("sent_at", { ascending: true })
      .limit(40),
  ]);

  const requests = [...((quiet || []) as SilentRequest[]), ...((chased || []) as SilentRequest[])];
  const messages = (notes || []) as SilentMessage[];
  const requestIds = [...new Set(requests.map((row) => row.id))];
  const messageIds = messages.map((row) => row.id);
  const [requestBeats, messageBeats] = await Promise.all([
    requestIds.length
      ? supabase
          .from("crm_hotel_thread_messages")
          .select("request_id, message_id, gmail_message_id, received_at, direction, counts_as_reply")
          .in("request_id", requestIds)
      : Promise.resolve({ data: [] as ThreadBeat[] }),
    messageIds.length
      ? supabase
          .from("crm_hotel_thread_messages")
          .select("request_id, message_id, gmail_message_id, received_at, direction, counts_as_reply")
          .in("message_id", messageIds)
      : Promise.resolve({ data: [] as ThreadBeat[] }),
  ]);
  const beats = [...((requestBeats.data || []) as ThreadBeat[]), ...((messageBeats.data || []) as ThreadBeat[])];
  const requestTurns = new Map<string, FollowUpTurn[]>();
  const messageTurns = new Map<string, FollowUpTurn[]>();
  const outsByMessage = new Map<string, number>();
  for (const beat of beats) {
    const turn: FollowUpTurn = {
      id: beat.gmail_message_id,
      at: beat.received_at,
      direction: beat.direction === "out" ? "out" : "in",
      subjectKey: beat.request_id || beat.message_id || "",
      countsAsReply: beat.counts_as_reply,
    };
    if (beat.request_id) {
      const list = requestTurns.get(beat.request_id) || [];
      list.push(turn);
      requestTurns.set(beat.request_id, list);
    }
    if (beat.message_id) {
      const list = messageTurns.get(beat.message_id) || [];
      list.push(turn);
      messageTurns.set(beat.message_id, list);
      if (turn.direction === "out") outsByMessage.set(beat.message_id, (outsByMessage.get(beat.message_id) || 0) + 1);
    }
  }

  const openRequests = requests.filter(
    (row) =>
      !supplierAnsweredLatest({
        sentAt: outboundAnchor(row.sent_at, row.last_follow_up_at),
        repliedAt: row.replied_at,
        turns: requestTurns.get(row.id) || [],
      })
  );
  const openMessages = messages.filter(
    (row) =>
      !supplierAnsweredLatest({
        sentAt: row.sent_at,
        repliedAt: row.replied_at,
        turns: messageTurns.get(row.id) || [],
      })
  );
  const itemIds = [...new Set([...openRequests, ...openMessages].map((row) => row.booking_item_id))];
  const bookingIds = [...new Set([...openRequests, ...openMessages].map((row) => row.booking_id))];
  if (!itemIds.length) return [];
  const [{ data: items }, { data: bookings }] = await Promise.all([
    supabase.from("crm_booking_items").select("id, title, details").in("id", itemIds),
    supabase.from("crm_bookings").select("id, reference").in("id", bookingIds),
  ]);
  const names = new Map(
    ((items || []) as { id: string; title: string | null; details: { hotel_name?: unknown } | null }[]).map((item) => {
      const hotel = item.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name.trim() : "";
      return [item.id, hotel || item.title || "Hôtel"] as const;
    })
  );
  const references = new Map(
    ((bookings || []) as { id: string; reference: string | null }[]).map((row) => [row.id, (row.reference || "").trim()])
  );

  const lines: (UnansweredMailRow & { anchor: string })[] = [
    ...openRequests.flatMap((row) => {
      const anchor = outboundAnchor(row.sent_at, row.last_follow_up_at);
      if (!anchor) return [];
      const kind = row.kind in HOTEL_DESK_LABELS ? HOTEL_DESK_LABELS[row.kind as HotelDeskKind] : "Courrier";
      const reference = references.get(row.booking_id) || "";
      return [
        {
          id: row.id,
          href: followUpHref(row.booking_id, row.booking_item_id, row.id),
          title: [names.get(row.booking_item_id) || "Hôtel", reference].filter(Boolean).join(" · "),
          subject: (row.subject || "").trim() || kind,
          kind,
          sentAt: anchor,
          followUps: row.follow_up_count || 0,
          anchor,
        },
      ];
    }),
    ...openMessages.flatMap((row) => {
      if (!row.sent_at) return [];
      const reference = references.get(row.booking_id) || "";
      const outs = outsByMessage.get(row.id) || 0;
      return [
        {
          id: row.id,
          href: followUpHref(row.booking_id, row.booking_item_id, row.id),
          title: [names.get(row.booking_item_id) || "Hôtel", reference].filter(Boolean).join(" · "),
          subject: (row.subject || "").trim() || "Message",
          kind: "Message",
          sentAt: row.sent_at,
          followUps: Math.max(0, outs - 1),
          anchor: row.sent_at,
        },
      ];
    }),
  ];
  lines.sort((a, b) => a.anchor.localeCompare(b.anchor) || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return lines.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true))).slice(0, 40);
}

/** Réponses d’hôtel déjà dans un fil. Pas le corps : le brouillon s’ouvre sur le dossier. */
export async function loadInboundReplies(supabase: SupabaseClient): Promise<InboundReplyRow[]> {
  const { data } = await supabase
    .from("crm_hotel_thread_messages")
    .select("id, booking_id, booking_item_id, subject, received_at, counts_as_reply")
    .eq("direction", "in")
    .order("received_at", { ascending: false })
    .limit(40);
  const rows = (data || []) as {
    id: string;
    booking_id: string;
    booking_item_id: string;
    subject: string | null;
    received_at: string;
    counts_as_reply: boolean;
  }[];
  if (!rows.length) return [];
  const itemIds = [...new Set(rows.map((row) => row.booking_item_id))];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id))];
  const [{ data: items }, { data: bookings }] = await Promise.all([
    supabase.from("crm_booking_items").select("id, title, details").in("id", itemIds),
    supabase.from("crm_bookings").select("id, reference").in("id", bookingIds),
  ]);
  const names = new Map(
    ((items || []) as { id: string; title: string | null; details: { hotel_name?: unknown } | null }[]).map((item) => {
      const hotel = item.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name.trim() : "";
      return [item.id, hotel || item.title || "Hôtel"] as const;
    })
  );
  const references = new Map(
    ((bookings || []) as { id: string; reference: string | null }[]).map((row) => [row.id, (row.reference || "").trim()])
  );
  return rows.map((row) => {
    const reference = references.get(row.booking_id) || "";
    return {
      id: row.id,
      href: replyHref(row.booking_id, row.booking_item_id, row.id),
      title: [names.get(row.booking_item_id) || "Hôtel", reference].filter(Boolean).join(" · "),
      subject: (row.subject || "").trim() || "Réponse",
      kind: row.counts_as_reply ? "Réponse" : "Absence",
      sentAt: row.received_at,
    };
  });
}
