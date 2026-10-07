import type { SupabaseClient } from "@supabase/supabase-js";
import { HOTEL_DESK_LABELS } from "./hotel-desk";
import { recentHotelReplies, type HotelReplyNoticeRow, type RecentHotelReply } from "./hotel-reply-notice";
import type { HotelDeskKind } from "./types";

export type HotelTemplateReply = RecentHotelReply & { kindLabel: string };

function deskKindLabel(kind: string | null | undefined) {
  if (!kind || !(kind in HOTEL_DESK_LABELS)) return "";
  return HOTEL_DESK_LABELS[kind as HotelDeskKind];
}

/** Dernières réponses d’hôtel aux courriers envoyés par le CRM (upgrade, lien de paiement, …). */
export async function loadRecentHotelReplies(supabase: SupabaseClient): Promise<HotelTemplateReply[]> {
  const { data, error } = await supabase
    .from("crm_hotel_thread_messages")
    .select("id, booking_id, booking_item_id, request_id, subject, body, received_at, counts_as_reply")
    .eq("direction", "in")
    .eq("counts_as_reply", true)
    .not("request_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(8);

  if (error || !data?.length) return [];

  const messages = data as {
    id: string;
    booking_id: string;
    booking_item_id: string;
    request_id: string | null;
    subject: string | null;
    body: string | null;
    received_at: string;
    counts_as_reply: boolean;
  }[];
  const itemIds = [...new Set(messages.map((row) => row.booking_item_id))];
  const bookingIds = [...new Set(messages.map((row) => row.booking_id))];
  const requestIds = [...new Set(messages.map((row) => row.request_id).filter((id): id is string => Boolean(id)))];
  const [{ data: items }, { data: bookings }, { data: requests }] = await Promise.all([
    supabase.from("crm_booking_items").select("id, title, details").in("id", itemIds),
    supabase.from("crm_bookings").select("id, reference").in("id", bookingIds),
    supabase.from("crm_hotel_requests").select("id, kind").in("id", requestIds),
  ]);
  const byItem = new Map(
    ((items || []) as { id: string; title: string | null; details: { hotel_name?: unknown } | null }[]).map((item) => [item.id, item])
  );
  const references: Record<string, string> = {};
  for (const booking of (bookings || []) as { id: string; reference: string | null }[]) {
    references[booking.id] = booking.reference || "";
  }
  const kindByRequest = new Map(
    ((requests || []) as { id: string; kind: string }[]).map((row) => [row.id, deskKindLabel(row.kind)])
  );
  const kept = messages.filter((row) => row.request_id && kindByRequest.get(row.request_id));
  const rows: HotelReplyNoticeRow[] = kept.map((row) => {
    const item = byItem.get(row.booking_item_id);
    const hotelName = item?.details && typeof item.details.hotel_name === "string" ? item.details.hotel_name : "";
    return {
      id: row.id,
      bookingId: row.booking_id,
      itemId: row.booking_item_id,
      body: row.body || "",
      receivedAt: row.received_at,
      countsAsReply: row.counts_as_reply,
      hotelName,
      title: item?.title || "",
      subject: row.subject || "",
    };
  });

  return recentHotelReplies(rows, references).flatMap((reply) => {
    const message = kept.find((row) => row.id === reply.id);
    const kindLabel = message?.request_id ? kindByRequest.get(message.request_id) || "" : "";
    return kindLabel ? [{ ...reply, kindLabel }] : [];
  });
}
