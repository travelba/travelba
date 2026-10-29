import Link from "next/link";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { EmailIngestInbox } from "@/components/admin/EmailIngestInbox";
import { InboundReplies, type InboundReplyRow } from "@/components/admin/InboundReplies";
import { UnansweredMails, type UnansweredMailRow } from "@/components/admin/UnansweredMails";
import { Pagination } from "@/components/admin/Pagination";
import { requireStaffPage } from "@/lib/crm/auth";
import { ADMIN_PAGE_SIZE, pageRange, parsePage, type SearchParamValue } from "@/lib/crm/admin-list";
import { HOTEL_DESK_LABELS } from "@/lib/crm/hotel-desk";
import { followUpHref, outboundAnchor, supplierAnsweredLatest, UNANSWERED_AFTER_MS, type FollowUpTurn } from "@/lib/crm/mail-followup";
import { replyHref } from "@/lib/crm/mail-reply";
import { EMAIL_INBOX_QUEUE_STATUSES, type CrmEmailIngest, type HotelDeskKind } from "@/lib/crm/types";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import { appliedSinceIso } from "@/lib/crm/import-metrics";
import { readProposalOps, type ProposalOp } from "@/lib/crm/import-proposal";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Colonnes de la file. Le corps HTML et le texte partent au GET d’une carte ouverte. */
const EMAIL_LIST_COLUMNS = [
  "id",
  "gmail_message_id",
  "gmail_thread_id",
  "label",
  "from_email",
  "subject",
  "received_at",
  "status",
  "extract",
  "candidates",
  "attachments",
  "warnings",
  "suggested_customer_id",
  "suggested_booking_id",
  "created_booking_id",
  "error",
  "ignore_reason",
  "grouped_into",
  "confirmation_refs",
  "match_tier",
  "field_confidence",
  "field_quotes",
  "created_at",
  "updated_at",
].join(", ");

export const metadata = { title: "Boîte de réception" };

type Vue = "file" | "appliques" | "ignores" | "sans-reponse" | "reponses";

function vueOf(value: string | string[] | undefined): Vue {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "appliques" || raw === "ignores" || raw === "sans-reponse" || raw === "reponses") return raw;
  return "file";
}

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
async function loadUnansweredMails(supabase: SupabaseClient): Promise<UnansweredMailRow[]> {
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
async function loadInboundReplies(supabase: SupabaseClient): Promise<InboundReplyRow[]> {
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

function emailsHref(vue: Vue, page: number) {
  const query = new URLSearchParams();
  if (vue !== "file") query.set("vue", vue);
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `/admin/emails?${qs}` : "/admin/emails";
}

export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: SearchParamValue; page?: SearchParamValue }>;
}) {
  const params = await searchParams;
  const vue = vueOf(params.vue);
  const page = parsePage(params.page);
  const { from, to } = pageRange(page);
  const since = appliedSinceIso();
  const { supabase } = await requireStaffPage();
  const unanswered = vue === "sans-reponse" ? await loadUnansweredMails(supabase) : null;
  const replies = vue === "reponses" ? await loadInboundReplies(supabase) : null;
  const quiet = unanswered !== null || replies !== null;
  let mailQuery = supabase.from("crm_email_ingest").select(EMAIL_LIST_COLUMNS, { count: "exact" });
  if (vue === "ignores") mailQuery = mailQuery.eq("status", "ignored");
  else if (vue === "appliques") mailQuery = mailQuery.eq("status", "attached").gte("updated_at", since);
  else mailQuery = mailQuery.in("status", [...EMAIL_INBOX_QUEUE_STATUSES]);
  const [{ data: rows, count }, { data: customers }] = quiet
    ? [{ data: [], count: 0 }, { data: [] }]
    : await Promise.all([
        mailQuery.order("received_at", { ascending: false, nullsFirst: false }).range(from, to),
        supabase
          .from("crm_customers")
          .select("id, first_name, last_name, company_name, email, phone")
          .order("last_name"),
      ]);

  const inbox = (rows || []) as unknown as CrmEmailIngest[];
  const ids = inbox.map((row) => row.id);
  const proposals: { emailIngestId: string; ops: ProposalOp[]; conflict: boolean }[] = [];
  if (ids.length) {
    const { data: stored, error } = await supabase
      .from("crm_import_proposals")
      .select("email_ingest_id, ops, conflict, undone_at, created_at")
      .in("email_ingest_id", ids)
      .order("created_at", { ascending: false });
    if (!error && stored) {
      const seen = new Set<string>();
      for (const row of stored) {
        const emailIngestId = typeof row.email_ingest_id === "string" ? row.email_ingest_id : "";
        if (!emailIngestId || row.undone_at || seen.has(emailIngestId)) continue;
        seen.add(emailIngestId);
        proposals.push({
          emailIngestId,
          ops: readProposalOps(row.ops),
          conflict: row.conflict === true,
        });
      }
    }
  }

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Boîte de réception"
        subtitle={
          vue === "sans-reponse"
            ? "Messages envoyés sans réponse depuis 48 heures. Relancer ouvre le brouillon : il part seulement après confirmation."
            : vue === "reponses"
              ? "Messages reçus des hôtels. Répondre ouvre le brouillon dans le même fil : il part seulement après confirmation."
              : "Un fil, une carte. La proposition dit le client, le dossier et ce qui change. Rien n’est déposé ni montré au client sans votre clic."
        }
      />
      <nav className="mt-6 flex flex-wrap gap-2 text-sm font-semibold" aria-label="Vues de la boîte">
        {(
          [
            ["file", "À traiter", "/admin/emails"],
            ["appliques", "Déposés (24 h)", "/admin/emails?vue=appliques"],
            ["ignores", "Classés", "/admin/emails?vue=ignores"],
            ["sans-reponse", "Sans réponse", "/admin/emails?vue=sans-reponse"],
            ["reponses", "Réponses", "/admin/emails?vue=reponses"],
          ] as const
        ).map(([id, label, href]) => (
          <Link
            key={id}
            href={href}
            className={`rounded-full px-3 py-1.5 ${
              vue === id ? "bg-[#0B192C] text-white" : "bg-white text-[#0B192C] ring-1 ring-[#C5A880]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {vue === "sans-reponse" || vue === "reponses" ? null : (
        <p className="mt-2 text-xs text-muted">Raccourcis : A déposer les pièces, I classer, E écarter le doublon.</p>
      )}
      {unanswered ? (
        <UnansweredMails rows={unanswered} />
      ) : replies ? (
        <InboundReplies rows={replies} />
      ) : (
        <>
      <div className="mt-4">
        <Pagination page={page} total={count ?? inbox.length} hrefFor={(next) => emailsHref(vue, next)} label="e-mails" />
      </div>
      <div className="mt-4">
        <EmailIngestInbox
          rows={inbox}
          customers={(customers || []) as PickableCustomer[]}
          mode={vue === "appliques" || vue === "ignores" ? vue : "file"}
          proposals={proposals}
        />
      </div>
      {count != null && count > ADMIN_PAGE_SIZE ? (
        <div className="mt-4">
          <Pagination page={page} total={count} hrefFor={(next) => emailsHref(vue, next)} label="e-mails" />
        </div>
      ) : null}
        </>
      )}
    </div>
  );
}
