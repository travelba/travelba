import type { SupabaseClient } from "@supabase/supabase-js";
import {
  departures72hEnd,
  missingDocumentHorizon,
  missingPassportCards,
  travelersMissingPassport,
  type MissingPassportCard,
  type PassportHit,
  type PassportTraveler,
} from "./admin-now";
import { stayDestinationLine } from "./stay-phrase";

export type AgencyAttentionCounts = {
  pendingMessages: number;
  conciergeRequests: number;
  departures72h: number;
  missingDocuments: number;
  documents: MissingPassportCard[];
};

const EMPTY: AgencyAttentionCounts = {
  pendingMessages: 0,
  conciergeRequests: 0,
  departures72h: 0,
  missingDocuments: 0,
  documents: [],
};

function countOf(result: { count?: number | null; error?: { message?: string } | null }) {
  return result.error ? 0 : result.count ?? 0;
}

/**
 * Compteurs du briefing. Lectures courtes (head), passeports sans numéro.
 * Une table absente compte pour zéro.
 */
export async function loadAgencyAttention(admin: SupabaseClient, today: string): Promise<AgencyAttentionCounts> {
  try {
    const horizon = departures72hEnd(today);
    const docsUntil = missingDocumentHorizon(today);
    const [followups, proposals, requests, departures, esta, uk] = await Promise.all([
      admin
        .from("crm_concierge_followups")
        .select("id", { count: "exact", head: true })
        .eq("status", "planned")
        .in("kind", ["predeparture", "checkin", "feedback"]),
      admin.from("crm_concierge_proposals").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("crm_whatsapp_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
      admin
        .from("crm_bookings")
        .select("id", { count: "exact", head: true })
        .gte("start_date", today)
        .lte("start_date", horizon)
        .neq("status", "cancelled")
        .is("archived_at", null),
      admin.from("crm_esta_notices").select("id", { count: "exact", head: true }).is("emailed_at", null),
      admin.from("crm_uk_eta_notices").select("id", { count: "exact", head: true }).is("emailed_at", null),
    ]);
    const documents = await loadMissingPassports(admin, today, docsUntil);
    return {
      pendingMessages: countOf(followups) + countOf(proposals) + countOf(esta) + countOf(uk),
      conciergeRequests: countOf(requests),
      departures72h: countOf(departures),
      missingDocuments: documents.count,
      documents: documents.cards,
    };
  } catch (err) {
    console.error("[admin/attention]", err instanceof Error ? err.message : "lecture");
    return EMPTY;
  }
}

async function loadMissingPassports(admin: SupabaseClient, today: string, until: string) {
  const bookings = await admin
    .from("crm_bookings")
    .select("id, customer_id, reference, title, destination")
    .gte("start_date", today)
    .lte("start_date", until)
    .neq("status", "cancelled")
    .is("archived_at", null)
    .order("start_date")
    .limit(80);
  if (bookings.error) return { count: 0, cards: [] as MissingPassportCard[] };
  const rows = (bookings.data || []) as {
    id: string;
    customer_id: string;
    reference: string;
    title: string | null;
    destination: string | null;
  }[];
  if (!rows.length) return { count: 0, cards: [] as MissingPassportCard[] };
  const ids = rows.map((row) => row.id);
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter(Boolean))];
  const travelers = await admin
    .from("crm_booking_travelers")
    .select("id, booking_id, companion_id, is_account_holder, first_name")
    .in("booking_id", ids);
  if (travelers.error) return { count: 0, cards: [] as MissingPassportCard[] };
  const people = (travelers.data || []) as {
    id: string;
    booking_id: string;
    companion_id: string | null;
    is_account_holder: boolean | null;
    first_name: string | null;
  }[];
  const companionIds = [...new Set(people.map((row) => row.companion_id).filter(Boolean))] as string[];
  const [onTrip, vaultCustomers, vaultCompanions] = await Promise.all([
    admin.from("crm_travel_documents").select("traveler_id, companion_id, booking_id, customer_id").in("booking_id", ids).eq("doc_type", "passport"),
    customerIds.length
      ? admin
          .from("crm_travel_documents")
          .select("traveler_id, companion_id, booking_id, customer_id")
          .in("customer_id", customerIds)
          .is("booking_id", null)
          .is("companion_id", null)
          .eq("doc_type", "passport")
      : Promise.resolve({ data: [], error: null }),
    companionIds.length
      ? admin
          .from("crm_travel_documents")
          .select("traveler_id, companion_id, booking_id, customer_id")
          .in("companion_id", companionIds)
          .is("booking_id", null)
          .eq("doc_type", "passport")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const hits = [onTrip, vaultCustomers, vaultCompanions].flatMap((result) =>
    result.error ? [] : ((result.data || []) as PassportHitSource[])
  );
  const bookingCustomer: Record<string, string> = {};
  for (const row of rows) bookingCustomer[row.id] = row.customer_id;
  const party: PassportTraveler[] = people.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    companionId: row.companion_id,
    holder: Boolean(row.is_account_holder),
  }));
  const missing = travelersMissingPassport(party, hits.map(asHit), bookingCustomer);
  const names: Record<string, string> = {};
  for (const row of people) {
    const first = (row.first_name || "").trim().split(/\s+/)[0];
    if (first) names[row.id] = first;
  }
  return {
    count: missing.length,
    cards: missingPassportCards(
      missing,
      rows.map((row) => ({ id: row.id, reference: row.reference, place: stayDestinationLine(row) || null })),
      names
    ).slice(0, 5),
  };
}

type PassportHitSource = {
  traveler_id?: string | null;
  companion_id?: string | null;
  booking_id?: string | null;
  customer_id?: string | null;
};

function asHit(row: PassportHitSource): PassportHit {
  return {
    travelerId: row.traveler_id || null,
    companionId: row.companion_id || null,
    bookingId: row.booking_id || null,
    customerId: row.customer_id || null,
  };
}
