import { findFlightCard, flightNumbersAlign, statedTicketCount, type MatchableItem } from "@/lib/crm/item-match";
import {
  mergeBookingSuggestions,
  suggestBookingByReference,
  suggestBookingByTraveler,
  TRAVELER_DATES_REASON,
  SAME_TRIP_REASON,
  type TravelerName,
  type TripBooking,
} from "@/lib/crm/email-match";
import type { BookingExtract } from "@/lib/crm/ingest-types";
import { isPlaceholderReference } from "@/lib/crm/ingest-samples";

type FlightExtractItem = MatchableItem & {
  amount?: number | null;
};

type FlightExtract = {
  document_status?: string | null;
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  currency?: string | null;
  customer_email?: string | null;
  customer_first_name?: string | null;
  customer_last_name?: string | null;
  notes_internal?: string | null;
  notes_client?: string | null;
  items?: FlightExtractItem[] | null;
  travelers?: { first_name?: string | null; last_name?: string | null; ticket_last4?: string | null }[] | null;
};

export type FlightDepositLine = { vol: string; date: string; titre: string };

export type FlightDepositCard = {
  pnr: string;
  lignes: FlightDepositLine[];
  prix_vente: 0;
  cachee: true;
  cout: number | null;
};

export type FlightAutoCandidate = {
  booking_id?: string | null;
  customer_id?: string | null;
  reason?: string | null;
  score?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  covers_passengers?: boolean;
};

const DAY_MS = 86_400_000;
export const MAX_TRAVELER_DOSSIER_DAYS = 60;
export const AUTO_ATTACH_MAX_AGE_DAYS = 30;

function dayStamp(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const [year, month, day] = match[1].split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Un mail en file depuis plus de 30 jours n’est pas déposé tout seul. */
export function receivedTooOldForAutoAttach(receivedAt: string | null | undefined, now = new Date()) {
  const received = dayStamp(receivedAt);
  if (received == null) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return (today - received) / DAY_MS > AUTO_ATTACH_MAX_AGE_DAYS;
}

export function autoAttachNotBefore(now = new Date()) {
  return new Date(now.getTime() - AUTO_ATTACH_MAX_AGE_DAYS * DAY_MS).toISOString();
}

export function dossierSpansTooLong(start: string | null | undefined, end: string | null | undefined) {
  const left = dayStamp(start);
  const right = dayStamp(end);
  if (left == null || right == null) return false;
  return Math.abs(right - left) / DAY_MS > MAX_TRAVELER_DOSSIER_DAYS;
}

export function flightsDatedBeforeMail(extract: FlightExtract | null | undefined, receivedAt: string | null | undefined) {
  const received = dayStamp(receivedAt);
  if (received == null) return false;
  return (extract?.items || []).some((item) => {
    if ((item.kind || "") !== "flight") return false;
    const when = dayStamp(item.start_at);
    return when != null && when < received;
  });
}

export function hotelDatedBeforeMail(extract: FlightExtract | null | undefined, receivedAt: string | null | undefined) {
  const received = dayStamp(receivedAt);
  if (received == null) return false;
  return (extract?.items || []).some((item) => {
    if ((item.kind || "") !== "hotel") return false;
    const when = dayStamp(item.start_at);
    return when != null && when < received;
  });
}

export function extractHasPlaceholderRef(extract: FlightExtract | null | undefined) {
  return (extract?.items || []).some((item) => {
    if (isPlaceholderReference(item.confirmation_ref)) return true;
    const pnr = item.details?.pnr;
    return typeof pnr === "string" && isPlaceholderReference(pnr);
  });
}

export type FlightAutoDecision = {
  bookingId: string;
  customerId: string;
  reason: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function detail(item: MatchableItem | null | undefined, key: string) {
  return text(item?.details?.[key]);
}

function day(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

export function isUsableFlight(item: MatchableItem | null | undefined) {
  if ((item?.kind || "") !== "flight") return false;
  return Boolean(detail(item, "flight_number") && day(item?.start_at));
}

export function hasUsableFlight(extract: FlightExtract | null | undefined) {
  return (extract?.items || []).some((item) => isUsableFlight(item));
}

function pnrOf(item: MatchableItem) {
  const raw = text(item.confirmation_ref) || detail(item, "pnr");
  return raw.toUpperCase() || "";
}

function printedCost(item: MatchableItem) {
  const raw = item.details?.document_amount;
  const amount = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function passengerKey(person: { first_name?: string | null; last_name?: string | null }) {
  return `${text(person.first_name).toLocaleLowerCase("fr")}|${text(person.last_name).toLocaleLowerCase("fr")}`;
}

type FlightPerson = { first_name?: string | null; last_name?: string | null; ticket_last4?: string | null };

function namedPeople(value: unknown): FlightPerson[] {
  if (!Array.isArray(value)) return [];
  const rows: FlightPerson[] = [];
  const seen = new Set<string>();
  for (const person of value) {
    if (!person || typeof person !== "object") continue;
    const row = person as FlightPerson;
    if (!text(row.first_name) && !text(row.last_name)) continue;
    const key = passengerKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }
  return rows;
}

function personLabel(person: FlightPerson) {
  return [text(person.first_name), text(person.last_name)].filter(Boolean).join(" ");
}

/**
 * Une confirmation qui liste moins de passagers, ou qui nomme un passager retiré,
 * remplace la liste. Un billet d’un seul passager s’ajoute.
 */
export function reviseFlightParty(
  current: FlightPerson[],
  incoming: FlightPerson[],
  removedNamed: FlightPerson[] = []
) {
  const drop = new Set(removedNamed.map(passengerKey).filter((key) => key !== "|"));
  if (drop.size) {
    const kept = current.filter((person) => !drop.has(passengerKey(person)));
    for (const person of incoming) {
      if (drop.has(passengerKey(person))) continue;
      if (!kept.some((row) => passengerKey(row) === passengerKey(person))) kept.push(person);
    }
    return {
      passengers: kept,
      revised: true,
      removed: current.filter((person) => drop.has(passengerKey(person))),
    };
  }
  if (incoming.length >= 2 && current.length > incoming.length) {
    const next = new Set(incoming.map(passengerKey));
    const removed = current.filter((person) => !next.has(passengerKey(person)));
    if (removed.length) return { passengers: incoming, revised: true, removed };
  }
  const passengers = [...current];
  for (const person of incoming) {
    if (!passengers.some((row) => passengerKey(row) === passengerKey(person))) passengers.push(person);
  }
  return { passengers, revised: false, removed: [] as FlightPerson[] };
}

export function partyReviewReason(removed: FlightPerson[], refund: number | null) {
  const names = removed.map(personLabel).filter(Boolean);
  const who = names.length
    ? `${names.join(", ")} ${names.length > 1 ? "ont été retirés" : "a été retiré"} de ce trajet.`
    : "La liste des passagers a changé.";
  const money =
    refund == null
      ? ""
      : ` Remboursement ${refund.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €.`;
  return `${who}${money} Le prix de vente n’a pas changé.`;
}

/** Une carte par trajet. Le PNR reste sur chaque carte. Prix de vente 0. Coût seulement s’il est imprimé. */
export function planFlightDeposit(extract: FlightExtract | null | undefined): { cartes: FlightDepositCard[] } {
  const cartes: FlightDepositCard[] = [];
  for (const item of extract?.items || []) {
    if (!isUsableFlight(item)) continue;
    cartes.push({
      pnr: pnrOf(item) || "sans référence",
      lignes: [
        {
          vol: detail(item, "flight_number"),
          date: day(item.start_at),
          titre: text(item.title) || detail(item, "flight_number"),
        },
      ],
      prix_vente: 0,
      cachee: true,
      cout: printedCost(item),
    });
  }
  return { cartes };
}

function countedTickets(item: MatchableItem, fallback: number) {
  const stated = statedTicketCount(item);
  if (stated != null) return stated;
  const passengers = item.details?.passengers;
  if (Array.isArray(passengers)) {
    const named = passengers.filter((person) => person && typeof person === "object").length;
    if (named > 0) return named;
  }
  return fallback;
}

function seenEmailIds(item: MatchableItem) {
  const raw = item.details?.ticket_email_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Le nombre de billets additionne les e-tickets du même vol, y compris ceux déjà sur la carte.
 * Un second passage du même mail ne compte pas deux fois.
 */
export function sumFlightTicketCounts<T extends FlightExtract>(
  extract: T,
  existing: MatchableItem[],
  emailId: string,
  folded: FlightExtract[] = []
): T & { document_status?: string | null } {
  const incomingItems = [...(extract.items || [])];
  for (const extra of folded) {
    if (extra === extract) continue;
    incomingItems.push(...((extra.items || []) as FlightExtractItem[]));
  }
  const travelers = [...(extract.travelers || [])];
  const seenPeople = new Set(travelers.map(passengerKey));
  for (const extra of folded) {
    for (const person of extra.travelers || []) {
      const key = passengerKey(person);
      if (!text(person.first_name) || !text(person.last_name) || seenPeople.has(key)) continue;
      seenPeople.add(key);
      travelers.push(person);
    }
  }
  const items = (extract.items || []).map((item) => {
    if (!isUsableFlight(item)) return item;
    const hit = findFlightCard(existing, item);
    const already = Boolean(hit && seenEmailIds(hit).includes(emailId));
    const extras = already
      ? []
      : folded.flatMap((extra) => extra.items || []).filter((other) => flightSameSegment(item, other));
    const previous = hit ? countedTickets(hit, 0) : 0;
    const incoming = already
      ? 0
      : countedTickets(item, 1) + extras.reduce((sum, other) => sum + countedTickets(other, 1), 0);
    const ids = new Set([...(hit ? seenEmailIds(hit) : []), emailId]);
    const currentPeople = namedPeople(hit?.details?.passengers);
    const incomingPeople = [
      ...namedPeople(item.details?.passengers),
      ...extras.flatMap((extra) => namedPeople(extra.details?.passengers)),
    ];
    const removedNamed = namedPeople(item.details?.removed_passengers);
    const revision = reviseFlightParty(currentPeople, incomingPeople, removedNamed);
    const passengers = revision.passengers;
    const refundRaw = item.details?.refund_amount;
    const refund = typeof refundRaw === "number" && Number.isFinite(refundRaw) && refundRaw > 0 ? refundRaw : null;
    const cost = printedCost(item) ?? (hit ? printedCost(hit) : null);
    const details: Record<string, unknown> = { ...(hit?.details || {}), ...(item.details || {}) };
    if (cost == null) delete details.document_amount;
    else details.document_amount = cost;
    if (refund == null) delete details.refund_amount;
    else details.refund_amount = refund;
    details.ticket_count = revision.revised ? passengers.length : previous + incoming;
    details.ticket_email_ids = [...ids];
    if (hit) delete details.email_ingest_id;
    if (passengers.length || revision.revised) details.passengers = passengers;
    if (revision.revised || refund != null) {
      details.passengers_revised = revision.revised;
      details.needs_review = true;
      details.review_reason = partyReviewReason(revision.removed, refund);
      details.party_note = details.review_reason;
    }
    return { ...item, amount: 0, details };
  });
  const cleared = items.some((item) => {
    const details = item.details as { passengers_revised?: boolean; passengers?: unknown[] } | undefined;
    return details?.passengers_revised === true && Array.isArray(details.passengers) && details.passengers.length === 0;
  });
  return cleared ? { ...extract, items, travelers, document_status: "cancelled" } : { ...extract, items, travelers };
}

function flightSameSegment(left: MatchableItem, right: MatchableItem) {
  if (!isUsableFlight(right)) return false;
  if (day(left.start_at) !== day(right.start_at)) return false;
  if (!flightNumbersAlign(detail(left, "flight_number"), detail(right, "flight_number"))) return false;
  const leftPnr = pnrOf(left);
  const rightPnr = pnrOf(right);
  return !leftPnr || !rightPnr || leftPnr === rightPnr;
}

/** Seulement les vols utilisables. Le prix de vente est 0. Le coût absent reste absent. */
export function flightOnlyExtract<T extends FlightExtract>(extract: T): T {
  const items = (extract.items || [])
    .filter((item) => isUsableFlight(item))
    .map((item) => {
      const details = { ...(item.details || {}) };
      if (printedCost(item) == null) delete details.document_amount;
      return { ...item, amount: 0, details };
    });
  return { ...extract, items };
}

function strongFlightReason(row: FlightAutoCandidate) {
  const reason = row.reason || "";
  const score = row.score || 0;
  if (score >= 90 && /r[eé]f[eé]rence fournisseur/i.test(reason)) return true;
  return (reason === TRAVELER_DATES_REASON || reason === SAME_TRIP_REASON) && score >= 88;
}

/**
 * Un seul dossier, et seulement par PNR (carte ou mail déjà déposé) ou par voyageur unique et dates.
 * Zéro, plusieurs, ou un score plus bas : la file garde le mail.
 */
export function decideFlightAutoAttach(
  extract: FlightExtract | null | undefined,
  candidates: FlightAutoCandidate[] | null | undefined,
  context?: { receivedAt?: string | null }
): FlightAutoDecision | null {
  if (!extract || !hasUsableFlight(extract)) return null;
  if (extract.document_status === "cancelled" || extract.document_status === "quote" || extract.document_status === "identity") {
    return null;
  }
  if (extractHasPlaceholderRef(extract)) return null;
  const rows = candidates || [];
  const strong = rows.filter((row) => row.booking_id && row.customer_id && strongFlightReason(row));
  const ids = [...new Set(strong.map((row) => row.booking_id as string))];
  if (ids.length === 1) {
    const hit = strong.find((row) => row.booking_id === ids[0]);
    if (hit?.customer_id && hit.reason && hit.covers_passengers !== false) {
      if (!dateBoundReason(hit.reason) || !travelerDatesBlocked(extract, hit, context?.receivedAt)) {
        return { bookingId: ids[0], customerId: hit.customer_id, reason: hit.reason };
      }
    }
  }
  const covering = rows.filter(
    (row) =>
      row.booking_id &&
      row.customer_id &&
      row.covers_passengers === true &&
      Boolean(row.start_date && row.end_date) &&
      !travelerDatesBlocked(extract, row, context?.receivedAt)
  );
  const coverIds = [...new Set(covering.map((row) => row.booking_id as string))];
  if (coverIds.length !== 1) return null;
  const hit = covering.find((row) => row.booking_id === coverIds[0]);
  if (!hit?.customer_id) return null;
  return { bookingId: coverIds[0], customerId: hit.customer_id, reason: hit.reason || TRAVELER_DATES_REASON };
}

function dateBoundReason(reason: string) {
  return reason === TRAVELER_DATES_REASON || reason === SAME_TRIP_REASON;
}

function travelerDatesBlocked(
  extract: FlightExtract,
  hit: FlightAutoCandidate,
  receivedAt: string | null | undefined
) {
  if (flightsDatedBeforeMail(extract, receivedAt) || hotelDatedBeforeMail(extract, receivedAt)) return true;
  return dossierSpansTooLong(hit.start_date, hit.end_date);
}

/** Extract stocké avant le correctif PNR / distance / passagers. */
export const FLIGHT_PARSER_REVISION = 2;

export function flightParserRevision(raw: unknown) {
  if (!raw || typeof raw !== "object") return 0;
  const value = (raw as { parser_revision?: unknown }).parser_revision;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function flightExtractIsStale(raw: unknown) {
  return flightParserRevision(raw) < FLIGHT_PARSER_REVISION;
}

type FreshParse = {
  items?: FlightExtractItem[] | null;
  travelers?: { first_name?: string | null; last_name?: string | null; ticket_last4?: string | null }[] | null;
};

/**
 * Remplace les vols d’un extract ancien par une lecture fraîche.
 * Sans vol relu, l’extract ne change pas : on n’efface pas un billet illisible.
 */
export function applyFreshFlightParse<T extends FlightExtract>(current: T, fresh: FreshParse): T & { parser_revision: number } {
  const flights = (fresh.items || []).filter((item) => (item.kind || "") === "flight");
  const kept = (current.items || []).filter((item) => (item.kind || "") !== "flight");
  const travelers =
    (fresh.travelers || []).some((person) => text(person.first_name) && text(person.last_name))
      ? fresh.travelers || []
      : current.travelers || [];
  return {
    ...current,
    items: flights.length ? [...flights, ...kept] : current.items || [],
    travelers,
    parser_revision: FLIGHT_PARSER_REVISION,
  };
}

/**
 * File d’attente : un voyageur du billet sur un seul dossier, Visible compris.
 * La visibilité n’écarte pas le dossier. Les cartes nouvelles restent cachées.
 */
export function planQueuedFlightAttach(input: {
  extract: BookingExtract;
  bookings: (TripBooking & { visible_to_client?: boolean | null })[];
  travelers?: TravelerName[];
  companions?: TravelerName[];
  customers?: Parameters<typeof suggestBookingByTraveler>[4];
  itemsByBooking?: Map<string, { confirmation_ref?: string | null; details?: Record<string, unknown> | null }[]>;
  attachedRefsByBooking?: Map<string, string[]>;
  receivedAt?: string | null;
}): FlightAutoDecision | null {
  const bookings = input.bookings.filter((booking) => booking.status !== "cancelled");
  const merged = mergeBookingSuggestions(
    suggestBookingByReference(input.extract, bookings, input.itemsByBooking || new Map(), input.attachedRefsByBooking),
    suggestBookingByTraveler(input.extract, bookings, input.travelers || [], input.companions || [], input.customers || [])
  );
  return decideFlightAutoAttach(input.extract, merged.candidates, { receivedAt: input.receivedAt });
}
