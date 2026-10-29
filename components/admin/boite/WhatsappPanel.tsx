import Link from "next/link";
import { ConciergeFollowupSend } from "@/components/admin/ConciergeFollowupSend";
import { WhatsappInbox } from "@/components/admin/WhatsappInbox";
import { firstParam, type SearchParamValue } from "@/lib/crm/admin-list";
import { CARNET_ADDITION_KIND, CARNET_ADDITION_LABEL } from "@/lib/crm/carnet-addition";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { stayDestinationLine } from "@/lib/crm/stay-phrase";
import {
  approvedManualTemplates,
  foldThreads,
  inboxFilterFromParam,
  pauseStillActive,
  readStamp,
  schemaMissesColumn,
  sessionWindowOpenNow,
  threadKey,
  type InboxMessage,
} from "@/lib/crm/whatsapp-inbox";
import { createServiceClient } from "@/lib/supabase/admin";

type RawMessage = {
  id: string;
  customer_id: string | null;
  booking_id: string | null;
  direction: string;
  body: string;
  status: string | null;
  error?: string | null;
  template_key: string | null;
  created_at: string;
  phone?: string | null;
  author_staff_id?: string | null;
  media_path?: string | null;
  tools?: string[] | null;
  concierge_mark?: string | null;
  transcript?: string | null;
};

const RICH =
  "id, customer_id, booking_id, direction, body, status, error, template_key, created_at, phone, author_staff_id, media_path, tools, concierge_mark, transcript";
const RICH_WITHOUT_TRANSCRIPT =
  "id, customer_id, booking_id, direction, body, status, error, template_key, created_at, phone, author_staff_id, media_path, tools, concierge_mark";
const BASE = "id, customer_id, booking_id, direction, body, status, template_key, created_at";

const DRAFT_LABEL: Record<string, string> = {
  predeparture: "Veille du départ",
  checkin: "Arrivée à l’hôtel",
  feedback: "Retour",
  [CARNET_ADDITION_KIND]: CARNET_ADDITION_LABEL,
};

/** WhatsApp : les fils, le fil ouvert (`?fil=`), les brouillons prêts et le filtre (`?filtre=non-lus|a-approuver`). */
export async function WhatsappPanel({ params }: { params: Record<string, SearchParamValue> }) {
  const fil = firstParam(params.fil);
  const filter = inboxFilterFromParam(params.filtre);
  const admin = createServiceClient();
  const full = await admin.from("crm_whatsapp_messages").select(RICH).order("created_at", { ascending: false }).limit(500);
  const mid =
    full.error && schemaMissesColumn(full.error, "transcript")
      ? await admin.from("crm_whatsapp_messages").select(RICH_WITHOUT_TRANSCRIPT).order("created_at", { ascending: false }).limit(500)
      : null;
  const chosen = !full.error ? full : mid && !mid.error ? mid : null;
  const rows = (
    chosen ? chosen.data || [] : (await admin.from("crm_whatsapp_messages").select(BASE).order("created_at", { ascending: false }).limit(500)).data || []
  ) as RawMessage[];
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))] as string[];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id).filter(Boolean))] as string[];
  const staffIds = [...new Set(rows.map((row) => row.author_staff_id).filter(Boolean))] as string[];
  const [customers, bookings, staff, threads, requests, proposals, followups] = await Promise.all([
    customerIds.length ? admin.from("crm_customers").select("id, first_name, last_name, phone").in("id", customerIds) : Promise.resolve({ data: [] }),
    bookingIds.length ? admin.from("crm_bookings").select("id, reference, title, destination").in("id", bookingIds) : Promise.resolve({ data: [] }),
    staffIds.length ? admin.from("crm_staff").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] }),
    admin.from("crm_whatsapp_threads").select("phone, paused_until, staff_read_at, customer_id"),
    admin.from("crm_whatsapp_requests").select("id, phone, message_id, kind, status").eq("status", "open"),
    admin.from("crm_concierge_proposals").select("id, phone, draft_body, status").eq("status", "pending"),
    admin
      .from("crm_concierge_followups")
      .select("id, phone, kind, channel, draft_body, status")
      .eq("status", "planned")
      .in("kind", ["predeparture", "checkin", "feedback", CARNET_ADDITION_KIND])
      .order("due_at", { ascending: true })
      .limit(30),
  ]);
  const names = new Map(
    ((customers.data || []) as { id: string; first_name: string | null; last_name: string | null; phone: string | null }[]).map((row) => [
      row.id,
      { name: [row.first_name, row.last_name].filter(Boolean).join(" "), phone: row.phone },
    ])
  );
  const stays = new Map(
    ((bookings.data || []) as { id: string; reference: string; title: string | null; destination: string | null }[]).map((row) => [
      row.id,
      { reference: row.reference, place: stayDestinationLine(row) },
    ])
  );
  const agents = new Map(((staff.data || []) as { id: string; full_name: string | null }[]).map((row) => [row.id, row.full_name || "L’agence"]));
  const openRequests = ((requests.data || []) as { id: string; phone: string | null; message_id: string | null; kind: string }[]) || [];
  const requestByMessage = new Map(openRequests.filter((row) => row.message_id).map((row) => [row.message_id as string, row.id]));
  const messages: InboxMessage[] = rows.map((row) => {
    const customer = row.customer_id ? names.get(row.customer_id) : null;
    const stay = row.booking_id ? stays.get(row.booking_id) : null;
    return {
      id: row.id,
      phone: row.phone || customer?.phone || null,
      customerId: row.customer_id,
      customerName: customer?.name || null,
      bookingId: row.booking_id,
      bookingReference: stay ? `${stay.reference}${stay.place ? ` · ${stay.place}` : ""}` : null,
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      body: row.body,
      createdAt: row.created_at,
      status: row.status,
      error: row.error || null,
      templateKey: row.template_key,
      authorName: row.author_staff_id ? agents.get(row.author_staff_id) || "L’agence" : null,
      mediaPath: row.media_path || null,
      transcript: row.transcript || null,
      tools: Array.isArray(row.tools) ? row.tools : [],
      requestId: requestByMessage.get(row.id) || null,
      conciergeMark: row.concierge_mark === "good" || row.concierge_mark === "bad" ? row.concierge_mark : null,
    };
  });
  const threadRows = threads.error
    ? []
    : ((threads.data || []) as { phone: string; paused_until: string | null; staff_read_at?: string | null; customer_id: string | null }[]);
  const paused = threadRows.filter((row) => pauseStillActive(row.paused_until)).map((row) => row.phone);
  const readAt: Record<string, string | null> = {};
  for (const row of threadRows) {
    if (row.staff_read_at) readAt[row.phone] = row.staff_read_at;
  }
  const escalated = openRequests.map((row) => row.phone).filter(Boolean) as string[];
  const allProposals = (proposals.data || []) as { id: string; phone: string; draft_body: string }[];
  const drafts = (followups.error ? [] : followups.data || []) as { id: string; phone: string; kind: string; channel: string; draft_body: string }[];
  const pendingByPhone = new Map<string, number>();
  for (const row of [...allProposals, ...drafts]) pendingByPhone.set(row.phone, (pendingByPhone.get(row.phone) || 0) + 1);
  const folded = foldThreads(messages, { paused, escalated, readAt }).map((thread) => ({
    ...thread,
    pending: thread.phone ? pendingByPhone.get(thread.phone) || 0 : 0,
  }));
  const activeKey = fil || folded[0]?.key || null;
  const activeMessages = messages.filter((row) => threadKey(row) === activeKey);
  const active = folded.find((row) => row.key === activeKey) || null;
  const lastInbound = [...activeMessages].filter((row) => row.direction === "inbound").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (active?.phone && fil) {
    const marked = await admin.from("crm_whatsapp_threads").upsert({
      phone: active.phone,
      customer_id: active.customerId,
      staff_read_at: readStamp(),
      updated_at: readStamp(),
    });
    if (marked.error && !/column|schema cache/i.test(marked.error.message || "")) {
      console.error("[whatsapp] lu", marked.error.code || "error");
    }
  }
  const pending = allProposals.filter((row) => row.phone === active?.phone);
  const ready = drafts.filter((row) => row.phone === active?.phone);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
        <Link href="/admin/whatsapp/revue" className="font-semibold text-[var(--admin-navy)] underline">
          Revue du Concierge
        </Link>
      </div>
      {ready.length ? (
        <ul className="space-y-2">
          {ready.map((row) => (
            <li key={row.id} className="rounded-3xl border border-[var(--border)] px-4 py-3 text-sm">
              <p className="font-semibold text-[#0B192C]">{DRAFT_LABEL[row.kind] || row.kind}</p>
              <p className="mt-1 whitespace-pre-wrap text-[var(--color-ink-soft)]">{row.draft_body}</p>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                {row.kind === CARNET_ADDITION_KIND
                  ? "Prêt à envoyer. Rien ne part sans ce clic."
                  : row.channel === "template"
                    ? "Hors fenêtre de 24 h. Le modèle n’est pas soumis."
                    : "Fenêtre de 24 h ouverte."}
              </p>
              <ConciergeFollowupSend id={row.id} previewBlocked={isVercelPreview()} />
            </li>
          ))}
        </ul>
      ) : null}
      <WhatsappInbox
        threads={folded}
        messages={activeMessages}
        activeKey={activeKey}
        proposals={pending.map((row) => ({ id: row.id, draft: row.draft_body }))}
        templates={approvedManualTemplates()}
        windowOpen={sessionWindowOpenNow(lastInbound?.createdAt || null)}
        previewBlocked={isVercelPreview()}
        initialFilter={filter}
      />
    </div>
  );
}
