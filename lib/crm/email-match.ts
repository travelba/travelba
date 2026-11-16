import { shownPersonName } from "@/lib/crm/identity";
import { documentPriceIssues } from "@/lib/crm/booking-issues";
import { cityPlaceKey } from "@/lib/crm/city-names";
import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";
import { hotelExactStay, hotelRefsShareBooking } from "@/lib/crm/item-match";
import { isPlaceholderReference } from "@/lib/crm/ingest-samples";
import {
  firstNamesMatch,
  foldName,
  isPlaceholderTraveler,
  lastNamesMatch,
} from "@/lib/crm/person-match";
import { siteConfig } from "@/lib/site";
import {
  type CrmBooking,
  type CrmCustomer,
  type EmailIngestCandidate,
  isActiveItem,
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

/** Au-dessus du seuil fort, sous la référence dossier. Un ex æquo ne choisit pas. */
export const HOTEL_STAY_SCORE = 91;
export const HOTEL_STAY_REASON = "Hôtel, dates et voyageur";

const AGENCY_INBOXES = new Set(
  [
    siteConfig.contactEmail,
    "agence@travelba.fr",
    "hello@travelba.fr",
    "info@travelba.fr",
    "bonjour@travelba.fr",
    "crm@travelba.fr",
    process.env.CONTACT_FROM_EMAIL,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
);

function customerLabel(c: CustomerLite) {
  const name = shownPersonName(c);
  const company = c.company_name?.trim();
  if (company) return name ? `${name} · ${company}` : company;
  return name || "Client";
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

function cityKeys(value: string | null | undefined) {
  const keys = new Set<string>();
  const add = (part: string) => {
    const key = cityPlaceKey(part);
    if (key) keys.add(key);
  };
  if (value && value.trim()) add(value);
  for (const part of placeParts(value)) add(part);
  return keys;
}

/** Ville / pays : égalité, inclusion (« dan tel aviv » ⊃ « tel aviv »), alias (Milano = Milan) ou jeton commun. */
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
  if (leftParts.some((part) => rightParts.includes(part))) return true;
  const leftKeys = cityKeys(left);
  const rightKeys = cityKeys(right);
  for (const key of leftKeys) {
    if (rightKeys.has(key)) return true;
  }
  return false;
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

const REFERENCE_WORDS = new Set([
  "reservation",
  "reservations",
  "pour",
  "confirmation",
  "chambre",
  "chambres",
  "booking",
  "room",
  "rooms",
  "hotel",
  "hotels",
  "ref",
  "reference",
  "voyage",
  "sejour",
  "dossier",
  "client",
  "guest",
  "passager",
  "passenger",
  "numero",
  "number",
  "votre",
  "votreconfirmation",
]);

function nameCodes(extract: BookingExtract) {
  const names = new Set<string>();
  for (const person of extractPeople(extract)) {
    for (const part of [person.first_name, person.last_name]) {
      const code = normalizeMatchText(part);
      if (code.length >= 4) names.add(code);
    }
  }
  return names;
}

/** Une référence fournisseur : code entier, au moins un chiffre ou un PNR de 5 à 8 lettres. Jamais un mot ni un nom. */
export function isSupplierReference(value: string | null | undefined, names?: Set<string>) {
  const raw = String(value || "").trim();
  if (!raw || /\s/.test(raw)) return false;
  if (isPlaceholderReference(raw)) return false;
  const code = normalizeMatchText(raw);
  if (code.length < 5 || code.length > 16) return false;
  if (REFERENCE_WORDS.has(code)) return false;
  if (names?.has(code)) return false;
  if (/\d/.test(code)) return true;
  return /^[a-z]{5,8}$/.test(code);
}

/** Découpe une référence composite (« 976;977 », « A/B ») en codes entiers. Pas les mots d’une phrase. */
export function referenceTokens(value: string | null | undefined, names?: Set<string>): string[] {
  const tokens = String(value || "")
    .split(/[;,/|]+/)
    .map((token) => token.trim())
    .filter((token) => isSupplierReference(token, names))
    .map((token) => normalizeMatchText(token));
  return [...new Set(tokens)];
}

/** Même confirmation, y compris `64570` et `64570SH046795`. */
export function confirmationRefsAlign(a: string | null | undefined, b: string | null | undefined) {
  const left = referenceTokens(a);
  const right = new Set(referenceTokens(b));
  if (left.some((token) => right.has(token))) return true;
  return hotelRefsShareBooking(a, b);
}

function detailPnr(details: Record<string, unknown> | null | undefined) {
  const value = details?.pnr;
  return typeof value === "string" ? value : "";
}

/** Toutes les références présentes dans un extract (confirmation, PNR compagnie, chambres). */
export function extractReferences(extract: BookingExtract): Set<string> {
  const names = nameCodes(extract);
  const out = new Set<string>();
  const push = (value: string | null | undefined) => {
    for (const token of referenceTokens(value, names)) out.add(token);
  };
  for (const item of extract.items || []) {
    push(item.confirmation_ref);
    push(detailPnr(item.details));
    const rooms = Array.isArray(item.details?.rooms) ? item.details!.rooms : [];
    for (const room of rooms) push(room?.confirmation_ref);
  }
  return out;
}

/** Le client est nommé dans le mail, ou c’est son e-mail. Un client emprunté à un autre dossier ne compte pas. */
export function clientIsMailTraveler(
  customer: { first_name?: string | null; last_name?: string | null; usage_name?: string | null; email?: string | null } | null | undefined,
  extract: BookingExtract
) {
  if (!customer) return false;
  const email = usableCustomerEmail(extract.customer_email);
  if (email && (customer.email || "").trim().toLowerCase() === email) return true;
  return extractPeople(extract).some((person) => ticketNameMatches(person, customer));
}

export function usableCustomerEmail(email: string | null | undefined): string | null {
  const value = (email || "").trim().toLowerCase();
  if (!value || !value.includes("@")) return null;
  if (AGENCY_INBOXES.has(value)) return null;
  if (/^(contact|agence|hello|info|bonjour|admin|crm)@travelba\.fr$/.test(value)) return null;
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

function orientedCustomerMatch(firstName: string, lastName: string, customer: CustomerLite) {
  const lastHit =
    lastNamesClose(lastName, customer.last_name) || lastNamesClose(lastName, customer.usage_name);
  if (!lastHit) return null;
  const exactLast =
    compactName(lastName) === compactName(customer.last_name) ||
    compactName(lastName) === compactName(customer.usage_name);
  return { last: true as const, first: firstNamesAlign(firstName, customer.first_name), exactLast };
}

/** « Benamara Yannick » et « Yannick Benamara » sont la même personne. */
function personMatchesCustomer(person: ExtractPerson, customer: CustomerLite) {
  const direct = orientedCustomerMatch(person.first_name, person.last_name, customer);
  const swapped =
    person.first_name.trim() && person.last_name.trim()
      ? orientedCustomerMatch(person.last_name, person.first_name, customer)
      : null;
  if (direct?.first) return { ...direct, inverted: false };
  if (swapped?.last && swapped.first) return { ...swapped, inverted: true };
  if (direct) return { ...direct, inverted: false };
  return { last: false, first: false, exactLast: false, inverted: false };
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
        reason = match.inverted ? "Prénom et nom inversés" : "Nom et prénom";
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
  start_date?: string | null;
  end_date?: string | null;
  covers_passengers?: boolean;
};

export type BookingSuggestion = {
  autoBookingId: string | null;
  candidates: BookingSuggestionCandidate[];
};

function absorbCandidate(primary: BookingSuggestionCandidate, extra?: BookingSuggestionCandidate) {
  if (!extra) return primary;
  return {
    ...primary,
    covers_passengers: primary.covers_passengers || extra.covers_passengers || undefined,
    start_date: primary.start_date ?? extra.start_date,
    end_date: primary.end_date ?? extra.end_date,
  };
}

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
      if (!prev || cand.score > prev.score) byId.set(cand.booking_id, absorbCandidate(cand, prev));
      else byId.set(cand.booking_id, absorbCandidate(prev, cand));
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
export type SupplierRefItem = {
  confirmation_ref?: string | null;
  details?: Record<string, unknown> | null;
};

function supplierRefHit(item: SupplierRefItem, token: string) {
  if (confirmationRefsAlign(token, item.confirmation_ref)) return true;
  return confirmationRefsAlign(token, detailPnr(item.details));
}

export function suggestBookingByReference(
  extract: BookingExtract,
  bookings: TripBooking[],
  itemsByBooking: Map<string, SupplierRefItem[]>,
  attachedRefsByBooking?: Map<string, string[]>
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
        const hitItem = items.some((item) => [...refs].some((token) => supplierRefHit(item, token)));
        const attached = (attachedRefsByBooking?.get(booking.id) || []).filter((ref) => isSupplierReference(ref));
        const hitMail = attached.some((ref) => [...refs].some((token) => confirmationRefsAlign(token, ref)));
        if (hitItem || hitMail) {
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

export const TRAVELER_DATES_REASON = "Voyageur et dates";
export const TRAVELER_DATES_SCORE = 88;

export type TravelerName = {
  booking_id?: string | null;
  customer_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  usage_name?: string | null;
};

function compactTraveler(value: string | null | undefined) {
  return foldName(value).replace(/ /g, "");
}

/** Le prénom du billet est égal au prénom enregistré, ou il en est le début (« Inès » et « Inès, Louise »). */
function ticketGivenNameStarts(ticketFirst: string, storedFirst: string | null | undefined) {
  const ticket = compactTraveler(ticketFirst);
  const stored = compactTraveler(storedFirst);
  if (!ticket || !stored || ticket.length < 2) return false;
  return stored === ticket || stored.startsWith(ticket);
}

function ticketLastExact(ticketLast: string, last: string | null | undefined, usage?: string | null) {
  const incoming = compactTraveler(ticketLast);
  if (!incoming || incoming.length < 2) return false;
  return [last, usage].some((value) => compactTraveler(value) === incoming);
}

/** Prénom et nom exacts, dans les deux sens. Pas le seul nom de famille. */
export function ticketNameMatches(
  person: ExtractPerson,
  stored: { first_name?: string | null; last_name?: string | null; usage_name?: string | null }
) {
  const orientations: [string, string][] = [
    [person.first_name, person.last_name],
    [person.last_name, person.first_name],
  ];
  return orientations.some(
    ([first, last]) => ticketGivenNameStarts(first, stored.first_name) && ticketLastExact(last, stored.last_name, stored.usage_name)
  );
}

/**
 * Un voyageur du billet (pas seulement le titulaire) désigne un seul dossier :
 * nom exact, dates qui se croisent. Plusieurs dossiers : les candidats restent, aucun n’est choisi.
 */
export function suggestBookingByTraveler(
  extract: BookingExtract,
  bookings: TripBooking[],
  travelers: TravelerName[],
  companions: TravelerName[] = [],
  customers: CustomerLite[] = []
): BookingSuggestion {
  const people = extractPeople(extract).filter((person) => person.first_name && person.last_name);
  const window = extractWindow(extract);
  if (!people.length || !window.start) return { autoBookingId: null, candidates: [] };
  const byCustomer = new Map(customers.map((row) => [row.id, row]));
  const candidates: BookingSuggestion["candidates"] = [];
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    if (!dateRangesOverlap(window.start, window.end, booking.start_date, booking.end_date)) continue;
    const holder = booking.customer_id ? byCustomer.get(booking.customer_id) : undefined;
    const names: TravelerName[] = [
      ...travelers.filter((row) => row.booking_id === booking.id),
      ...companions.filter((row) => row.customer_id && row.customer_id === booking.customer_id),
    ];
    if (holder) names.push(holder);
    const hit = names.some((stored) => people.some((person) => ticketNameMatches(person, stored)));
    if (!hit) continue;
    const covers = people.every((person) => names.some((stored) => ticketNameMatches(person, stored)));
    candidates.push({
      booking_id: booking.id,
      customer_id: booking.customer_id || null,
      label: bookingLabel(booking),
      reason: TRAVELER_DATES_REASON,
      score: TRAVELER_DATES_SCORE,
      start_date: booking.start_date,
      end_date: booking.end_date,
      covers_passengers: covers,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  const unique = candidates.length === 1 ? candidates[0].booking_id : null;
  return { autoBookingId: unique, candidates };
}

export type HotelStayCard = {
  booking_id: string;
  kind?: string | null;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

function guestPerson(value: string): ExtractPerson | null {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] };
}

function cardGuests(card: HotelStayCard): ExtractPerson[] {
  const details = card.details || {};
  const raw: string[] = [];
  if (typeof details.guests === "string") raw.push(...details.guests.split(","));
  const rooms = Array.isArray(details.rooms) ? details.rooms : [];
  for (const room of rooms) {
    if (!room || typeof room !== "object") continue;
    const guests = (room as { guests?: unknown }).guests;
    if (typeof guests === "string") raw.push(...guests.split(","));
  }
  const people: ExtractPerson[] = [];
  for (const value of raw) {
    const person = guestPerson(value);
    if (person) people.push(person);
  }
  return people;
}

function orderedTravelerMatch(
  incomingFirst: string,
  incomingLast: string,
  first: string | null | undefined,
  last: string | null | undefined,
  usage?: string | null
) {
  if (!incomingFirst.trim() || !incomingLast.trim()) return false;
  const incoming = compactName(incomingLast);
  const lasts = [compactName(last), compactName(usage)].filter(Boolean);
  if (!incoming || !lasts.includes(incoming)) return false;
  return firstNamesAlign(incomingFirst, first);
}

/** Nom et prénom exacts, dans un sens ou l’autre. Le nom de famille seul ne suffit pas. */
function travelerNameMatches(
  person: ExtractPerson,
  first: string | null | undefined,
  last: string | null | undefined,
  usage?: string | null
) {
  if (orderedTravelerMatch(person.first_name, person.last_name, first, last, usage)) return true;
  return orderedTravelerMatch(person.last_name, person.first_name, first, last, usage);
}

/**
 * Séjour déjà ouvert : même hôtel (nom ou `le_hotel_id`), mêmes dates, même voyageur.
 * La confirmation peut différer (numéro d’hôtel et numéro Little Emperors).
 * Deux dossiers : aucun rattachement automatique.
 */
export function suggestBookingByHotelStay(
  extract: BookingExtract,
  bookings: TripBooking[],
  cards: HotelStayCard[],
  customers: CustomerLite[]
): BookingSuggestion {
  const people = extractPeople(extract).filter((person) => person.first_name && person.last_name);
  const hotels = (extract.items || []).filter((item) => (item.kind || "") === "hotel");
  if (!people.length || !hotels.length) return { autoBookingId: null, candidates: [] };
  const byCustomer = new Map(customers.map((row) => [row.id, row]));
  const byBooking = new Map<string, HotelStayCard[]>();
  for (const card of cards) {
    if (!card.booking_id || !isActiveItem(card)) continue;
    if (card.kind && card.kind !== "hotel") continue;
    const list = byBooking.get(card.booking_id) || [];
    list.push(card);
    byBooking.set(card.booking_id, list);
  }
  const candidates: BookingSuggestion["candidates"] = [];
  for (const booking of bookings) {
    if (booking.status === "cancelled") continue;
    const customer = booking.customer_id ? byCustomer.get(booking.customer_id) : undefined;
    const stayCards = byBooking.get(booking.id) || [];
    const hit = hotels.some((item) => {
      const incoming = {
        kind: "hotel",
        title: item.title,
        confirmation_ref: item.confirmation_ref,
        start_at: item.start_at,
        end_at: item.end_at,
        details: item.details || null,
      };
      return stayCards.some((card) => {
        const current = {
          kind: card.kind || "hotel",
          title: card.title,
          confirmation_ref: card.confirmation_ref,
          start_at: card.start_at,
          end_at: card.end_at,
          details: card.details || null,
        };
        if (!hotelExactStay(current, incoming)) return false;
        const holder = customer
          ? people.some((person) =>
              travelerNameMatches(person, customer.first_name, customer.last_name, customer.usage_name)
            )
          : false;
        if (holder) return true;
        return cardGuests(card).some((guest) =>
          people.some((person) => travelerNameMatches(person, guest.first_name, guest.last_name))
        );
      });
    });
    if (!hit) continue;
    candidates.push({
      booking_id: booking.id,
      customer_id: booking.customer_id || null,
      label: bookingLabel(booking),
      reason: HOTEL_STAY_REASON,
      score: HOTEL_STAY_SCORE,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  return { autoBookingId: pickAutoBookingId(candidates), candidates };
}

export const SAME_DESTINATION_REASON = "Même client, même destination";
export const SAME_DESTINATION_CANCELLED_REASON = "Même client, même destination, séjour annulé";
/** Même client, dates qui se croisent : on propose d’ajouter, on ne crée pas. */
export const OVERLAP_ADD_REASON = "Ajouter au dossier";
const EMAIL_DATES_SCORE = 83;

/** Sous le seuil de rattachement automatique : la file propose, elle ne crée pas. */
const SAME_DESTINATION_SCORE = 80;

/**
 * Même client, même ville, dates ignorées. Un dossier annulé compte :
 * l’annulation et la nouvelle confirmation n’arrivent pas dans le même ordre.
 * Jamais de rattachement automatique.
 */
export function suggestBookingByDestination(
  extract: BookingExtract,
  bookings: TripBooking[],
  customers: CustomerLite[]
): BookingSuggestion {
  if (isCancellationExtract(extract)) return { autoBookingId: null, candidates: [] };
  const people = extractPeople(extract);
  const email = usableCustomerEmail(extract.customer_email);
  const byCustomer = new Map(customers.map((row) => [row.id, row]));
  const emailCustomer = email
    ? customers.find((row) => (row.email || "").toLowerCase() === email)
    : undefined;
  const candidates: BookingSuggestion["candidates"] = [];

  for (const booking of bookings) {
    const customer = booking.customer_id ? byCustomer.get(booking.customer_id) : undefined;
    if (!customer) continue;
    const nameHit = people.some((person) => personMatchesCustomer(person, customer).last);
    const emailHit = Boolean(emailCustomer && emailCustomer.id === customer.id);
    if (!nameHit && !emailHit) continue;
    if (!extractDestinationsOverlap(extract, booking)) continue;
    const cancelled = booking.status === "cancelled";
    candidates.push({
      booking_id: booking.id,
      customer_id: booking.customer_id || null,
      label: bookingLabel(booking),
      reason: cancelled ? SAME_DESTINATION_CANCELLED_REASON : SAME_DESTINATION_REASON,
      score: cancelled ? SAME_DESTINATION_SCORE - 2 : SAME_DESTINATION_SCORE,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  return { autoBookingId: null, candidates };
}

/**
 * Deuxième palier : e-mail du client et dates qui se chevauchent.
 * Pas de rattachement automatique : la file propose « Ajouter au dossier ».
 */
export function suggestBookingByClientEmail(
  extract: BookingExtract,
  bookings: TripBooking[],
  customers: CustomerLite[]
): BookingSuggestion {
  if (isCancellationExtract(extract)) return { autoBookingId: null, candidates: [] };
  const email = usableCustomerEmail(extract.customer_email);
  if (!email) return { autoBookingId: null, candidates: [] };
  const window = extractWindow(extract);
  if (!window.start) return { autoBookingId: null, candidates: [] };
  const customer = customers.find((row) => (row.email || "").trim().toLowerCase() === email);
  if (!customer) return { autoBookingId: null, candidates: [] };
  const candidates: BookingSuggestion["candidates"] = [];
  for (const booking of bookings) {
    if (booking.customer_id !== customer.id) continue;
    if (booking.status === "cancelled") continue;
    if (!dateRangesOverlap(window.start, window.end, booking.start_date, booking.end_date)) continue;
    candidates.push({
      booking_id: booking.id,
      customer_id: customer.id,
      label: bookingLabel(booking),
      reason: OVERLAP_ADD_REASON,
      score: EMAIL_DATES_SCORE,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "fr"));
  return { autoBookingId: null, candidates };
}

export type MatchTier = "reference" | "email_dates" | "traveler_hotel_dates" | "human";

function uniqueByBooking(rows: BookingSuggestionCandidate[]) {
  const seen = new Map<string, BookingSuggestionCandidate>();
  for (const row of rows) {
    if (!seen.has(row.booking_id)) seen.set(row.booking_id, row);
  }
  return [...seen.values()];
}

/**
 * Confirmation / PNR / réf. Expedia ou Little Emperors, puis e-mail + dates,
 * puis voyageur + hôtel + dates. Plusieurs dossiers au même palier : un humain.
 */
export function deterministicBookingId(
  candidates: BookingSuggestionCandidate[]
): { tier: MatchTier; bookingId: string | null } {
  const references = uniqueByBooking(
    candidates.filter((row) => row.score >= 90 && /référence/i.test(row.reason))
  );
  if (references.length === 1) return { tier: "reference", bookingId: references[0].booking_id };
  if (references.length > 1) return { tier: "reference", bookingId: null };
  const byEmail = uniqueByBooking(candidates.filter((row) => row.reason === OVERLAP_ADD_REASON));
  if (byEmail.length === 1) return { tier: "email_dates", bookingId: byEmail[0].booking_id };
  if (byEmail.length > 1) return { tier: "email_dates", bookingId: null };
  const byStay = uniqueByBooking(
    candidates.filter(
      (row) =>
        row.reason === HOTEL_STAY_REASON ||
        row.reason === TRAVELER_DATES_REASON ||
        row.reason.startsWith("Nom, destination")
    )
  );
  if (byStay.length === 1) return { tier: "traveler_hotel_dates", bookingId: byStay[0].booking_id };
  return { tier: "human", bookingId: null };
}

export function proposesAddToDossier(
  candidates: { reason?: string | null }[] | null | undefined
) {
  return (candidates || []).some((row) => row.reason === OVERLAP_ADD_REASON);
}

export function blocksSecondDossier(
  candidates: { booking_id?: string | null; reason?: string | null; score?: number | null }[]
) {
  return candidates.some(
    (row) =>
      Boolean(row.booking_id) &&
      (row.reason === SAME_DESTINATION_REASON || row.reason === SAME_DESTINATION_CANCELLED_REASON) &&
      (row.score ?? 0) < STRONG_BOOKING_SCORE
  );
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
export type { CancellationApplyPlan } from "@/lib/crm/item-lifecycle";
export { cancellationApplyPlan } from "@/lib/crm/item-lifecycle";

export function decideEmailIngestAction(input: EmailIngestSuggestionInput): EmailIngestDecision {
  const { extract } = input;
  if (extract.document_status === "identity") return { kind: "review" };
  if (documentPriceIssues(extract).length) return { kind: "review" };

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
