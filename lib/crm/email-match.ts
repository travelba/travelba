import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import { findMatchingItem } from "@/lib/crm/item-match";
import {
  firstNamesMatch,
  foldName,
  isPlaceholderTraveler,
  lastNamesMatch,
} from "@/lib/crm/person-match";
import { siteConfig } from "@/lib/site";
import {
  countsAsCarnetCard,
  customerFullName,
  type CrmBooking,
  type CrmBookingItem,
  type CrmCustomer,
  type EmailIngestCandidate,
} from "@/lib/crm/types";
import { normalizeMatchText } from "@/lib/crm/revolut-match";

type CustomerLite = Pick<
  CrmCustomer,
  "id" | "first_name" | "last_name" | "company_name" | "email"
> & { usage_name?: string | null };

export type TripBooking = Pick<CrmBooking, "id" | "reference" | "title" | "destination"> & {
  customer_id?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type ExtractPerson = { first_name: string; last_name: string };

/** Score mini pour rattacher un voyage automatiquement (réf. ou trio nom+lieu+dates). */
export const STRONG_BOOKING_SCORE = 84;

const AGENCY_INBOXES = new Set(
  [
    siteConfig.contactEmail,
    "agence@travelba.fr",
    "hello@travelba.fr",
    "info@travelba.fr",
    "bonjour@travelba.fr",
    process.env.CONTACT_FROM_EMAIL,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
);

function customerLabel(c: CustomerLite) {
  const name = customerFullName(c);
  const company = c.company_name?.trim();
  return company ? `${name} · ${company}` : name;
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i < a.length + 1; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > 2) return 3;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function compactName(value: string | null | undefined) {
  return foldName(value).replace(/ /g, "");
}

function commonPrefixLength(a: string, b: string) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Nom de famille : égalité, distance d’édition ≤ 1, ou radical commun
 * (Albilila / Albilla). Plus strict que le rapprochement passeport (≤ 2).
 */
export function lastNamesClose(a: string | null | undefined, b: string | null | undefined) {
  if (lastNamesMatch(a, b)) return true;
  const left = compactName(a);
  const right = compactName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (Math.min(left.length, right.length) >= 4 && editDistance(left, right) <= 1) {
    return true;
  }
  return commonPrefixLength(left, right) >= 5;
}

export function firstNamesAlign(a: string | null | undefined, b: string | null | undefined) {
  if (firstNamesMatch(a, b)) return true;
  const left = normalizeMatchText(a);
  const right = normalizeMatchText(b);
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function placeCompact(value: string | null | undefined) {
  return foldName(value).replace(/ /g, "");
}

function placeParts(value: string | null | undefined) {
  return foldName(value)
    .split(/[·|,/→>-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

/** Ville / pays : égalité, inclusion (« dan tel aviv » ⊃ « tel aviv ») ou jeton commun. */
export function destinationsOverlap(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const a = placeCompact(left);
  const b = placeCompact(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const leftParts = placeParts(left);
  const rightParts = placeParts(right);
  return leftParts.some((part) => rightParts.includes(part));
}

export function extractDay(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

export function dateRangesOverlap(
  leftStart: string | null | undefined,
  leftEnd: string | null | undefined,
  rightStart: string | null | undefined,
  rightEnd: string | null | undefined
) {
  const a0 = extractDay(leftStart);
  const b0 = extractDay(rightStart);
  if (!a0 || !b0) return false;
  const a1 = extractDay(leftEnd) || a0;
  const b1 = extractDay(rightEnd) || b0;
  return a0 <= b1 && a1 >= b0;
}

export function dateRangesExact(
  leftStart: string | null | undefined,
  leftEnd: string | null | undefined,
  rightStart: string | null | undefined,
  rightEnd: string | null | undefined
) {
  const a0 = extractDay(leftStart);
  const b0 = extractDay(rightStart);
  const a1 = extractDay(leftEnd);
  const b1 = extractDay(rightEnd);
  return Boolean(a0 && b0 && a1 && b1 && a0 === b0 && a1 === b1);
}

/** Découpe une référence composite (« 976;977 », « A / B ») en jetons normalisés. */
export function referenceTokens(value: string | null | undefined): string[] {
  return String(value || "")
    .split(/[\s;,/|]+/)
    .map((token) => normalizeMatchText(token))
    .filter((token) => token.length >= 4);
}

/** Toutes les références présentes dans un extract (items + réf. dossier). */
export function extractReferences(extract: BookingExtract): Set<string> {
  const out = new Set<string>();
  for (const item of extract.items || []) {
    for (const token of referenceTokens(item.confirmation_ref)) out.add(token);
    const rooms = Array.isArray(item.details?.rooms) ? item.details!.rooms : [];
    for (const room of rooms) {
      for (const token of referenceTokens(room?.confirmation_ref)) out.add(token);
    }
  }
  return out;
}

export function usableCustomerEmail(email: string | null | undefined): string | null {
  const value = (email || "").trim().toLowerCase();
  if (!value || !value.includes("@")) return null;
  if (AGENCY_INBOXES.has(value)) return null;
  if (/^(contact|agence|hello|info|bonjour|admin)@travelba\.fr$/.test(value)) return null;
  return value;
}

export function extractPeople(extract: BookingExtract): ExtractPerson[] {
  const out: ExtractPerson[] = [];
  const seen = new Set<string>();
  const push = (first: string | null | undefined, last: string | null | undefined) => {
    const first_name = String(first || "").trim();
    const last_name = String(last || "").trim();
    if (!first_name && !last_name) return;
    if (isPlaceholderTraveler(first_name, last_name)) return;
    const key = `${foldName(first_name)}|${foldName(last_name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ first_name, last_name });
  };
  push(extract.customer_first_name, extract.customer_last_name);
  for (const traveler of extract.travelers || []) {
    push(traveler.first_name, traveler.last_name);
  }
  return out;
}

export function extractPrimaryPerson(extract: BookingExtract): ExtractPerson | null {
  for (const person of extractPeople(extract)) {
    if (person.first_name && person.last_name) return person;
  }
  return null;
}

function extractPlaces(extract: BookingExtract): string[] {
  const places: string[] = [];
  const push = (value: string | null | undefined) => {
    if (value && value.trim()) places.push(value);
  };
  push(extract.destination);
  push(extract.title);
  for (const item of extract.items || []) {
    push(item.title);
    push(item.details?.city);
    push(item.details?.hotel_name);
    push(item.details?.city_to);
    push(item.details?.city_from);
  }
  return places;
}

function extractWindow(extract: BookingExtract): { start: string | null; end: string | null } {
  let start = extractDay(extract.start_date);
  let end = extractDay(extract.end_date);
  for (const item of extract.items || []) {
    const itemStart = extractDay(item.start_at);
    const itemEnd = extractDay(item.end_at) || itemStart;
    if (itemStart && (!start || itemStart < start)) start = itemStart;
    if (itemEnd && (!end || itemEnd > end)) end = itemEnd;
  }
  return { start, end };
}

function bookingPlaces(booking: TripBooking): string[] {
  return [booking.destination, booking.title].filter((value): value is string =>
    Boolean(value && value.trim())
  );
}

export function extractDestinationsOverlap(extract: BookingExtract, booking: TripBooking) {
  const fromExtract = extractPlaces(extract);
  const fromBooking = bookingPlaces(booking);
  return fromExtract.some((left) => fromBooking.some((right) => destinationsOverlap(left, right)));
}

function personMatchesCustomer(person: ExtractPerson, customer: CustomerLite) {
  const lastHit =
    lastNamesClose(person.last_name, customer.last_name) ||
    lastNamesClose(person.last_name, customer.usage_name);
  if (!lastHit) return { last: false, first: false, exactLast: false };
  const exactLast =
    compactName(person.last_name) === compactName(customer.last_name) ||
    compactName(person.last_name) === compactName(customer.usage_name);
  const first = firstNamesAlign(person.first_name, customer.first_name);
  return { last: true, first, exactLast };
}

export type CustomerSuggestion = {
  autoCustomerId: string | null;
  candidates: EmailIngestCandidate[];
};

/**
 * Client suggéré à partir de l'extract : e-mail exact d'abord, puis nom
 * (y compris voyageurs et nom de famille approchant).
 * autoCustomerId n'est renseigné que sur un hit fort et unique.
 */
export function suggestCustomerFromExtract(
  customers: CustomerLite[],
  extract: BookingExtract
): CustomerSuggestion {
  const byId = new Map<string, EmailIngestCandidate>();
  const push = (c: CustomerLite, score: number, reason: string) => {
    const prev = byId.get(c.id);
    if (prev && prev.score >= score) return;
    byId.set(c.id, {
      customer_id: c.id,
      booking_id: null,
      label: customerLabel(c),
      reason,
      score,
    });
  };

  const email = usableCustomerEmail(extract.customer_email);
  let emailHit: string | null = null;
  if (email) {
    const hit = customers.find((c) => (c.email || "").toLowerCase() === email);
    if (hit) {
      push(hit, 100, "E-mail du client");
      emailHit = hit.id;
    }
  }

  const people = extractPeople(extract);
  const lastCounts = new Map<string, number>();
  for (const c of customers) {
    const l = compactName(c.last_name);
    if (l) lastCounts.set(l, (lastCounts.get(l) || 0) + 1);
  }

  const nameHits: string[] = [];
  for (const person of people) {
    if (compactName(person.last_name).length < 2) continue;
    for (const c of customers) {
      const match = personMatchesCustomer(person, c);
      if (!match.last) continue;
      const uniqueLast = (lastCounts.get(compactName(c.last_name)) || 0) === 1;
      let score = 0;
      let reason = "Nom de famille";
      if (match.exactLast && match.first) {
        score = uniqueLast ? 92 : 85;
        reason = "Nom et prénom";
      } else if (match.first) {
        score = uniqueLast ? 86 : 80;
        reason = "Nom approchant et prénom";
      } else if (match.exactLast) {
        score = uniqueLast ? 88 : 60;
        reason = "Nom de famille";
      } else {
        score = 62;
        reason = "Nom de famille approchant";
      }
      push(c, score, reason);
      nameHits.push(c.id);
    }
  }

  let autoCustomerId: string | null = emailHit;
  if (!autoCustomerId) {
    const strong = [...new Set(nameHits)].filter((id) => (byId.get(id)?.score || 0) >= 85);
    if (strong.length === 1) autoCustomerId = strong[0];
  }

  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  return { autoCustomerId, candidates };
}

export type BookingSuggestionCandidate = {
  booking_id: string;
  customer_id: string | null;
  label: string;
  reason: string;
  score: number;
};

export type BookingSuggestion = {
  autoBookingId: string | null;
  candidates: BookingSuggestionCandidate[];
};

function bookingLabel(b: Pick<CrmBooking, "reference" | "title" | "destination">) {
  const title = (b.title || b.destination || "").trim();
  return title ? `${b.reference} — ${title}` : b.reference;
}

export function pickAutoBookingId(candidates: BookingSuggestionCandidate[]) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  const top = sorted[0];
  if (!top || top.score < STRONG_BOOKING_SCORE) return null;
  const tied = sorted.filter((row) => row.score === top.score);
  return tied.length === 1 ? top.booking_id : null;
}

export function mergeBookingSuggestions(
  ...parts: BookingSuggestion[]
): BookingSuggestion {
  const byId = new Map<string, BookingSuggestionCandidate>();
  for (const part of parts) {
    for (const cand of part.candidates) {
      const prev = byId.get(cand.booking_id);
      if (!prev || cand.score > prev.score) byId.set(cand.booking_id, cand);
    }
  }
  const candidates = [...byId.values()].sort(
    (a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr")
  );
  return { autoBookingId: pickAutoBookingId(candidates), candidates };
}

/**
 * Voyage existant suggéré par recouvrement de références (réf. dossier ou
 * confirmation_ref d'un item) avec les documents de l'e-mail.
 */
export function suggestBookingByReference(
  extract: BookingExtract,
  bookings: TripBooking[],
  itemsByBooking: Map<string, Pick<CrmBookingItem, "confirmation_ref">[]>
): BookingSuggestion {
  const refs = extractReferences(extract);
  const candidates: BookingSuggestion["candidates"] = [];
  if (refs.size) {
    for (const booking of bookings) {
      if (booking.status === "cancelled") continue;
      const bookingRef = normalizeMatchText(booking.reference);
      let score = 0;
      let reason = "";
      if (bookingRef && refs.has(bookingRef)) {
        score = 100;
        reason = "Référence dossier";
      } else {
        const items = itemsByBooking.get(booking.id) || [];
        const hit = items.some((item) =>
          referenceTokens(item.confirmation_ref).some((token) => refs.has(token))
        );
        if (hit) {
          score = 90;
          reason = "Référence fournisseur";
        }
      }
      if (score > 0) {
        candidates.push({
          booking_id: booking.id,
          customer_id: booking.customer_id || null,
          label: bookingLabel(booking),
          reason,
          score,
        });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  return { autoBookingId: pickAutoBookingId(candidates), candidates };
}

/**
 * Voyage existant suggéré par nom (titulaire / voyageur, y compris flou) +
 * destination + fenêtre de dates.
 */
export function suggestBookingByTripSignals(
  extract: BookingExtract,
  bookings: TripBooking[],
  customers: CustomerLite[]
): BookingSuggestion {
  const people = extractPeople(extract);
  if (!people.length) return { autoBookingId: null, candidates: [] };
  const window = extractWindow(extract);
  const byCustomer = new Map(customers.map((row) => [row.id, row]));
  const candidates: BookingSuggestion["candidates"] = [];

  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    const customer = booking.customer_id ? byCustomer.get(booking.customer_id) : undefined;
    if (!customer) continue;
    const nameHit = people
      .map((person) => personMatchesCustomer(person, customer))
      .find((row) => row.last);
    if (!nameHit) continue;
    const destHit = extractDestinationsOverlap(extract, booking);
    const exactDates = dateRangesExact(window.start, window.end, booking.start_date, booking.end_date);
    const overlapDates = dateRangesOverlap(
      window.start,
      window.end,
      booking.start_date,
      booking.end_date
    );
    if (!destHit || !overlapDates) continue;
    const score = exactDates ? 88 : 84;
    candidates.push({
      booking_id: booking.id,
      customer_id: booking.customer_id || null,
      label: bookingLabel(booking),
      reason: exactDates
        ? "Nom, destination et dates"
        : "Nom, destination et dates (chevauchement)",
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  return { autoBookingId: pickAutoBookingId(candidates), candidates };
}

export function hasUsableTrip(extract: BookingExtract) {
  if (extract.document_status === "identity") return false;
  if ((extract.destination || "").trim()) return true;
  if ((extract.start_date || "").trim()) return true;
  return (extract.items || []).some((item) => (item.title || "").trim());
}

export type EmailIngestDecision =
  | { kind: "apply"; bookingId: string; customerId: string }
  | { kind: "create"; customerId: string }
  | {
      kind: "create_customer";
      firstName: string;
      lastName: string;
      email: string | null;
    }
  | { kind: "review" };

export type EmailIngestSuggestionInput = {
  extract: BookingExtract;
  suggestedCustomerId: string | null;
  suggestedBookingId: string | null;
  candidates: EmailIngestCandidate[];
};

/**
 * Décide du geste automatique : rattacher, créer, ou laisser en relecture.
 * Ambiguïté (plusieurs voyages au même score fort) → review.
 */
export type CancellationApplyPlan = {
  cancelBooking: boolean;
  itemIds: string[];
};

/** Items à masquer ; dossier annulé s’il ne reste plus de carte carnet, ou sans item ciblé. */
export function cancellationApplyPlan(
  extract: BookingExtract,
  items: {
    id: string;
    kind: string;
    confirmation_ref?: string | null;
    start_at?: string | null;
    title?: string | null;
    details?: Record<string, unknown> | null;
  }[]
): CancellationApplyPlan {
  const remaining = [...items];
  const itemIds: string[] = [];
  for (const incoming of extract.items || []) {
    const hit = findMatchingItem(remaining, incoming);
    if (!hit) continue;
    itemIds.push(hit.id);
    const idx = remaining.findIndex((row) => row.id === hit.id);
    if (idx >= 0) remaining.splice(idx, 1);
  }
  const leftoverCards = remaining.filter((row) => countsAsCarnetCard(row.kind));
  const cancelBooking = itemIds.length === 0 || leftoverCards.length === 0;
  return { cancelBooking, itemIds: [...new Set(itemIds)] };
}

export function decideEmailIngestAction(input: EmailIngestSuggestionInput): EmailIngestDecision {
  const { extract } = input;
  if (extract.document_status === "identity") return { kind: "review" };

  const bookingCandidates = input.candidates.filter((row) => row.booking_id);
  const topBooking = [...bookingCandidates].sort((a, b) => b.score - a.score)[0];
  if (isCancellationExtract(extract)) {
    if (input.suggestedBookingId) {
      const chosen =
        bookingCandidates.find((row) => row.booking_id === input.suggestedBookingId) ||
        topBooking;
      const customerId = chosen?.customer_id || input.suggestedCustomerId;
      if (customerId) {
        return {
          kind: "apply",
          bookingId: input.suggestedBookingId,
          customerId,
        };
      }
    }
    return { kind: "review" };
  }

  if (input.suggestedBookingId) {
    const chosen =
      bookingCandidates.find((row) => row.booking_id === input.suggestedBookingId) || topBooking;
    const customerId = chosen?.customer_id || input.suggestedCustomerId;
    if (customerId) {
      return {
        kind: "apply",
        bookingId: input.suggestedBookingId,
        customerId,
      };
    }
  }

  if (topBooking && topBooking.score >= 70) return { kind: "review" };
  if (!hasUsableTrip(extract)) return { kind: "review" };

  if (input.suggestedCustomerId) {
    return { kind: "create", customerId: input.suggestedCustomerId };
  }

  const person = extractPrimaryPerson(extract);
  if (!person) return { kind: "review" };
  return {
    kind: "create_customer",
    firstName: person.first_name,
    lastName: person.last_name,
    email: usableCustomerEmail(extract.customer_email),
  };
}

export async function executeEmailIngestDecision(
  decision: EmailIngestDecision,
  handlers: {
    apply: (bookingId: string, customerId: string) => Promise<unknown>;
    persist: (customerId: string) => Promise<{ id: string }>;
    createCustomer: (input: {
      firstName: string;
      lastName: string;
      email: string | null;
    }) => Promise<string>;
  }
): Promise<{ bookingId: string; customerId: string } | null> {
  if (decision.kind === "review") return null;
  if (decision.kind === "apply") {
    await handlers.apply(decision.bookingId, decision.customerId);
    return { bookingId: decision.bookingId, customerId: decision.customerId };
  }
  const customerId =
    decision.kind === "create"
      ? decision.customerId
      : await handlers.createCustomer({
          firstName: decision.firstName,
          lastName: decision.lastName,
          email: decision.email,
        });
  const booking = await handlers.persist(customerId);
  return { bookingId: booking.id, customerId };
}
