import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/admin";
import { formatDateFr } from "@/lib/crm/money";
import { staffStayLabel } from "@/lib/crm/staff-stay";
import { stayDestinationLine } from "@/lib/crm/stay-phrase";
import { travelersMissingPassport } from "@/lib/crm/admin-now";
import {
  foldThreads,
  pauseStillActive,
  requestKindLabel,
  threadKey,
  type InboxDossier,
  type InboxMessage,
} from "@/lib/crm/whatsapp-inbox";

type RawMessage = {
  id: string;
  customer_id: string | null;
  booking_id: string | null;
  direction: string;
  body: string;
  status: string | null;
  template_key?: string | null;
  created_at: string;
  phone?: string | null;
  author_staff_id?: string | null;
  media_path?: string | null;
  tools?: string[] | null;
  concierge_mark?: string | null;
};

const LIST = "id, phone, customer_id, booking_id, direction, body, status, created_at";
const RICH =
  "id, customer_id, booking_id, direction, body, status, template_key, created_at, phone, author_staff_id, media_path, tools, concierge_mark";

export type WhatsappIndex = {
  threads: ReturnType<typeof foldThreads>;
  messages: InboxMessage[];
};

const EMPTY: WhatsappIndex = { threads: [], messages: [] };

/** Une lecture par requête : le menu, le dock et la file partagent le même index. */
export const loadWhatsappIndex = cache(async (): Promise<WhatsappIndex> => {
  try {
    const admin = createServiceClient();
    return await loadIndex(admin);
  } catch (err) {
    console.error("[whatsapp-index]", err instanceof Error ? err.message : "lecture");
    return EMPTY;
  }
});

async function loadIndex(admin: ReturnType<typeof createServiceClient>): Promise<WhatsappIndex> {
  const loaded = await admin.from("crm_whatsapp_messages").select(LIST).order("created_at", { ascending: false }).limit(220);
  if (loaded.error) return EMPTY;
  const rows = (loaded.data || []) as RawMessage[];
  const folded = await decorate(admin, rows, false);
  return folded;
}

/** Contexte du dossier pour le fil ouvert. Aucun numéro de pièce. */
export async function loadThreadDossier(
  bookingId: string | null,
  customerId: string | null,
  phone?: string | null
): Promise<InboxDossier | null> {
  if (!bookingId) return null;
  try {
    const admin = createServiceClient();
    const booking = await admin
      .from("crm_bookings")
      .select("id, customer_id, reference, title, destination, start_date, end_date, visible_to_client, archived_at")
      .eq("id", bookingId)
      .maybeSingle();
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
    if (!row || booking.error) return null;
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
    const [onTrip, vault, requests] = await Promise.all([
      admin.from("crm_travel_documents").select("traveler_id, companion_id, booking_id, customer_id").eq("booking_id", row.id).eq("doc_type", "passport"),
      admin
        .from("crm_travel_documents")
        .select("traveler_id, companion_id, booking_id, customer_id")
        .eq("customer_id", row.customer_id || customerId || "")
        .is("booking_id", null)
        .eq("doc_type", "passport"),
      phone
        ? admin.from("crm_whatsapp_requests").select("kind").eq("status", "open").eq("phone", phone).limit(1)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const hits = [...(onTrip.error ? [] : onTrip.data || []), ...(vault.error ? [] : vault.data || [])] as {
      traveler_id: string | null;
      companion_id: string | null;
      booking_id: string | null;
      customer_id: string | null;
    }[];
    const missing = travelersMissingPassport(
      people.map((person) => ({
        id: person.id,
        bookingId: person.booking_id,
        companionId: person.companion_id,
        holder: Boolean(person.is_account_holder),
      })),
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
    const openKind = ((requests.error ? [] : requests.data || []) as { kind?: string | null }[])[0]?.kind;
    return {
      reference: row.reference,
      place: stayDestinationLine(row) || null,
      dates: start && end ? `${start} – ${end}` : start || end || null,
      visibility: staffStayLabel(row),
      travelers: people.map((person) => (person.first_name || "").trim().split(/\s+/)[0]).filter(Boolean),
      missingPassports: missing.length,
      request: requestKindLabel(openKind),
    };
  } catch (err) {
    console.error("[whatsapp-dossier]", err instanceof Error ? err.message : "lecture");
    return null;
  }
}

/** Messages du fil ouvert seulement, avec auteur, pièce, outils et note. */
export async function loadThreadMessages(key: string): Promise<InboxMessage[]> {
  const clean = key.trim();
  if (!clean || clean.length > 40) return [];
  try {
    const admin = createServiceClient();
    const phone = clean.startsWith("+") ? clean : "";
    let query = admin.from("crm_whatsapp_messages").select(RICH).order("created_at", { ascending: false }).limit(80);
    query = phone ? query.eq("phone", phone) : query.eq("customer_id", clean);
    const loaded = await query;
    if (loaded.error) {
      const fallback = phone
        ? admin.from("crm_whatsapp_messages").select("id, customer_id, booking_id, direction, body, status, template_key, created_at").eq("phone", phone)
        : admin.from("crm_whatsapp_messages").select("id, customer_id, booking_id, direction, body, status, template_key, created_at").eq("customer_id", clean);
      const again = await fallback.order("created_at", { ascending: false }).limit(80);
      if (again.error) return [];
      const decorated = await decorate(admin, (again.data || []) as RawMessage[], true);
      return decorated.messages.filter((row) => threadKey(row) === clean);
    }
    const decorated = await decorate(admin, (loaded.data || []) as RawMessage[], true);
    return decorated.messages.filter((row) => threadKey(row) === clean || row.phone === clean || row.customerId === clean);
  } catch (err) {
    console.error("[whatsapp-fil]", err instanceof Error ? err.message : "lecture");
    return [];
  }
}

async function decorate(admin: ReturnType<typeof createServiceClient>, rows: RawMessage[], rich: boolean) {
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))] as string[];
  const bookingIds = [...new Set(rows.map((row) => row.booking_id).filter(Boolean))] as string[];
  const staffIds = [...new Set(rows.map((row) => row.author_staff_id).filter(Boolean))] as string[];
  const [customers, bookings, staff, threads, requests] = await Promise.all([
    customerIds.length
      ? admin.from("crm_customers").select("id, first_name, last_name, phone").in("id", customerIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin.from("crm_bookings").select("id, reference, title, destination").in("id", bookingIds)
      : Promise.resolve({ data: [] }),
    rich && staffIds.length ? admin.from("crm_staff").select("id, full_name").in("id", staffIds) : Promise.resolve({ data: [] }),
    admin.from("crm_whatsapp_threads").select("phone, paused_until, staff_read_at, customer_id"),
    admin.from("crm_whatsapp_requests").select("id, phone, message_id, kind, status").eq("status", "open"),
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
  const openRequests = ((requests.error ? [] : requests.data || []) as {
    id: string;
    phone: string | null;
    message_id: string | null;
    kind?: string | null;
  }[]);
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
      templateKey: row.template_key || null,
      authorName: row.author_staff_id ? agents.get(row.author_staff_id) || "L’agence" : null,
      mediaPath: row.media_path || null,
      tools: Array.isArray(row.tools) ? row.tools : [],
      requestId: requestByMessage.get(row.id) || null,
      conciergeMark: row.concierge_mark === "good" || row.concierge_mark === "bad" ? row.concierge_mark : null,
    };
  });
  const threadRows = threads.error
    ? []
    : ((threads.data || []) as { phone: string; paused_until: string | null; staff_read_at?: string | null }[]);
  const paused = threadRows.filter((row) => pauseStillActive(row.paused_until)).map((row) => row.phone);
  const readAt: Record<string, string | null> = {};
  for (const row of threadRows) {
    if (row.staff_read_at) readAt[row.phone] = row.staff_read_at;
  }
  const escalated = openRequests.map((row) => row.phone).filter(Boolean) as string[];
  return { threads: foldThreads(messages, { paused, escalated, readAt }), messages, requests: openRequests };
}
