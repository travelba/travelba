import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireStaffPage } from "@/lib/crm/auth";
import { stayToday } from "@/lib/crm/stay-moment";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  buildRefonteModel,
  maskPersonName,
  redactSensitive,
  type RefonteArrivalInput,
  type RefonteBookingInput,
  type RefonteBuildInput,
  type RefonteCheckInput,
  type RefonteConciergeInput,
  type RefonteCostInput,
  type RefonteEmailInput,
  type RefonteItemInput,
  type RefonteMailInput,
  type RefonteModel,
  type RefonteTravelerInput,
  type RefonteVisaInput,
  type RefonteWhatsappInput,
} from "@/lib/crm/refonte-preview";

export type RefonteSnapshot = RefonteModel & {
  staffFirst: string;
  staffName: string;
  staffRole: "admin" | "agent" | "partner";
};

const CONCIERGE_LABEL: Record<string, string> = {
  change: "Modification de séjour",
  cancel: "Annulation",
  payment: "Question de paiement",
  formality: "Formalité",
  chauffeur: "Chauffeur",
  quote: "Devis",
  transfer: "Transfert",
  restaurant: "Restaurant",
  help: "Demande",
};

type BookingRow = {
  id: string;
  customer_id: string;
  reference: string | null;
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  visible_to_client: boolean | null;
  archived_at: string | null;
  total_amount: number | string | null;
  currency: string | null;
  updated_at: string | null;
  status: string | null;
};

type NameRow = { id: string; first_name: string | null; last_name: string | null };

type TravelerRow = {
  id: string;
  booking_id: string;
  companion_id: string | null;
  is_account_holder: boolean | null;
  first_name: string | null;
  last_name: string | null;
};

type DocRow = {
  id: string;
  customer_id: string | null;
  companion_id: string | null;
  traveler_id: string | null;
  doc_type: string | null;
};

function chunks<T>(rows: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < rows.length; index += size) out.push(rows.slice(index, index + size));
  return out;
}

async function readRows<T>(query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>) {
  try {
    const { data, error } = await query;
    if (error) return [] as T[];
    return data || [];
  } catch {
    return [] as T[];
  }
}

function inboxLabel(label: string | null) {
  const value = (label || "").toLowerCase();
  if (value.includes("emperor")) return "Little Emperors";
  if (value.includes("expedia")) return "Expedia TAAP";
  if (value.includes("avion") || value.includes("flight")) return "Billet d’avion";
  if (value.includes("cancel")) return "Annulation";
  return "Boîte d’import";
}

function visaReason(reasons: unknown) {
  const list = Array.isArray(reasons) ? reasons.map(String) : [];
  if (list.includes("refus")) return "Refus";
  if (list.includes("message")) return "Message non parti";
  return "Formalité ouverte";
}

function hasPassport(traveler: TravelerRow, docs: DocRow[], customerId: string) {
  return docs.some((doc) => {
    if (doc.doc_type !== "passport") return false;
    if (doc.traveler_id && doc.traveler_id === traveler.id) return true;
    if (traveler.companion_id && doc.companion_id === traveler.companion_id) return true;
    if (traveler.is_account_holder && doc.customer_id === customerId && !doc.companion_id && !doc.traveler_id) return true;
    return false;
  });
}

async function loadCosts(ids: string[]): Promise<RefonteCostInput[] | null> {
  if (!ids.length) return [];
  let admin: SupabaseClient;
  try {
    admin = createServiceClient();
  } catch {
    return null;
  }
  const totals = new Map<string, number>();
  for (const slice of chunks(ids, 80)) {
    const { data, error } = await admin.from("crm_trip_costs").select("booking_id, amount_eur").in("booking_id", slice);
    if (error) return null;
    for (const row of data || []) {
      const id = String(row.booking_id || "");
      if (!id) continue;
      const amount = Number(row.amount_eur);
      if (!Number.isFinite(amount)) continue;
      totals.set(id, (totals.get(id) || 0) + amount);
    }
  }
  return [...totals.entries()].map(([bookingId, amount]) => ({ bookingId, amount }));
}

async function loadRaw(supabase: SupabaseClient, today: string): Promise<RefonteBuildInput> {
  const [active, past, archived, emails, whatsapp, requests, proposals, visas, esta, uk] = await Promise.all([
    readRows<BookingRow>(
      supabase
        .from("crm_bookings")
        .select("id, customer_id, reference, title, destination, start_date, end_date, visible_to_client, archived_at, total_amount, currency, updated_at, status")
        .is("archived_at", null)
        .neq("status", "cancelled")
        .or(`end_date.gte.${today},end_date.is.null`)
        .order("start_date", { ascending: true })
        .limit(160)
    ),
    readRows<BookingRow>(
      supabase
        .from("crm_bookings")
        .select("id, customer_id, reference, title, destination, start_date, end_date, visible_to_client, archived_at, total_amount, currency, updated_at, status")
        .is("archived_at", null)
        .neq("status", "cancelled")
        .lt("end_date", today)
        .order("end_date", { ascending: false })
        .limit(24)
    ),
    readRows<BookingRow>(
      supabase
        .from("crm_bookings")
        .select("id, customer_id, reference, title, destination, start_date, end_date, visible_to_client, archived_at, total_amount, currency, updated_at, status")
        .not("archived_at", "is", null)
        .order("updated_at", { ascending: false })
        .limit(24)
    ),
    readRows<{ id: string; subject: string | null; label: string | null; received_at: string | null; status: string | null; suggested_booking_id: string | null; created_booking_id: string | null }>(
      supabase
        .from("crm_email_ingest")
        .select("id, subject, label, received_at, status, suggested_booking_id, created_booking_id")
        .in("status", ["received", "parsed", "matched", "error", "attached"])
        .order("received_at", { ascending: false })
        .limit(40)
    ),
    readRows<{ id: string; customer_id: string | null; booking_id: string | null; direction: string | null; body: string | null; created_at: string | null }>(
      supabase
        .from("crm_whatsapp_messages")
        .select("id, customer_id, booking_id, direction, body, created_at")
        .order("created_at", { ascending: false })
        .limit(60)
    ),
    readRows<{ id: string; customer_id: string | null; booking_id: string | null; kind: string | null; created_at: string | null }>(
      supabase
        .from("crm_whatsapp_requests")
        .select("id, customer_id, booking_id, kind, created_at")
        .gte("created_at", new Date(Date.now() - 21 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(30)
    ),
    readRows<{ id: string; customer_id: string | null; booking_id: string | null; kind: string | null; created_at: string | null }>(
      supabase
        .from("crm_concierge_proposals")
        .select("id, customer_id, booking_id, kind, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20)
    ),
    readRows<{ booking_id: string; reasons: unknown }>(
      supabase.from("crm_visa_tasks").select("booking_id, reasons").is("done_at", null).limit(40)
    ),
    readRows<{ id: string; booking_id: string; traveler_id: string; status: string | null }>(
      supabase
        .from("crm_esta_checks")
        .select("id, booking_id, traveler_id, status")
        .not("status", "in", '("approuve","non_concerne")')
        .limit(40)
    ),
    readRows<{ id: string; booking_id: string; traveler_id: string; status: string | null }>(
      supabase
        .from("crm_uk_eta_checks")
        .select("id, booking_id, traveler_id, status")
        .not("status", "in", '("approuve","non_concerne")')
        .limit(40)
    ),
  ]);

  const bookingRows = [...active, ...past, ...archived].filter((row, index, list) => list.findIndex((item) => item.id === row.id) === index);
  const bookingIds = bookingRows.map((row) => row.id);
  const customerIds = [...new Set(bookingRows.map((row) => row.customer_id).filter(Boolean))];

  const customers: NameRow[] = [];
  const companions: NameRow[] = [];
  const travelers: TravelerRow[] = [];
  const docs: DocRow[] = [];
  const items: RefonteItemInput[] = [];
  const arrivals: RefonteArrivalInput[] = [];
  const mails: RefonteMailInput[] = [];
  const balances: { customerId: string; balance: number }[] = [];
  const cardCounts = new Map<string, number>();

  if (customerIds.length) {
    for (const slice of chunks(customerIds, 80)) {
      customers.push(
        ...(await readRows<NameRow>(supabase.from("crm_customers").select("id, first_name, last_name").in("id", slice)))
      );
      balances.push(
        ...(
          await readRows<{ customer_id: string; balance: number | string | null; currency: string | null }>(
            supabase.from("crm_customer_balances").select("customer_id, balance, currency").in("customer_id", slice)
          )
        )
          .filter((row) => !row.currency || row.currency === "EUR")
          .map((row) => ({ customerId: row.customer_id, balance: Number(row.balance) || 0 }))
      );
    }
  }

  if (bookingIds.length) {
    for (const slice of chunks(bookingIds, 80)) {
      travelers.push(
        ...(await readRows<TravelerRow>(
          supabase
            .from("crm_booking_travelers")
            .select("id, booking_id, companion_id, is_account_holder, first_name, last_name")
            .in("booking_id", slice)
        ))
      );
      const itemRows = await readRows<{
        id: string;
        booking_id: string;
        kind: string | null;
        title: string | null;
        confirmation_ref: string | null;
        start_at: string | null;
        end_at: string | null;
        lifecycle: string | null;
      }>(
        supabase
          .from("crm_booking_items")
          .select("id, booking_id, kind, title, confirmation_ref, start_at, end_at, lifecycle")
          .in("booking_id", slice)
      );
      for (const row of itemRows) {
        items.push({
          id: row.id,
          bookingId: row.booking_id,
          kind: row.kind || "other",
          title: row.title || "",
          start: row.start_at,
          end: row.end_at,
          confirmed: Boolean((row.confirmation_ref || "").trim()),
          active: row.lifecycle !== "superseded" && row.lifecycle !== "cancelled",
        });
      }
      const arrivalRows = await readRows<{ id: string; booking_id: string; booking_item_id: string | null; status: string | null }>(
        supabase.from("crm_hotel_arrivals").select("id, booking_id, booking_item_id, status").in("booking_id", slice)
      );
      for (const row of arrivalRows) {
        const item = items.find((entry) => entry.id === row.booking_item_id);
        arrivals.push({
          id: row.id,
          bookingId: row.booking_id,
          itemTitle: item?.title || "Hôtel",
          status: row.status || "pending",
        });
      }
      const mailRows = await readRows<{ id: string; booking_id: string; subject: string | null; sent_at: string | null; replied_at: string | null; created_at: string | null }>(
        supabase
          .from("crm_hotel_messages")
          .select("id, booking_id, subject, sent_at, replied_at, created_at")
          .in("booking_id", slice)
          .order("created_at", { ascending: false })
          .limit(40)
      );
      for (const row of mailRows) {
        mails.push({
          id: row.id,
          at: row.replied_at || row.sent_at || row.created_at,
          bookingId: row.booking_id,
          preview: row.subject || "Courrier hôtel",
          waiting: Boolean(row.sent_at) && !row.replied_at,
        });
      }
      const cards = await readRows<{ booking_id: string }>(
        supabase.from("crm_booking_cards").select("booking_id").in("booking_id", slice)
      );
      for (const card of cards) cardCounts.set(card.booking_id, (cardCounts.get(card.booking_id) || 0) + 1);
    }
  }

  const companionIds = [...new Set(travelers.map((row) => row.companion_id).filter((id): id is string => Boolean(id)))];
  for (const slice of chunks(companionIds, 80)) {
    companions.push(
      ...(await readRows<NameRow>(supabase.from("crm_travel_companions").select("id, first_name, last_name").in("id", slice)))
    );
  }
  if (customerIds.length) {
    for (const slice of chunks(customerIds, 80)) {
      docs.push(
        ...(await readRows<DocRow>(
          supabase
            .from("crm_travel_documents")
            .select("id, customer_id, companion_id, traveler_id, doc_type")
            .in("customer_id", slice)
            .in("doc_type", ["passport", "eta", "visa"])
        ))
      );
    }
  }

  const customerById = new Map(customers.map((row) => [row.id, row]));
  const companionById = new Map(companions.map((row) => [row.id, row]));
  const fullNames: string[] = [];
  const lastNames: string[] = [];
  function remember(first: string | null | undefined, last: string | null | undefined) {
    const given = (first || "").trim();
    const family = (last || "").trim();
    if (given && family) {
      fullNames.push(`${given} ${family}`);
      fullNames.push(`${family} ${given}`);
    }
    if (given.includes(" ")) fullNames.push(given);
    const embedded = given.split(/\s+/).slice(1).join(" ");
    if (embedded.length >= 3) lastNames.push(embedded);
    if (family.length >= 3) lastNames.push(family);
  }
  for (const row of customers) remember(row.first_name, row.last_name);
  for (const row of companions) remember(row.first_name, row.last_name);
  for (const row of travelers) remember(row.first_name, row.last_name);
  const names = { full: fullNames, last: lastNames };
  const places = { full: fullNames };

  const bookings: RefonteBookingInput[] = bookingRows.map((row) => {
    const person = customerById.get(row.customer_id);
    return {
      id: row.id,
      reference: row.reference || "Dossier",
      title: redactSensitive(row.title, places),
      destination: redactSensitive(row.destination, places),
      customerId: row.customer_id,
      customer: maskPersonName(person?.first_name, person?.last_name),
      start: row.start_date,
      end: row.end_date,
      visible: row.visible_to_client === true,
      archived: Boolean(row.archived_at),
      sale: Number(row.total_amount) || 0,
      currency: row.currency || "EUR",
      updatedAt: row.updated_at || "",
      cardCount: cardCounts.get(row.id) || 0,
    };
  });

  const travelerInputs: RefonteTravelerInput[] = travelers.map((row) => {
    const booking = bookingRows.find((item) => item.id === row.booking_id);
    const companion = row.companion_id ? companionById.get(row.companion_id) : undefined;
    const customer = booking ? customerById.get(booking.customer_id) : undefined;
    const first = row.first_name || companion?.first_name || (row.is_account_holder ? customer?.first_name : "") || "";
    const last = row.last_name || companion?.last_name || (row.is_account_holder ? customer?.last_name : "") || "";
    return {
      id: row.id,
      bookingId: row.booking_id,
      label: maskPersonName(first, last),
      hasPassport: hasPassport(row, docs, booking?.customer_id || ""),
    };
  });

  const redactedItems = items.map((item) => ({ ...item, title: redactSensitive(item.title, places) }));
  const redactedArrivals = arrivals.map((row) => ({ ...row, itemTitle: redactSensitive(row.itemTitle, places) }));

  const emailInputs: RefonteEmailInput[] = emails.map((row) => ({
    id: row.id,
    at: row.received_at,
    label: inboxLabel(row.label),
    preview: redactSensitive(row.subject, names).slice(0, 140) || "Pièce à relire",
    bookingId: row.created_booking_id || row.suggested_booking_id,
    waiting: row.status !== "attached",
  }));

  const mailInputs = mails.map((row) => ({ ...row, preview: redactSensitive(row.preview, names).slice(0, 140) }));

  const whatsappInputs: RefonteWhatsappInput[] = whatsapp
    .filter((row) => row.customer_id && row.created_at)
    .map((row) => ({
      id: row.id,
      at: row.created_at || "",
      customerId: row.customer_id || "",
      bookingId: row.booking_id,
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      preview: redactSensitive(row.body, names).slice(0, 160) || "Message",
    }));

  const concierge: RefonteConciergeInput[] = [
    ...requests.map((row) => ({
      id: row.id,
      at: row.created_at || "",
      customerId: row.customer_id || "",
      bookingId: row.booking_id,
      label: CONCIERGE_LABEL[row.kind || ""] || "Demande",
    })),
    ...proposals.map((row) => ({
      id: row.id,
      at: row.created_at || "",
      customerId: row.customer_id || "",
      bookingId: row.booking_id,
      label: CONCIERGE_LABEL[row.kind || ""] || "Demande",
    })),
  ].filter((row) => row.customerId || row.bookingId);

  const checks: RefonteCheckInput[] = [
    ...esta.map((row) => ({ id: row.id, bookingId: row.booking_id, travelerId: row.traveler_id, program: "ESTA" as const, status: row.status || "a_verifier" })),
    ...uk.map((row) => ({ id: row.id, bookingId: row.booking_id, travelerId: row.traveler_id, program: "ETA" as const, status: row.status || "a_verifier" })),
  ];

  const visaInputs: RefonteVisaInput[] = visas.map((row) => ({ bookingId: row.booking_id, reason: visaReason(row.reasons) }));
  const costs = await loadCosts(bookingIds);

  return {
    bookings,
    travelers: travelerInputs,
    items: redactedItems,
    checks,
    visas: visaInputs,
    arrivals: redactedArrivals,
    emails: emailInputs,
    mails: mailInputs,
    whatsapp: whatsappInputs,
    concierge,
    costs,
    balances,
  };
}

export const loadRefonteSnapshot = cache(async (): Promise<RefonteSnapshot> => {
  const { redirect } = await import("next/navigation");
  const { supabase, staff } = await requireStaffPage();
  if (staff.role === "partner") redirect("/admin/little-emperors");
  const today = stayToday();
  const raw = await loadRaw(supabase, today);
  const model = buildRefonteModel(raw, today);
  const staffParts = (staff.full_name || "").trim().split(/\s+/).filter(Boolean);
  return {
    ...model,
    staffFirst: staffParts[0] || "l’agence",
    staffName: maskPersonName(staffParts[0] || "", staffParts.slice(1).join(" ")),
    staffRole: staff.role,
  };
});
