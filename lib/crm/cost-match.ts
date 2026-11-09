/**
 * Propositions de rattachement d’une sortie Pliant ou Revolut.
 * Rien n’est écrit : l’agence clique Rattacher.
 * Un indice faible (compagnie seule, marque d’hôtel seule, petit montant) ne propose rien.
 */

import { matchTokens, normalizeMatchText } from "./revolut-match";

export type CostTargetItem = {
  id: string;
  kind: string | null;
  title: string | null;
  supplier?: string | null;
  amount: number | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  confirmationRef?: string | null;
};

export type CostAmountHint = { value: number; currency: string };

export type CostPerson = { first?: string | null; last?: string | null };

export type CostTargetBooking = {
  id: string;
  reference: string;
  title: string | null;
  destination?: string | null;
  customerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  items: CostTargetItem[];
  travelers?: CostPerson[];
  /** Pièces et e-mails déjà rattachés au dossier. Textes courts, pas le corps entier. */
  hints?: {
    pnrs?: string[];
    amounts?: CostAmountHint[];
    texts?: string[];
  };
};

export type CostSignal =
  | "reference"
  | "card"
  | "client"
  | "pnr"
  | "passengers"
  | "email"
  | "amount"
  | "fx"
  | "airline"
  | "hotel"
  | "place"
  | "date";

export type CostConfidence = "haute" | "moyenne";

export type CostSuggestion = {
  bookingId: string;
  itemId: string | null;
  score: number;
  reason: "reference" | "card" | "client" | "supplier" | "amount" | "pnr" | "passengers" | "email";
  reasons: CostSignal[];
  passengers: string[];
  confidence: CostConfidence;
};

export type CostMatchInput = {
  text?: string | null;
  party?: string | null;
  /** Montant en euros, quand on le connaît. */
  amount: number;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  cardBookingIds?: string[];
  customerId?: string | null;
  /** Jour d’autorisation Pliant, ou jour Revolut. */
  date?: string | null;
};

const SHOW_SCORE = 62;
const HAUTE_SCORE = 85;
const AMBIGUOUS_GAP = 15;
const CLIENT_WINDOW_DAYS = 10;
const DAY = 86_400_000;

const HARD = new Set<CostSignal>(["reference", "card", "pnr", "amount", "hotel", "email", "passengers"]);

const GENERIC = new Set([
  "hotel", "hotels", "hostel", "spa", "lodge", "lodges", "resort", "resorts", "inn", "suites", "suite",
  "villa", "villas", "palace", "riad", "club", "beach", "golf", "boutique", "collection", "group", "groupe",
  "the", "and", "les", "des", "del", "de", "la", "le", "el", "los", "las", "by", "air", "airline", "airlines",
  "airways", "travel", "trvl", "tours", "voyages", "voyage", "sarl", "sas", "ltd", "llc", "inc", "gmbh", "co",
  "international", "paris", "www", "com", "fr",
  "airport", "airports", "aeroport", "aeroports", "taxi", "taxis", "transfer", "transfers",
  "transfert", "transferts", "vip", "shuttle", "navette", "valley", "bay", "island", "islands",
]);

/** Marque seule : Edition, Six Senses, Marriott. Le lieu (Miami, Douro, Layan) reste distinctif. */
const HOTEL_BRANDS = new Set([
  "edition", "senses", "six", "marriott", "hilton", "hyatt", "sofitel", "fairmont", "ritz", "carlton",
  "seasons", "aman", "rosewood", "peninsula", "mandarin", "oriental", "intercontinental", "westin",
  "sheraton", "waldorf", "kempinski", "belmond", "andaz", "accor", "ihg", "wyndham", "radisson",
  "movenpick", "oberoi", "anantara", "banyan", "como", "bulgari", "armani", "fourseasons", "autograph",
  "curio", "tribute", "design", "luxury", "collection", "hotels", "slh",
]);

/** Clés collées d’au moins 6 lettres, ou sigles courts comparés aux mots. */
const AIRLINES = ["airfrance", "lufthansa", "britishairways", "emirates", "qatarairways", "easyjet", "ryanair", "vueling", "transavia", "iberia", "singaporeair", "etihad", "unitedairlines", "americanairlines", "austrian", "brusselsairlines", "corsair", "frenchbee", "itaairways", "elal", "arkia", "aegean", "turkishairlines", "finnair", "norwegian", "wizzair", "ethiopian", "cathay", "qantas", "latam", "aeromexico", "aircanada", "klm"];

const SIGNAL_LABEL: Record<CostSignal, string> = {
  reference: "Le n° de dossier figure dans le libellé.",
  card: "Carte Pliant générée dans ce dossier.",
  client: "La carte est au nom du client, pendant son séjour.",
  pnr: "Même PNR qu’un billet du dossier.",
  passengers: "Les noms des voyageurs figurent sur la sortie.",
  email: "Un e-mail du dossier nomme le voyageur et le fournisseur.",
  amount: "Même montant qu’un billet, un hôtel ou une pièce du dossier.",
  fx: "Montant proche, dans la marge de change.",
  airline: "La compagnie correspond à un vol du dossier.",
  hotel: "L’hôtel correspond à une étape du dossier.",
  place: "Le lieu correspond à la destination.",
  date: "La date d’autorisation est celle du vol ou du séjour.",
};

const REASON_LABEL: Record<CostSuggestion["reason"], string> = {
  reference: SIGNAL_LABEL.reference,
  card: SIGNAL_LABEL.card,
  client: SIGNAL_LABEL.client,
  supplier: "Le nom du fournisseur correspond à cette prestation.",
  amount: "Même montant qu’une prestation du dossier.",
  pnr: SIGNAL_LABEL.pnr,
  passengers: SIGNAL_LABEL.passengers,
  email: SIGNAL_LABEL.email,
};

export function costSuggestionReasonLabel(reason: CostSuggestion["reason"]) {
  return REASON_LABEL[reason] || REASON_LABEL.amount;
}

export function costConfidenceLabel(level: CostConfidence) {
  return level === "haute" ? "Haute" : "Moyenne";
}

/** Pourquoi la proposition, dans l’ordre des indices. */
export function costSuggestionSummary(hit: { reason: CostSuggestion["reason"]; reasons?: CostSignal[] }) {
  const reasons = hit.reasons?.length ? hit.reasons : [];
  const labels: string[] = [];
  for (const reason of reasons) {
    const label = SIGNAL_LABEL[reason];
    if (label && !labels.includes(label)) labels.push(label);
  }
  if (!labels.length) labels.push(costSuggestionReasonLabel(hit.reason));
  return labels.join(" ");
}

type Money = { value: number; currency: string; itemId: string | null };

type Scored = {
  booking: CostTargetBooking;
  score: number;
  signals: CostSignal[];
  itemId: string | null;
  passengers: string[];
  clientEligible: boolean;
};

function activeItems(booking: CostTargetBooking) {
  return booking.items.filter((item) => item.lifecycle !== "superseded" && item.lifecycle !== "cancelled");
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function dayMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokensOf(value: string) {
  return matchTokens(value).filter((token) => token.length >= 3 && !GENERIC.has(token) && !/^\d+$/.test(token));
}

function distinctive(value: string) {
  return tokensOf(value).filter((token) => token.length >= 4 && !HOTEL_BRANDS.has(token));
}

function brands(value: string) {
  return tokensOf(value).filter((token) => HOTEL_BRANDS.has(token));
}

function mentionsAirline(value: string) {
  const glued = normalizeMatchText(value);
  const tokens = new Set(matchTokens(value));
  return AIRLINES.find((key) => (key.length >= 6 ? glued.includes(key) : tokens.has(key))) || null;
}

function cleanPnr(value: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length < 5 || clean.length > 8) return "";
  // « FRANCE » ou « MIAMI » ne sont pas des PNR. Un numéro tout en chiffres (14028540) reste un PNR.
  if (/^[A-Z]+$/.test(clean)) return "";
  return clean;
}

function paymentHasPnr(text: string, pnr: string) {
  if (!pnr) return false;
  return new RegExp(`(?:^|[^A-Z0-9])${pnr}(?:[^A-Z0-9]|$)`).test(text.toUpperCase());
}

function personLabel(person: CostPerson) {
  return [textOf(person.first), textOf(person.last)].filter(Boolean).join(" ").trim();
}

function peopleOf(booking: CostTargetBooking) {
  const out: { first: string; last: string; label: string }[] = [];
  const seen = new Set<string>();
  const push = (person: CostPerson) => {
    const first = textOf(person.first);
    const last = textOf(person.last);
    const label = personLabel({ first, last });
    const key = normalizeMatchText(label);
    if (key.length < 4 || seen.has(key)) return;
    seen.add(key);
    out.push({ first, last, label });
  };
  for (const person of booking.travelers || []) push(person);
  for (const item of activeItems(booking)) {
    const passengers = item.details?.passengers;
    if (!Array.isArray(passengers)) continue;
    for (const row of passengers) {
      if (typeof row === "string") push({ last: row });
      else if (row && typeof row === "object") {
        const record = row as Record<string, unknown>;
        push({
          first: textOf(record.first_name) || textOf(record.first),
          last: textOf(record.last_name) || textOf(record.last) || textOf(record.name),
        });
      }
    }
  }
  return out;
}

function surnamesIn(people: { last: string }[], text: string) {
  const tokens = new Set(matchTokens(text));
  return people.filter((person) => {
    const last = normalizeMatchText(person.last);
    return last.length >= 4 && tokens.has(last);
  });
}

function withinTrip(date: string | null | undefined, booking: CostTargetBooking) {
  const at = dayMs(date);
  const start = dayMs(booking.startDate);
  if (at == null || start == null) return false;
  const end = dayMs(booking.endDate) ?? start;
  return at >= start - CLIENT_WINDOW_DAYS * DAY && at <= end + CLIENT_WINDOW_DAYS * DAY;
}

function itemBlob(item: CostTargetItem) {
  const details = item.details || {};
  return [item.title, item.supplier, item.confirmationRef, textOf(details.hotel_name), textOf(details.city), textOf(details.airline), textOf(details.pnr)]
    .filter(Boolean)
    .join(" ");
}

function placeBlob(booking: CostTargetBooking) {
  return [booking.destination, booking.title, ...activeItems(booking).map(itemBlob)].filter(Boolean).join(" ");
}

function moneysOf(booking: CostTargetBooking): Money[] {
  const out: Money[] = [];
  const groups = new Map<string, { values: number[]; currency: string; itemId: string }>();
  for (const item of activeItems(booking)) {
    const details = item.details || {};
    const currency = (textOf(details.document_currency) || textOf(details.currency) || "EUR").toUpperCase();
    const sale = num(item.amount);
    if (sale != null && sale > 0) out.push({ value: round2(sale), currency: "EUR", itemId: item.id });
    const document = num(details.document_amount);
    if (document != null && document > 0) out.push({ value: round2(document), currency, itemId: item.id });
    const pnr = cleanPnr(textOf(item.confirmationRef) || textOf(details.pnr));
    const fare = document != null && document > 0 ? document : sale;
    if (pnr && fare != null && fare > 0 && (item.kind === "flight" || item.kind === "train")) {
      const group = groups.get(`${pnr}:${currency}`) || { values: [], currency, itemId: item.id };
      group.values.push(round2(fare));
      groups.set(`${pnr}:${currency}`, group);
    }
  }
  for (const hint of booking.hints?.amounts || []) {
    if (hint.value > 0) out.push({ value: round2(hint.value), currency: (hint.currency || "EUR").toUpperCase(), itemId: null });
  }
  for (const group of groups.values()) {
    const same = new Set(group.values.map((value) => value.toFixed(2)));
    const total = group.values.length === 2 && same.size === 1 ? group.values[0] : round2(group.values.reduce((sum, value) => sum + value, 0));
    out.push({ value: total, currency: group.currency, itemId: group.itemId });
  }
  return out;
}

function moneyHits(input: CostMatchInput, moneys: Money[]) {
  const eur = Math.abs(Number(input.amount) || 0);
  const original = input.originalAmount != null ? Math.abs(Number(input.originalAmount)) : null;
  const currency = (input.originalCurrency || "EUR").toUpperCase();
  let exact: Money | null = null;
  let fx: Money | null = null;
  for (const money of moneys) {
    if (currency !== "EUR" && original != null && money.currency === currency && close(original, money.value, 0.02)) {
      exact = money;
      break;
    }
    if (eur > 0 && money.currency === "EUR" && close(eur, money.value, 0.02)) {
      exact = money;
      break;
    }
  }
  if (!exact && eur > 0 && currency !== "EUR") {
    for (const money of moneys) {
      if (money.currency !== "EUR" || money.value < 20 || eur < 20) continue;
      const gap = Math.abs(eur - money.value) / money.value;
      if (gap > 0.005 && gap <= 0.03) {
        fx = money;
        break;
      }
    }
  }
  return { exact, fx };
}

function close(left: number, right: number, abs: number) {
  return Math.abs(left - right) <= abs;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function pnrsOf(booking: CostTargetBooking) {
  const out: { pnr: string; itemId: string | null }[] = [];
  const seen = new Set<string>();
  const push = (value: string, itemId: string | null) => {
    const pnr = cleanPnr(value);
    if (!pnr || seen.has(pnr)) return;
    seen.add(pnr);
    out.push({ pnr, itemId });
  };
  for (const item of activeItems(booking)) {
    push(textOf(item.confirmationRef), item.id);
    push(textOf(item.details?.pnr), item.id);
  }
  for (const pnr of booking.hints?.pnrs || []) push(pnr, null);
  return out;
}

function add(signals: CostSignal[], signal: CostSignal) {
  if (!signals.includes(signal)) signals.push(signal);
}

function scoreOne(input: CostMatchInput, booking: CostTargetBooking, cards: Set<string>): Scored {
  const payment = `${input.party || ""} ${input.text || ""}`.trim();
  const items = activeItems(booking);
  const people = peopleOf(booking);
  const signals: CostSignal[] = [];
  let score = 0;
  let itemId: string | null = null;
  const named = surnamesIn(people, payment);

  if (cards.has(booking.id)) {
    add(signals, "card");
    score += 92;
  }

  const pnr = pnrsOf(booking).find((row) => paymentHasPnr(payment, row.pnr));
  if (pnr) {
    add(signals, "pnr");
    score += 94;
    itemId = pnr.itemId;
  }

  const paid = moneyHits(input, moneysOf(booking));
  if (paid.exact) {
    add(signals, "amount");
    score += 46;
    itemId = itemId || paid.exact.itemId;
  } else if (paid.fx) {
    add(signals, "fx");
    score += 22;
    itemId = itemId || paid.fx.itemId;
  }

  if (named.length) {
    add(signals, "passengers");
    score += 24;
  }

  const airline = mentionsAirline(payment);
  const airlineItem = airline
    ? items.find((item) => (item.kind === "flight" || item.kind === "train") && mentionsAirline(itemBlob(item)) === airline)
    : null;
  if (airline && airlineItem) {
    add(signals, "airline");
    score += 16;
    itemId = itemId || airlineItem.id;
    const delta = dayMs(airlineItem.startAt);
    const at = dayMs(input.date);
    if (delta != null && at != null) {
      const days = Math.round((delta - at) / DAY);
      if (days >= -2 && days <= 14) {
        add(signals, "date");
        score += 14;
      }
    }
  }

  if (!airline) {
    const hotel = hotelMatch(payment, booking);
    if (hotel.item && hotel.overlap) {
      add(signals, "hotel");
      score += 40;
      itemId = itemId || hotel.item.id;
      const at = dayMs(input.date);
      const start = dayMs(hotel.item.startAt);
      const end = dayMs(hotel.item.endAt) ?? start;
      if (at != null && start != null && end != null && at >= start - 5 * DAY && at <= end + 2 * DAY) {
        add(signals, "date");
        score += 12;
      }
    } else if (hotel.place) {
      add(signals, "place");
      score += 14;
    }
  }

  const email = emailHit(booking, payment, people);
  if (email) {
    add(signals, "email");
    score += 36;
    if (signals.includes("hotel") || signals.includes("place") || signals.includes("amount")) score += 12;
  }

  return {
    booking,
    score,
    signals,
    itemId,
    passengers: people.slice(0, 6).map((person) => person.label),
    clientEligible: Boolean(input.customerId && booking.customerId === input.customerId && withinTrip(input.date, booking)),
  };
}

function hotelMatch(payment: string, booking: CostTargetBooking) {
  const wanted = distinctive(payment);
  const brand = brands(payment);
  let best: { item: CostTargetItem; overlap: number } | null = null;
  for (const item of activeItems(booking)) {
    if (item.kind === "flight" || item.kind === "train" || item.kind === "fee" || item.kind === "expense") continue;
    const have = new Set(distinctive(itemBlob(item)));
    const overlap = wanted.filter((token) => have.has(token)).length;
    if (!best || overlap > best.overlap) best = { item, overlap };
  }
  const places = new Set(distinctive(placeBlob(booking)));
  const place = wanted.some((token) => places.has(token));
  const brandOk = brand.some((token) => brands(placeBlob(booking)).includes(token));
  if (wanted.length && !place && !(best && best.overlap > 0)) return { item: null, overlap: 0, place: false };
  if (best && best.overlap > 0) return { item: best.item, overlap: best.overlap, place };
  if (brandOk && place) {
    const item = activeItems(booking).find((row) => row.kind === "hotel") || null;
    return { item, overlap: 0, place: true };
  }
  return { item: null, overlap: 0, place };
}

function emailHit(booking: CostTargetBooking, payment: string, people: { last: string }[]) {
  const texts = (booking.hints?.texts || []).map((text) => text.trim()).filter(Boolean);
  if (!texts.length) return false;
  const blob = texts.join(" \n ");
  if (!surnamesIn(people, blob).length) return false;
  const airline = mentionsAirline(payment);
  if (airline && mentionsAirline(blob) === airline) return true;
  const brand = brands(payment);
  if (brand.length && brand.some((token) => brands(blob).includes(token) || normalizeMatchText(blob).includes(token))) return true;
  return distinctive(payment).some((token) => token.length >= 5 && normalizeMatchText(blob).includes(token));
}

function isHard(row: Scored) {
  return row.signals.some((signal) => HARD.has(signal));
}

function primaryReason(signals: CostSignal[]): CostSuggestion["reason"] {
  if (signals.includes("reference")) return "reference";
  if (signals.includes("card")) return "card";
  if (signals.includes("pnr")) return "pnr";
  if (signals.includes("passengers")) return "passengers";
  if (signals.includes("email")) return "email";
  if (signals.includes("amount") || signals.includes("fx")) return "amount";
  if (signals.includes("hotel") || signals.includes("airline")) return "supplier";
  if (signals.includes("client")) return "client";
  return "amount";
}

function confidenceOf(score: number): CostConfidence {
  return score >= HAUTE_SCORE ? "haute" : "moyenne";
}

const SIGNAL_ORDER: CostSignal[] = ["reference", "card", "pnr", "amount", "fx", "passengers", "email", "airline", "hotel", "place", "date", "client"];

function toSuggestion(row: Scored, extra?: CostSignal[]): CostSuggestion {
  const signals = [...row.signals];
  for (const signal of extra || []) add(signals, signal);
  signals.sort((left, right) => SIGNAL_ORDER.indexOf(left) - SIGNAL_ORDER.indexOf(right));
  return {
    bookingId: row.booking.id,
    itemId: row.itemId,
    score: row.score,
    reason: primaryReason(signals),
    reasons: signals,
    passengers: row.passengers,
    confidence: confidenceOf(row.score),
  };
}

function boostUnique(rows: Scored[], signal: CostSignal, floor: number) {
  const hits = rows.filter((row) => row.signals.includes(signal));
  if (hits.length !== 1) return;
  hits[0].score = Math.max(hits[0].score, floor);
}

/**
 * Classe les dossiers. Référence, carte, PNR, montant, hôtel distinct (pas la marque seule),
 * e-mail et noms. Deux pistes trop proches et peu sûres : aucune proposition.
 */
export function rankCostTargets(input: CostMatchInput, bookings: CostTargetBooking[]): CostSuggestion[] {
  const reference = (input.text || input.party || "").match(/\bTB-\d{4}-\d{4}\b/i)?.[0]?.toUpperCase() || null;
  const cards = new Set(input.cardBookingIds || []);
  if (reference) {
    const booking = bookings.find((row) => row.reference.toUpperCase() === reference);
    if (booking) {
      const scored = scoreOne(input, booking, cards);
      scored.score = 100;
      return [toSuggestion(scored, ["reference"])];
    }
  }
  const scored = bookings.map((booking) => scoreOne(input, booking, cards));
  boostUnique(scored, "amount", 64);
  boostUnique(scored, "hotel", 70);
  const passengerHits = scored.filter((row) => row.signals.includes("passengers") && (row.signals.includes("airline") || row.signals.includes("hotel") || row.signals.includes("amount") || row.signals.includes("email")));
  if (passengerHits.length === 1) passengerHits[0].score = Math.max(passengerHits[0].score, 66);

  const visible = scored.filter((row) => row.score >= SHOW_SCORE && isHard(row));
  if (!visible.length) {
    const clients = scored.filter((row) => row.clientEligible);
    if (clients.length === 1) {
      clients[0].score = Math.max(clients[0].score, 68);
      return [toSuggestion(clients[0], ["client"])];
    }
    return [];
  }
  visible.sort((left, right) => right.score - left.score || left.booking.reference.localeCompare(right.booking.reference));
  if (visible.length > 1 && visible[0].score < HAUTE_SCORE && visible[0].score - visible[1].score < AMBIGUOUS_GAP) return [];
  return visible.slice(0, 3).map((row) => toSuggestion(row));
}

/** PNR, montants et noms lus dans l’extrait d’un e-mail déjà rattaché. Pas de numéro de pièce. */
export function hintsFromExtract(extract: unknown): { pnrs: string[]; amounts: CostAmountHint[]; names: CostPerson[] } {
  const pnrs: string[] = [];
  const amounts: CostAmountHint[] = [];
  const names: CostPerson[] = [];
  const seenPnr = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (!value || depth > 6) return;
    if (Array.isArray(value)) {
      for (const row of value) walk(row, depth + 1);
      return;
    }
    if (typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    for (const key of ["pnr", "confirmation_ref", "confirmationRef", "record_locator"]) {
      const pnr = cleanPnr(textOf(row[key]));
      if (pnr && !seenPnr.has(pnr)) {
        seenPnr.add(pnr);
        pnrs.push(pnr);
      }
    }
    const document = num(row.document_amount);
    if (document != null && document > 0) {
      amounts.push({ value: round2(document), currency: (textOf(row.document_currency) || textOf(row.currency) || "EUR").toUpperCase() });
    }
    const first = textOf(row.first_name);
    const last = textOf(row.last_name);
    if (first || last) names.push({ first, last });
    for (const [key, child] of Object.entries(row)) {
      if (key === "passengers" || key === "travelers" || key === "items" || key === "rooms") walk(child, depth + 1);
    }
  };
  walk(extract, 0);
  return { pnrs, amounts, names };
}
