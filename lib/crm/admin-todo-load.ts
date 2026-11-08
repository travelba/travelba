import type { SupabaseClient } from "@supabase/supabase-js";
import { addIsoDays } from "@/lib/crm/dates";
import {
  activeStayItem,
  countOpenCheckins,
  countTripLetters,
  countVisaWork,
  tripStillOpen,
  type TripLetter,
} from "@/lib/crm/admin-todo";
import { flightCheckinViews, isBoardingPassDocument, type StoredFlightCheckin } from "@/lib/crm/online-checkin";
import { stayToday } from "@/lib/crm/stay-moment";
import type { CrmBookingItem } from "@/lib/crm/types";

export type AccueilTodoCounts = {
  paymentLinks: number;
  visas: number;
  checkins: number;
};

type LetterRow = {
  kind: string | null;
  status: string | null;
  due_on: string | null;
  booking_id: string | null;
  booking_item_id: string | null;
};

type StayRow = {
  id: string;
  status: string | null;
  archived_at: string | null;
  end_date: string | null;
};

type ItemRow = { id: string; lifecycle: string | null };

type VisaRequestRow = {
  booking_id: string | null;
  status: string | null;
  accepted_at: string | null;
};

type IdRow = { booking_id: string | null };

type NoticeRow = { booking_id: string | null; kind: string | null };

type FlightRow = {
  id: string;
  booking_id: string | null;
  kind: string | null;
  title: string | null;
  supplier: string | null;
  start_at: string | null;
  details: Record<string, unknown> | null;
  lifecycle: string | null;
  source_document_id: string | null;
};

type PassRow = {
  id: string;
  kind: string | null;
  file_name: string | null;
  booking_item_id: string | null;
  booking_id: string | null;
};

type CheckinRow = { booking_item_id: string | null; status: string | null; actor: string | null };

function quiet(scope: string, error: { code?: string | null } | null) {
  if (error) console.error(`[accueil/todo] ${scope}`, error.code || "lecture");
}

async function inSlices<T>(ids: string[], load: (slice: string[]) => Promise<T[]>) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: T[] = [];
  for (let index = 0; index < unique.length; index += 80) {
    out.push(...(await load(unique.slice(index, index + 80))));
  }
  return out;
}

function departureStillAhead(startAt: string | null, now: Date) {
  const ms = startAt ? Date.parse(startAt) : Number.NaN;
  return Number.isFinite(ms) && ms > now.getTime();
}

/**
 * Compteurs de l’accueil : liens de paiement hôtel, visas, enregistrements.
 * Lectures seules, sur les séjours encore ouverts. Une lecture en échec compte zéro
 * pour cette file, les autres restent.
 */
export async function loadAccueilTodoCounts(
  supabase: SupabaseClient,
  today = stayToday(),
  now = new Date()
): Promise<AccueilTodoCounts> {
  const horizon = `${addIsoDays(today, 31)}T23:59:59`;
  const [dueLetters, waitingLetters, requests, tasks, esta, uk, flights] = await Promise.all([
    supabase
      .from("crm_hotel_requests")
      .select("kind, status, due_on, booking_id, booking_item_id")
      .in("kind", ["payment_link", "precheckin"])
      .in("status", ["due", "follow_up"])
      .limit(1000),
    supabase
      .from("crm_hotel_requests")
      .select("kind, status, due_on, booking_id, booking_item_id")
      .in("kind", ["payment_link", "precheckin"])
      .in("status", ["waiting", "draft"])
      .lte("due_on", today)
      .limit(1000),
    supabase.from("crm_visa_requests").select("booking_id, status, accepted_at").neq("status", "piece").limit(500),
    supabase.from("crm_visa_tasks").select("booking_id").is("done_at", null).limit(500),
    supabase.from("crm_esta_notices").select("booking_id, kind").is("seen_at", null).limit(500),
    supabase.from("crm_uk_eta_notices").select("booking_id, kind").is("seen_at", null).limit(500),
    supabase
      .from("crm_booking_items")
      .select("id, booking_id, kind, title, supplier, start_at, details, lifecycle, source_document_id")
      .eq("kind", "flight")
      .gte("start_at", today)
      .lte("start_at", horizon)
      .limit(800),
  ]);
  quiet("lettres", dueLetters.error);
  quiet("lettres-echeance", waitingLetters.error);
  quiet("visas", requests.error);
  quiet("taches-visa", tasks.error);
  quiet("esta", esta.error);
  quiet("uk-eta", uk.error);
  quiet("vols", flights.error);

  const letters = [
    ...((dueLetters.error ? [] : dueLetters.data || []) as LetterRow[]),
    ...((waitingLetters.error ? [] : waitingLetters.data || []) as LetterRow[]),
  ];
  const visaRequests = (requests.error ? [] : requests.data || []) as VisaRequestRow[];
  const visaTasks = (tasks.error ? [] : tasks.data || []) as IdRow[];
  const notices = [
    ...((esta.error ? [] : esta.data || []) as NoticeRow[]),
    ...((uk.error ? [] : uk.data || []) as NoticeRow[]),
  ];
  const flightRows = (flights.error ? [] : flights.data || []) as FlightRow[];

  const bookingIds = [
    ...letters.map((row) => row.booking_id || ""),
    ...visaRequests.map((row) => row.booking_id || ""),
    ...visaTasks.map((row) => row.booking_id || ""),
    ...notices.map((row) => row.booking_id || ""),
    ...flightRows.map((row) => row.booking_id || ""),
  ];
  const itemIds = letters.map((row) => row.booking_item_id || "");
  const flightBookingIds = flightRows.map((row) => row.booking_id || "");

  const [stays, items, passes, checkins] = await Promise.all([
    inSlices(bookingIds, async (slice) => {
      const { data, error } = await supabase
        .from("crm_bookings")
        .select("id, status, archived_at, end_date")
        .in("id", slice);
      quiet("sejours", error);
      return (error ? [] : data || []) as StayRow[];
    }),
    inSlices(itemIds, async (slice) => {
      const { data, error } = await supabase.from("crm_booking_items").select("id, lifecycle").in("id", slice);
      quiet("etapes", error);
      return (error ? [] : data || []) as ItemRow[];
    }),
    inSlices(flightBookingIds, async (slice) => {
      const { data, error } = await supabase
        .from("crm_booking_documents")
        .select("id, kind, file_name, booking_item_id, booking_id")
        .in("booking_id", slice);
      quiet("cartes-embarquement", error);
      return (error ? [] : data || []) as PassRow[];
    }),
    inSlices(flightBookingIds, async (slice) => {
      const { data, error } = await supabase
        .from("crm_flight_checkins")
        .select("booking_item_id, status, actor")
        .in("booking_id", slice);
      quiet("enregistrements", error);
      return (error ? [] : data || []) as CheckinRow[];
    }),
  ]);

  const live = new Map(stays.map((row) => [row.id, tripStillOpen(row, today)]));
  const itemActive = new Map(items.map((row) => [row.id, activeStayItem(row.lifecycle)]));
  const isLive = (id: string | null) => Boolean(id && live.get(id));

  const tripLetters: TripLetter[] = letters.map((row) => ({
    kind: row.kind || "",
    status: row.status || "",
    dueOn: row.due_on,
    live: isLive(row.booking_id),
    itemActive: Boolean(row.booking_item_id && itemActive.get(row.booking_item_id)),
  }));

  const visas = countVisaWork({
    requests: visaRequests.map((row) => ({
      status: row.status,
      acceptedAt: row.accepted_at,
      live: isLive(row.booking_id),
    })),
    tasks: visaTasks.map((row) => ({ live: isLive(row.booking_id), open: true })),
    notices: notices.map((row) => ({ kind: row.kind, live: isLive(row.booking_id) })),
  });

  const passesByBooking = new Map<string, PassRow[]>();
  for (const pass of passes.filter((row) => isBoardingPassDocument(row))) {
    const id = pass.booking_id || "";
    const list = passesByBooking.get(id) || [];
    list.push(pass);
    passesByBooking.set(id, list);
  }
  const checkinsByItem = new Map<string, StoredFlightCheckin>();
  for (const row of checkins) {
    if (!row.booking_item_id) continue;
    checkinsByItem.set(row.booking_item_id, {
      booking_item_id: row.booking_item_id,
      status: row.status,
      actor: row.actor,
    });
  }
  const flightsByBooking = new Map<string, FlightRow[]>();
  for (const flight of flightRows) {
    if (!flight.booking_id || !isLive(flight.booking_id) || !departureStillAhead(flight.start_at, now)) continue;
    const list = flightsByBooking.get(flight.booking_id) || [];
    list.push(flight);
    flightsByBooking.set(flight.booking_id, list);
  }
  let openFlights = 0;
  for (const [bookingId, rows] of flightsByBooking) {
    const views = flightCheckinViews({
      items: rows.map(
        (row) =>
          ({
            id: row.id,
            kind: "flight",
            title: row.title,
            supplier: row.supplier,
            start_at: row.start_at,
            details: row.details,
            lifecycle: row.lifecycle,
            source_document_id: row.source_document_id,
          }) as CrmBookingItem
      ),
      documents: (passesByBooking.get(bookingId) || []).map((row) => ({
        id: row.id,
        kind: row.kind || "",
        file_name: row.file_name,
        booking_item_id: row.booking_item_id,
      })),
      rows: rows.flatMap((row) => {
        const stored = checkinsByItem.get(row.id);
        return stored ? [stored] : [];
      }),
      now,
    });
    openFlights += countOpenCheckins(views);
  }

  return {
    paymentLinks: countTripLetters(tripLetters, "payment_link", today),
    visas,
    checkins: openFlights + countTripLetters(tripLetters, "precheckin", today),
  };
}
