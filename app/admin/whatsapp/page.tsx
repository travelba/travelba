import Link from "next/link";
import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { isVercelPreview } from "@/lib/crm/preview-secrets";
import { formatDateFr } from "@/lib/crm/money";
import { staffStayLabel } from "@/lib/crm/staff-stay";
import { stayDestinationLine } from "@/lib/crm/stay-phrase";
import { travelersMissingPassport } from "@/lib/crm/admin-now";
import { loadThreadMessages, loadWhatsappIndex } from "@/lib/crm/whatsapp-desk";
import {
  approvedManualTemplates,
  parseInboxFilter,
  readStamp,
  requestKindLabel,
  sessionWindowOpenNow,
  type InboxDossier,
  type InboxMessage,
} from "@/lib/crm/whatsapp-inbox";
import { WhatsappInbox } from "@/components/admin/WhatsappInbox";
import { WhatsappPendingQueue, type PendingDraft } from "@/components/admin/WhatsappPendingQueue";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export const metadata = { title: "WhatsApp" };

const DRAFT_LABEL: Record<string, string> = {
  predeparture: "Veille du départ",
  checkin: "Arrivée à l’hôtel",
  feedback: "Retour",
};

export default async function WhatsappInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ fil?: string; filtre?: string; vue?: string }>;
}) {
  await requireStaffPage();
  const params = await searchParams;
  const admin = createServiceClient();
  const index = await loadWhatsappIndex();
  const activeKey = params.fil || index.threads[0]?.key || null;
  const active = index.threads.find((row) => row.key === activeKey) || null;
  const [activeMessages, proposals, followups, requests, esta, uk] = await Promise.all([
    activeKey ? loadThreadMessages(activeKey) : Promise.resolve([] as InboxMessage[]),
    admin.from("crm_concierge_proposals").select("id, phone, draft_body, status").eq("status", "pending").limit(20),
    admin
      .from("crm_concierge_followups")
      .select("id, phone, kind, channel, draft_body, status")
      .eq("status", "planned")
      .in("kind", ["predeparture", "checkin", "feedback"])
      .order("due_at", { ascending: true })
      .limit(30),
    admin.from("crm_whatsapp_requests").select("id, phone, kind, status").eq("status", "open"),
    admin.from("crm_esta_notices").select("id, booking_id, kind").is("emailed_at", null).order("created_at", { ascending: false }).limit(8),
    admin.from("crm_uk_eta_notices").select("id, booking_id, kind").is("emailed_at", null).order("created_at", { ascending: false }).limit(8),
  ]);
  const names = new Map(index.threads.map((row) => [row.phone || "", row.customerName]));
  const windowFor = (phone: string) => {
    const inbound = [...index.messages, ...activeMessages]
      .filter((row) => row.phone === phone && row.direction === "inbound")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return sessionWindowOpenNow(inbound?.createdAt || null);
  };
  const drafts: PendingDraft[] = [];
  for (const row of (followups.error ? [] : followups.data || []) as {
    id: string;
    phone: string;
    kind: string;
    draft_body: string;
  }[]) {
    const open = windowFor(row.phone);
    drafts.push({
      id: `suivi-${row.id}`,
      followupId: row.id,
      title: DRAFT_LABEL[row.kind] || "Message",
      who: names.get(row.phone) || row.phone,
      body: row.draft_body,
      href: `/admin/whatsapp?fil=${encodeURIComponent(row.phone)}&vue=valider`,
      sendable: open,
      reason: open ? "Fenêtre de 24 h ouverte." : "Hors fenêtre de 24 h. Le modèle n’est pas soumis.",
    });
  }
  for (const row of (proposals.error ? [] : proposals.data || []) as { id: string; phone: string; draft_body: string }[]) {
    drafts.push({
      id: `proposition-${row.id}`,
      title: "Proposition",
      who: names.get(row.phone) || row.phone,
      body: row.draft_body,
      href: `/admin/whatsapp?fil=${encodeURIComponent(row.phone)}`,
      sendable: false,
      reason: "À approuver dans le fil. Rien ne part depuis cette liste.",
    });
  }
  const noticeBookings = [
    ...((esta.error ? [] : esta.data || []) as { id: string; booking_id: string; kind: string }[]).map((row) => ({
      ...row,
      title: row.kind === "valable" ? "ESTA" : "ESTA à relire",
    })),
    ...((uk.error ? [] : uk.data || []) as { id: string; booking_id: string; kind: string }[]).map((row) => ({
      ...row,
      title: row.kind === "valable" ? "ETA Royaume-Uni" : "ETA à relire",
    })),
  ];
  const bookingIds = [...new Set(noticeBookings.map((row) => row.booking_id))];
  const bookingRows = bookingIds.length
    ? await admin.from("crm_bookings").select("id, reference, title, destination").in("id", bookingIds)
    : { data: [] };
  const bookingLabel = new Map(
    ((bookingRows.data || []) as { id: string; reference: string; title: string | null; destination: string | null }[]).map((row) => [
      row.id,
      `${row.reference}${stayDestinationLine(row) ? ` · ${stayDestinationLine(row)}` : ""}`,
    ])
  );
  for (const row of noticeBookings) {
    drafts.push({
      id: `formalite-${row.id}`,
      title: row.title,
      who: bookingLabel.get(row.booking_id) || "Dossier",
      body: "Le message au client se relit sur le dossier, puis Envoyer au client.",
      href: `/admin/reservations/${row.booking_id}?onglet=client`,
      sendable: false,
      reason: "Le bouton du dossier respecte la fenêtre de 24 h.",
    });
  }
  const pendingForThread = ((proposals.data || []) as { id: string; phone: string; draft_body: string }[]).filter(
    (row) => row.phone === active?.phone
  );
  const lastInbound = [...activeMessages].filter((row) => row.direction === "inbound").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (active?.phone && params.fil) {
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
  const openRequest = ((requests.error ? [] : requests.data || []) as { phone: string | null; kind: string | null }[]).find(
    (row) => row.phone && row.phone === active?.phone
  );
  const dossier = await loadDossier(admin, active?.bookingId || null, active?.customerId || null, requestKindLabel(openRequest?.kind));
  const focusQueue = params.vue === "valider";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <PageEyebrow>Concierge</PageEyebrow>
          <PageTitle title="WhatsApp" subtitle="Non lus d’abord. Le dossier est à droite. Rien ne part sans votre clic." />
        </div>
        <Link href="/admin/whatsapp/revue" className="text-sm font-semibold text-[var(--color-ink-soft)] underline">
          Revue de la semaine
        </Link>
      </div>
      {focusQueue || drafts.length ? <WhatsappPendingQueue drafts={drafts} previewBlocked={isVercelPreview()} /> : null}
      <WhatsappInbox
        threads={index.threads}
        messages={activeMessages}
        activeKey={activeKey}
        proposals={pendingForThread.map((row) => ({ id: row.id, draft: row.draft_body }))}
        templates={approvedManualTemplates()}
        windowOpen={sessionWindowOpenNow(lastInbound?.createdAt || null)}
        previewBlocked={isVercelPreview()}
        initialFilter={parseInboxFilter(params.filtre)}
        dossier={dossier}
      />
    </div>
  );
}

async function loadDossier(
  admin: ReturnType<typeof createServiceClient>,
  bookingId: string | null,
  customerId: string | null,
  request: string | null
): Promise<InboxDossier | null> {
  if (!bookingId && !customerId) return { reference: null, place: null, dates: null, visibility: null, travelers: [], missingPassports: 0, request };
  const booking = bookingId
    ? await admin
        .from("crm_bookings")
        .select("id, customer_id, reference, title, destination, start_date, end_date, visible_to_client, archived_at")
        .eq("id", bookingId)
        .maybeSingle()
    : { data: null, error: null };
  const row = booking.data as {
    id: string;
    customer_id: string;
    reference: string;
    title: string | null;
    destination: string | null;
    start_date: string | null;
    end_date: string | null;
    visible_to_client: boolean | null;
    archived_at: string | null;
  } | null;
  if (!row) return { reference: null, place: null, dates: null, visibility: null, travelers: [], missingPassports: 0, request };
  const travelers = await admin
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder, first_name")
    .eq("booking_id", row.id);
  const people = (travelers.error ? [] : travelers.data || []) as {
    id: string;
    booking_id: string;
    companion_id: string | null;
    is_account_holder: boolean | null;
    first_name: string | null;
  }[];
  const [onTrip, vault] = await Promise.all([
    admin.from("crm_travel_documents").select("traveler_id, companion_id, booking_id, customer_id").eq("booking_id", row.id).eq("doc_type", "passport"),
    admin
      .from("crm_travel_documents")
      .select("traveler_id, companion_id, booking_id, customer_id")
      .eq("customer_id", row.customer_id)
      .is("booking_id", null)
      .eq("doc_type", "passport"),
  ]);
  const hits = [...(onTrip.error ? [] : onTrip.data || []), ...(vault.error ? [] : vault.data || [])] as {
    traveler_id: string | null;
    companion_id: string | null;
    booking_id: string | null;
    customer_id: string | null;
  }[];
  const party = people.map((person) => ({
    id: person.id,
    bookingId: person.booking_id,
    companionId: person.companion_id,
    holder: Boolean(person.is_account_holder),
  }));
  const missing = travelersMissingPassport(
    party,
    hits.map((hit) => ({
      travelerId: hit.traveler_id,
      companionId: hit.companion_id,
      bookingId: hit.booking_id,
      customerId: hit.customer_id,
    })),
    { [row.id]: row.customer_id }
  );
  const start = row.start_date ? formatDateFr(row.start_date) : "";
  const end = row.end_date ? formatDateFr(row.end_date) : "";
  return {
    reference: row.reference,
    place: stayDestinationLine(row) || null,
    dates: start && end ? `${start} – ${end}` : start || end || null,
    visibility: staffStayLabel(row),
    travelers: people.map((person) => (person.first_name || "").trim().split(/\s+/)[0]).filter(Boolean),
    missingPassports: missing.length,
    request,
  };
}
