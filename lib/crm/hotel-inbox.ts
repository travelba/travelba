import { HOTEL_DESK_LABELS, hotelReplyForDesk, hotelReplyLink, isAutomaticHotelMail } from "./hotel-desk";
import {
  classificationStillHolds,
  hotelConfirmedText,
  paymentSettledText,
  stayDepartureDay,
  stayEndedBeforeToday,
  type HotelCourrierTurn,
  type HotelPliantSpend,
} from "./hotel-courrier-board";
import { followUpCountLabel, followUpHref, outboundAnchor, UNANSWERED_AFTER_MS } from "./mail-followup";
import { replyHref } from "./mail-reply";
import { formatMoney } from "./money";
import { pliantSpendCopy } from "./pliant-booking";
import { parisIsoDate } from "./hotel-arrival";
import { fold } from "./text";
import type { HotelDeskKind } from "./types";

export type HotelPaymentSignal = "Lien" | "Préautorisation" | "Demande de carte" | "Facture";

export type HotelInboxTurn = {
  id: string;
  at: string;
  direction: "in" | "out";
  body: string;
  from: string;
  link: string | null;
  countsAsReply: boolean;
};

export type HotelInboxRequest = {
  id: string;
  bookingId: string;
  itemId: string;
  kind: string;
  status: string;
  sentAt: string | null;
  lastFollowUpAt: string | null;
  followUpCount: number;
  classifiedAt: string | null;
  hotelName: string;
  city: string;
  reference: string;
  clientName: string;
  clientFirst: string;
  clientLast: string;
  stayStart: string | null;
  itemEnd: string | null;
  bookingEnd: string | null;
  bookingStatus: string;
  bookingArchived: boolean;
  itemLifecycle: string | null;
  turns: HotelInboxTurn[];
};

export type HotelInboxCard = {
  id: string;
  bookingId: string;
  pliantCardId: string;
  label: string;
  last4: string | null;
  limitCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

export type HotelInboxLink = {
  itemId: string | null;
  requestId: string | null;
  pliantCardId: string;
};

export type HotelInboxRow = {
  id: string;
  requestId: string;
  bookingId: string;
  itemId: string;
  kind: string;
  kindLabel: string;
  hotel: string;
  city: string;
  reference: string;
  clientName: string;
  clientFirst: string;
  clientLast: string;
  stayLabel: string;
  status: string;
  lastWriter: "L'hôtel" | "L'agence";
  activityAt: string;
  excerpt: string;
  href: string;
  dossierHref: string;
  signal: HotelPaymentSignal | null;
  payUrl: string | null;
  amountLabel: string | null;
  paymentState: "unpaid" | "paid" | "authorized" | "probable" | "unknown" | "hidden";
  paidLabel: string | null;
  cardLabel: string | null;
  ceilingEuros: string;
  followUpLabel: string | null;
  /** Début du séjour, pour trier les séjours à venir. */
  arrivalAt: string;
  section: "payment" | "reply" | "unanswered" | "waiting" | "rest" | "upcoming" | "paid" | "ended";
};

export type HotelInbox = {
  payment: HotelInboxRow[];
  replies: HotelInboxRow[];
  unanswered: HotelInboxRow[];
  waiting: HotelInboxRow[];
  rest: HotelInboxRow[];
  /** Séjours à venir ou en cours, visibles, avec le badge de paiement. */
  upcoming: HotelInboxRow[];
  /** Séjours terminés déjà payés. Replié, sans relance. */
  paid: HotelInboxRow[];
  endedUnpaid: HotelInboxRow[];
  /** Lecture principale en échec. Les listes sont vides, le bandeau le dit. */
  loadError?: string | null;
};

export const HOTEL_INBOX_LOAD_ERROR = "Lecture des courriers impossible, réessayez";

/**
 * Preuve de paiement déjà lue. Rien n’est écrit ici.
 * `stay` : coût du séjour. `dossier` : ligne de dépense ou coût sans vente.
 * `card` : dépense d’une carte du dossier. `proposal` : non pointée, confiance seulement.
 */
export type HotelPaymentEvidence = {
  id: string;
  source: "pliant" | "revolut";
  bookingId: string;
  bookingItemId: string | null;
  hotelRequestId?: string | null;
  place: "stay" | "dossier" | "card" | "proposal";
  status: string | null;
  type?: string | null;
  billingCents?: number | string | null;
  /** Montant en unité principale. Revolut. */
  amount?: number | null;
  currency: string;
  at: string | null;
  merchant: string | null;
  cardLabel: string | null;
  /** Quatre derniers chiffres de la carte qui a payé, si on les a. */
  last4?: string | null;
  confidence?: "haute" | "moyenne" | "basse" | null;
};

type PaymentOutcome = "paid" | "authorized" | "probable";

type PaymentHit = {
  outcome: PaymentOutcome;
  amount: number;
  currency: string;
  at: string;
  id: string;
  last4: string | null;
};

const SIGNAL_RULES: { signal: HotelPaymentSignal; pattern: RegExp }[] = [
  { signal: "Demande de carte", pattern: /card authorization form|credit card authorization|virtual card|carte virtuelle/i },
  { signal: "Préautorisation", pattern: /pre-authori[sz]|pr[eé]autor/i },
  { signal: "Lien", pattern: /payment link|secure link|lien de paiement|\bprepay\b/i },
  { signal: "Facture", pattern: /\binvoice\b|\bproforma\b|\bfacture\b|bank transfer|\bvirement\b/i },
];

const GREETING_ONLY =
  /^(?:bonjour|bonsoir|hello|hi|hey|dear|good morning|good afternoon|good evening|cher|chère|madame|monsieur)(?:\s+[\p{L}'’.-]+){0,4}[,!]?$/iu;
const SIGN_OFF =
  /^(?:--|—|–|_{5,}|bien à vous|bien cordialement|cordialement|best regards|kind regards|regards|sincerely)[,.]?$/i;

function time(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function kindLabel(kind: string) {
  if (!(kind in HOTEL_DESK_LABELS)) return "Courrier";
  return HOTEL_DESK_LABELS[kind as HotelDeskKind];
}

const HOTEL_BRANDS = new Set([
  "edition", "senses", "six", "marriott", "hilton", "hyatt", "sofitel", "fairmont", "ritz", "carlton",
  "seasons", "aman", "rosewood", "peninsula", "mandarin", "oriental", "intercontinental", "westin",
  "sheraton", "waldorf", "kempinski", "belmond", "andaz", "accor", "ihg", "wyndham", "radisson",
  "movenpick", "oberoi", "anantara", "banyan", "como", "bulgari", "armani", "fourseasons", "autograph",
]);

const GENERIC_HOTEL_WORDS = new Set([
  "hotel", "hotels", "hostel", "spa", "lodge", "lodges", "resort", "resorts", "inn", "suites", "suite",
  "villa", "villas", "palace", "the", "and", "les", "des", "del", "de", "la", "le", "el", "by",
]);

function merchantTokens(value: string | null | undefined) {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function tokenHits(token: string, words: string[]) {
  return words.some((word) => {
    if (word === token) return true;
    return token.length >= 5 && word.length >= 3 && token.startsWith(word);
  });
}

/**
 * Le commerçant ressemble au nom de l’hôtel.
 * Une marque seule (Hyatt, Marriott) ne suffit pas. « PARK HYATT SAI » retrouve Park Hyatt Saigon,
 * pas Park Hyatt Phu Quoc.
 */
export function merchantResemblesHotel(merchant: string | null | undefined, hotel: string | null | undefined) {
  const distinctive = merchantTokens(hotel).filter((token) => token.length >= 4 && !GENERIC_HOTEL_WORDS.has(token) && !HOTEL_BRANDS.has(token));
  const words = merchantTokens(merchant).filter((token) => !GENERIC_HOTEL_WORDS.has(token));
  if (!distinctive.length || !words.length) return false;
  const places = distinctive.filter((token) => token.length >= 5);
  if (places.length) return places.some((token) => tokenHits(token, words));
  return distinctive.every((token) => tokenHits(token, words));
}

/**
 * Après un paiement, le fil ne se rouvre que pour une vraie question
 * ou une nouvelle demande (lien, préautorisation, carte, facture d’un autre montant).
 * « please », « kindly » ou « see attached » ne suffisent pas.
 */
export function reopensAfterPayment(text: string, paidCents: number | null) {
  const cleaned = hotelReplyForDesk(text) || text;
  if (/\?/.test(cleaned)) return true;
  const signal = hotelPaymentSignal(cleaned, null);
  if (signal === "Lien" || signal === "Préautorisation" || signal === "Demande de carte") return true;
  if (signal !== "Facture") return false;
  const cents = hotelPaymentAmountCents(cleaned);
  if (cents == null) return false;
  if (paidCents == null) return true;
  return Math.abs(cents - paidCents) > 1;
}

function mentionsPaid(text: string) {
  return /payment (?:has been )?(?:received|successful|completed|confirmed)|paiement (?:a été )?(?:reçu|effectué|effectue|confirmé)|paid in full/i.test(
    text
  );
}

/** Lien ou mots de paiement. Le type de demande ne décide pas. */
export function hotelPaymentSignal(text: string, link: string | null): HotelPaymentSignal | null {
  const cleaned = hotelReplyForDesk(text) || text;
  for (const rule of SIGNAL_RULES) {
    if (rule.pattern.test(cleaned)) return rule.signal;
  }
  const url = (link || "").trim() || hotelReplyLink(cleaned) || hotelReplyLink(text);
  return url ? "Lien" : null;
}

/** Montant lu dans le texte. Rien si aucun montant n’est écrit. */
export function hotelPaymentAmountCents(text: string): number | null {
  const flat = hotelReplyForDesk(text).replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const patterns = [
    /(?:montant|amount|total|due|balance)\s*[:.]?\s*(?:eur|€|usd|\$)?\s*(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i,
    /(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)\s*(?:€|eur\b)/i,
    /(?:€|eur)\s*(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = flat.match(pattern);
    const cents = match?.[1] ? parseAmount(match[1]) : null;
    if (cents != null && cents > 0) return cents;
  }
  return null;
}

function parseAmount(raw: string) {
  const compact = raw.replace(/\s/g, "");
  let normalized = compact;
  if (compact.includes(",") && compact.includes(".")) {
    normalized =
      compact.lastIndexOf(",") > compact.lastIndexOf(".")
        ? compact.replace(/\./g, "").replace(",", ".")
        : compact.replace(/,/g, "");
  } else if (compact.includes(",")) normalized = compact.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(compact)) normalized = compact.replace(/\./g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/** Deux lignes utiles, sans numéro de carte. */
export function hotelInboxExcerpt(body: string) {
  const cleaned = hotelReplyForDesk(body);
  const lines: string[] = [];
  for (const raw of cleaned.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || GREETING_ONLY.test(line) || SIGN_OFF.test(line)) continue;
    lines.push(line.replace(/^(?:bonjour|bonsoir|hello|hi|hey)[,!]?\s+/i, "").trim() || line);
    if (lines.length === 2) break;
  }
  return lines.filter(Boolean).join("\n");
}

/** Newsletter, code, absence, ou corps vide : pas une réponse à traiter. */
export function isNoiseHotelTurn(turn: Pick<HotelInboxTurn, "from" | "body" | "countsAsReply">) {
  if (!turn.countsAsReply) return true;
  if (isAutomaticHotelMail(turn.from, turn.body)) return true;
  const cleaned = hotelReplyForDesk(turn.body).trim();
  return !cleaned || cleaned === "L'hôtel a répondu.";
}

export function safePayUrl(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function pliantCardCaption(card: Pick<HotelInboxCard, "last4" | "limitCents" | "currency" | "status">) {
  const digits = (card.last4 || "").replace(/\D/g, "").slice(-4);
  const tail = digits.length === 4 ? `••${digits}` : "Carte";
  const ceiling = formatMoney((card.limitCents || 0) / 100, card.currency || "EUR");
  const status = card.status === "locked" ? "bloquée" : card.status === "terminated" ? "clôturée" : "active";
  return `${tail} · plafond ${ceiling} · ${status}`;
}

function hotelInLabel(label: string, hotel: string) {
  const name = fold(hotel).replace(/\s+/g, " ").trim();
  if (name.length < 4) return false;
  return fold(label).includes(name);
}

/** Carte active la plus récente de cet hôtel. Deux cartes : la plus proche du montant, puis la plus récente. */
export function matchHotelInboxCard(input: {
  bookingId: string;
  hotelName: string;
  amountCents: number | null;
  cards: HotelInboxCard[];
  linkedPliantIds: string[];
  otherHotels: string[];
}) {
  const active = input.cards.filter((card) => card.bookingId === input.bookingId && card.status === "active" && card.pliantCardId);
  if (!active.length) return null;
  const linked = new Set(input.linkedPliantIds.filter(Boolean));
  const linkedCards = active.filter((card) => linked.has(card.pliantCardId));
  if (linkedCards.length) return closestCard(linkedCards, input.amountCents);
  const named = active.filter(
    (card) =>
      hotelInLabel(card.label, input.hotelName) &&
      !input.otherHotels.some((hotel) => hotel !== input.hotelName && hotelInLabel(card.label, hotel) && !hotelInLabel(card.label, input.hotelName))
  );
  if (named.length) return closestCard(named, input.amountCents);
  if (input.otherHotels.length) return null;
  return active.length === 1 ? active[0] : null;
}

function closestCard(cards: HotelInboxCard[], amountCents: number | null) {
  return [...cards].sort((a, b) => {
    if (amountCents != null) {
      const gap = Math.abs(a.limitCents - amountCents) - Math.abs(b.limitCents - amountCents);
      if (gap !== 0) return gap;
    }
    return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  })[0] || null;
}

function labelNamesHotel(label: string | null, hotel: string) {
  if (!label) return false;
  return hotelInLabel(label, hotel) || merchantResemblesHotel(label, hotel);
}

function moneyOf(row: HotelPaymentEvidence) {
  if (row.source === "revolut") {
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return { amount, currency: (row.currency || "EUR").toUpperCase() };
  }
  const cents = typeof row.billingCents === "number" ? row.billingCents : Number(row.billingCents);
  return pliantSpendCopy({
    type: row.type || "PURCHASE",
    status: row.status,
    billingCents: Number.isFinite(cents) ? cents : null,
    currency: row.currency,
  });
}

function settlementOf(row: HotelPaymentEvidence, money: { amount: number } | null): "paid" | "authorized" | null {
  if (!money || money.amount <= 0) return null;
  if (row.source === "revolut") return "paid";
  const status = (row.status || "").toUpperCase();
  if (status === "PENDING") return "authorized";
  if (status === "BOOKED" || status === "CONFIRMED" || status === "POSTED") return "paid";
  return null;
}

/** Le paiement de ce fil, du plus sûr au plus incertain. Aucune écriture. */
function recognizePayment(request: HotelInboxRequest, evidence: HotelPaymentEvidence[]): PaymentHit | null {
  const hits: PaymentHit[] = [];
  for (const row of evidence) {
    const money = moneyOf(row);
    if (row.place === "proposal") {
      if (row.confidence !== "haute" || row.bookingId !== request.bookingId) continue;
      if (!merchantResemblesHotel(row.merchant, request.hotelName) || !money || money.amount <= 0) continue;
      hits.push({
        outcome: "probable",
        amount: money.amount,
        currency: money.currency,
        at: row.at || "",
        id: row.id,
        last4: fourDigits(row.last4),
      });
      continue;
    }
    const mode = settlementOf(row, money);
    if (!mode || !money) continue;
    const stay =
      row.place === "stay" &&
      ((row.bookingItemId != null && row.bookingItemId === request.itemId) ||
        (row.hotelRequestId != null && row.hotelRequestId === request.id));
    const named = merchantResemblesHotel(row.merchant, request.hotelName) || labelNamesHotel(row.cardLabel, request.hotelName);
    const dossier = row.place === "dossier" && row.bookingId === request.bookingId && named;
    const card = row.place === "card" && row.bookingId === request.bookingId && named;
    if (!stay && !dossier && !card) continue;
    hits.push({
      outcome: mode,
      amount: money.amount,
      currency: money.currency,
      at: row.at || "",
      id: row.id,
      last4: fourDigits(row.last4),
    });
  }
  const rank = { paid: 0, authorized: 1, probable: 2 };
  hits.sort(
    (a, b) =>
      rank[a.outcome] - rank[b.outcome] ||
      time(b.at) - time(a.at) ||
      Number(Boolean(b.last4)) - Number(Boolean(a.last4)) ||
      a.id.localeCompare(b.id)
  );
  return hits[0] || null;
}

function evidenceFromSpends(spends: HotelPliantSpend[]): HotelPaymentEvidence[] {
  return spends.map((spend) => ({
    id: spend.transactionId,
    source: "pliant",
    bookingId: "",
    bookingItemId: spend.bookingItemId,
    hotelRequestId: spend.hotelRequestId,
    place: "stay",
    status: spend.status,
    type: spend.type,
    billingCents: spend.billingCents,
    amount: null,
    currency: spend.billingCurrency || "EUR",
    at: spend.bookedAt,
    merchant: null,
    cardLabel: null,
    confidence: null,
  }));
}

function stayLabel(start: string | null, end: string | null) {
  const from = stayDepartureDay(start, null);
  const to = stayDepartureDay(end, null);
  if (from && to) return `${formatFrenchDay(from)} – ${formatFrenchDay(to)}`;
  if (from || to) return formatFrenchDay(from || to);
  return "";
}

function formatFrenchDay(day: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
}

/** JJ/MM, pour le badge « Payé le ». */
function formatDayMonth(day: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  return `${match[3]}/${match[2]}`;
}

function fourDigits(value: string | null | undefined) {
  const digits = (value || "").replace(/\D/g, "").slice(-4);
  return digits.length === 4 ? digits : null;
}

function paidCaption(payment: PaymentHit, nowMs: number) {
  if (payment.outcome === "authorized") return "Paiement autorisé, en attente Pliant";
  if (payment.outcome === "probable") return "Payé probablement, à pointer";
  const day = formatDayMonth(stayDepartureDay(payment.at, null) || parisIsoDate(new Date(time(payment.at) || nowMs)));
  const tail = payment.last4 ? ` · ••${payment.last4}` : "";
  return `Payé le ${day} · ${formatMoney(payment.amount, payment.currency)}${tail}`;
}

export function unansweredDaysLabel(sentAt: string, nowMs: number) {
  const from = stayDepartureDay(sentAt, null) || parisIsoDate(new Date(time(sentAt)));
  const today = parisIsoDate(new Date(nowMs));
  const start = Date.parse(`${from}T12:00:00Z`);
  const end = Date.parse(`${today}T12:00:00Z`);
  const days = Number.isFinite(start) && Number.isFinite(end) ? Math.max(2, Math.round((end - start) / 86_400_000)) : 2;
  return days === 1 ? "Sans réponse depuis 1 jour" : `Sans réponse depuis ${days} jours`;
}

export function endedPaymentHeading(count: number) {
  if (count === 1) return "1 séjour terminé avec un lien de paiement jamais réglé";
  return `${count} séjours terminés avec un lien de paiement jamais réglé`;
}

export function waitingHeading(count: number) {
  return count === 1 ? "1 en attente" : `${count} en attente`;
}

type Reading = {
  request: HotelInboxRequest;
  noise: boolean;
  classified: boolean;
  cancelled: boolean;
  ended: boolean;
  hotelWroteLast: boolean;
  signal: HotelPaymentSignal | null;
  payUrl: string | null;
  amountCents: number | null;
  outcome: PaymentOutcome | "none";
  paidLabel: string | null;
  askedAfter: boolean;
  confirmed: boolean;
  settledText: boolean;
  activityAt: string;
  outboundAt: string;
  excerpt: string;
  real: boolean;
};

function readRequest(
  request: HotelInboxRequest,
  evidence: HotelPaymentEvidence[],
  paymentsKnown: boolean,
  nowMs: number
): Reading {
  const turns = [...request.turns].filter((turn) => Number.isFinite(time(turn.at)));
  turns.sort((a, b) => time(a.at) - time(b.at) || a.id.localeCompare(b.id));
  const inbound = turns.filter((turn) => turn.direction === "in");
  const realInbound = inbound.filter((turn) => !isNoiseHotelTurn(turn));
  const latestIn = inbound[inbound.length - 1] || null;
  const noise = Boolean(latestIn) && isNoiseHotelTurn(latestIn) && realInbound.length === 0;
  const boardTurns: HotelCourrierTurn[] = turns.map((turn) => ({
    id: turn.id,
    at: turn.at,
    direction: turn.direction,
    body: turn.body,
    countsAsReply: turn.countsAsReply && !isNoiseHotelTurn(turn),
  }));
  const classified = classificationStillHolds(request.classifiedAt, boardTurns);
  const lastReal = [...turns].reverse().find((turn) => turn.direction === "out" || !isNoiseHotelTurn(turn)) || null;
  const hotelWroteLast = lastReal?.direction === "in";
  const latestReal = [...realInbound].reverse()[0] || null;
  const text = latestReal?.body || "";
  const link = latestReal?.link || inbound.map((turn) => turn.link).filter(Boolean).at(-1) || null;
  const detected = hotelPaymentSignal(text, link) || (mentionsPaid(text) ? "Lien" : null);
  const signal = detected || (request.kind === "payment_link" && hotelWroteLast ? "Lien" : null);
  const amountCents = hotelPaymentAmountCents(text);
  const payment = paymentsKnown ? recognizePayment(request, evidence) : null;
  const outcome = payment?.outcome || "none";
  const paidAt = payment?.at || "";
  const paidCents = payment ? Math.round(payment.amount * 100) : null;
  const askedAfter =
    outcome !== "none" &&
    hotelWroteLast &&
    reopensAfterPayment(text, paidCents) &&
    !paymentSettledText(text) &&
    (!Number.isFinite(time(paidAt)) || (latestReal != null && time(latestReal.at) > time(paidAt)));
  const settledText = Boolean(signal) && paymentSettledText(text);
  const confirmed = !signal && hotelWroteLast && hotelConfirmedText(text);
  const outboundAt = outboundAnchor(request.sentAt, request.lastFollowUpAt) || lastReal?.at || request.sentAt || "";
  const activityAt = (hotelWroteLast ? latestReal?.at : outboundAt) || outboundAt;
  return {
    request,
    noise,
    classified,
    cancelled: request.bookingStatus === "cancelled" || request.bookingArchived || request.itemLifecycle === "cancelled",
    ended: stayEndedBeforeToday(request.itemEnd, request.bookingEnd, nowMs),
    hotelWroteLast: Boolean(hotelWroteLast && latestReal),
    signal,
    payUrl: safePayUrl(link) || safePayUrl(hotelReplyLink(text)),
    amountCents,
    outcome,
    paidLabel: payment ? paidCaption(payment, nowMs) : null,
    askedAfter,
    confirmed,
    settledText,
    activityAt,
    outboundAt,
    excerpt: hotelInboxExcerpt(text),
    real: Boolean(latestReal),
  };
}

function rowOf(
  reading: Reading,
  section: HotelInboxRow["section"],
  nowMs: number,
  card: HotelInboxCard | null,
  paymentsKnown: boolean
): HotelInboxRow {
  const request = reading.request;
  const silent =
    !reading.real && Number.isFinite(time(reading.outboundAt)) && nowMs - time(reading.outboundAt) >= UNANSWERED_AFTER_MS;
  const status =
    (section === "upcoming" || section === "paid") && reading.paidLabel
      ? reading.paidLabel
      : section === "upcoming" && !reading.real
        ? silent
          ? unansweredDaysLabel(reading.outboundAt, nowMs)
          : "En attente"
        : section === "unanswered"
          ? unansweredDaysLabel(reading.outboundAt, nowMs)
          : section === "waiting"
            ? "En attente"
            : section === "rest"
              ? reading.hotelWroteLast
                ? "Réponse à traiter"
                : "En attente"
              : "Réponse à traiter";
  const replyTurn = [...request.turns].reverse().find((turn) => turn.direction === "in" && !isNoiseHotelTurn(turn));
  const href = reading.hotelWroteLast
    ? replyHref(request.bookingId, request.itemId, replyTurn?.id || request.id)
    : followUpHref(request.bookingId, request.itemId, request.id);
  const amountFromText = reading.amountCents;
  const amountLabel = amountFromText
    ? formatMoney(amountFromText / 100, "EUR")
    : card && card.limitCents > 0
      ? formatMoney(card.limitCents / 100, card.currency || "EUR")
      : null;
  const asksPayment = Boolean(reading.signal) || request.kind === "payment_link";
  const paymentState: HotelInboxRow["paymentState"] =
    reading.outcome === "paid"
      ? "paid"
      : reading.outcome === "authorized"
        ? "authorized"
        : reading.outcome === "probable"
          ? "probable"
          : !asksPayment
            ? "hidden"
            : !paymentsKnown
              ? "unknown"
              : "unpaid";
  const ceiling = amountFromText
    ? (amountFromText / 100).toFixed(2).replace(".", ",")
    : card && card.limitCents > 0
      ? (card.limitCents / 100).toFixed(2).replace(".", ",")
      : "";
  const digits = reading.outcome === "paid" ? fourDigits(card?.last4) : null;
  const paidLabel =
    reading.paidLabel && digits && !reading.paidLabel.includes("••") ? `${reading.paidLabel} · ••${digits}` : reading.paidLabel;
  const lineStatus = (section === "upcoming" || section === "paid") && paidLabel ? paidLabel : section === "paid" ? "Payé" : status;
  const showCard = Boolean(card && card.status === "active" && (section === "payment" || section === "ended"));
  return {
    id: `${request.bookingId}:${request.itemId}`,
    requestId: request.id,
    bookingId: request.bookingId,
    itemId: request.itemId,
    kind: request.kind,
    kindLabel: kindLabel(request.kind),
    hotel: request.hotelName || "Hôtel",
    city: request.city,
    reference: request.reference,
    clientName: request.clientName,
    clientFirst: request.clientFirst,
    clientLast: request.clientLast,
    stayLabel: stayLabel(request.stayStart, request.itemEnd || request.bookingEnd),
    status: lineStatus,
    lastWriter: reading.hotelWroteLast ? "L'hôtel" : "L'agence",
    activityAt: reading.activityAt,
    excerpt: reading.excerpt,
    href,
    dossierHref: `/admin/reservations/${request.bookingId}?hotel=${encodeURIComponent(request.itemId)}`,
    signal: reading.signal,
    payUrl: reading.payUrl,
    amountLabel,
    paymentState,
    paidLabel,
    cardLabel: showCard && card ? pliantCardCaption(card) : null,
    ceilingEuros: ceiling,
    followUpLabel: followUpCountLabel(request.followUpCount),
    arrivalAt: request.stayStart || "",
    section,
  };
}

const SECTION_RANK = { payment: 0, reply: 1, upcoming: 2, unanswered: 3, waiting: 4, rest: 5, paid: 6, ended: 7 } as const;

/**
 * Une ligne par dossier et par hôtel.
 * En haut : paiement à faire et réponse non payée.
 * Puis les séjours à venir ou en cours, visibles.
 * Les séjours terminés payés, et ceux au paiement jamais réglé, restent repliés.
 */
export function buildHotelInbox(
  requests: HotelInboxRequest[],
  spends: HotelPliantSpend[],
  paymentsKnown: boolean,
  cards: HotelInboxCard[],
  links: HotelInboxLink[],
  nowMs = Date.now(),
  evidence: HotelPaymentEvidence[] = []
): HotelInbox {
  const knownEvidence = paymentsKnown ? [...evidenceFromSpends(spends), ...evidence] : [];
  const readings = requests
    .filter((request) => request.status === "sent" || request.status === "follow_up" || request.status === "replied")
    .map((request) => readRequest(request, knownEvidence, paymentsKnown, nowMs));
  const hotelsByBooking = new Map<string, Set<string>>();
  for (const reading of readings) {
    const set = hotelsByBooking.get(reading.request.bookingId) || new Set<string>();
    set.add(reading.request.hotelName);
    hotelsByBooking.set(reading.request.bookingId, set);
  }
  const groups = new Map<string, Reading[]>();
  for (const reading of readings) {
    const key = `${reading.request.bookingId}:${reading.request.itemId}`;
    const list = groups.get(key) || [];
    list.push(reading);
    groups.set(key, list);
  }
  const inbox: HotelInbox = { payment: [], replies: [], unanswered: [], waiting: [], rest: [], upcoming: [], paid: [], endedUnpaid: [] };
  for (const list of groups.values()) {
    if (list.every((reading) => reading.cancelled)) continue;
    const open = list.filter((reading) => !reading.cancelled);
    const ended = open.every((reading) => reading.ended);
    const picked = choose(open, ended);
    if (!picked) continue;
    const pick = picked.reading;
    const section = picked.section;
    const others = [...(hotelsByBooking.get(pick.request.bookingId) || [])].filter((name) => name && name !== pick.request.hotelName);
    const linked = links
      .filter(
        (link) =>
          (link.itemId && link.itemId === pick.request.itemId) ||
          (link.requestId && open.some((reading) => reading.request.id === link.requestId))
      )
      .map((link) => link.pliantCardId);
    const card =
      section === "payment" || section === "ended" || pick.outcome === "paid"
        ? matchHotelInboxCard({
            bookingId: pick.request.bookingId,
            hotelName: pick.request.hotelName,
            amountCents: pick.amountCents,
            cards,
            linkedPliantIds: linked,
            otherHotels: others,
          })
        : null;
    if (!section) continue;
    const row = rowOf(pick, section, nowMs, card, paymentsKnown);
    if (section === "payment") inbox.payment.push(row);
    else if (section === "reply") inbox.replies.push(row);
    else if (section === "unanswered") inbox.unanswered.push(row);
    else if (section === "waiting") inbox.waiting.push(row);
    else if (section === "rest") inbox.rest.push(row);
    else if (section === "upcoming") inbox.upcoming.push(row);
    else if (section === "paid") inbox.paid.push(row);
    else inbox.endedUnpaid.push(row);
  }
  const oldest = (a: HotelInboxRow, b: HotelInboxRow) => a.activityAt.localeCompare(b.activityAt) || a.id.localeCompare(b.id);
  const byArrival = (a: HotelInboxRow, b: HotelInboxRow) =>
    (a.arrivalAt || "9999").localeCompare(b.arrivalAt || "9999") || a.hotel.localeCompare(b.hotel) || a.id.localeCompare(b.id);
  inbox.payment.sort(oldest);
  inbox.replies.sort(oldest);
  inbox.unanswered.sort(oldest);
  inbox.waiting.sort(oldest);
  inbox.rest.sort(oldest);
  inbox.upcoming.sort(byArrival);
  inbox.paid.sort(oldest);
  inbox.endedUnpaid.sort(oldest);
  return inbox;
}

function sectionOf(reading: Reading, ended: boolean): HotelInboxRow["section"] | null {
  if (ended) {
    if (reading.outcome !== "none" && !reading.askedAfter) return "paid";
    if (reading.signal && reading.real && !reading.noise && reading.outcome === "none" && !reading.settledText) return "ended";
    return null;
  }
  // À venir ou en cours : le paiement reste visible, y compris un fil classé.
  if (reading.outcome !== "none") {
    if (reading.askedAfter && !reading.classified && !reading.noise) return "reply";
    return "upcoming";
  }
  if (reading.classified || reading.noise) return "rest";
  const payable = Boolean(reading.signal) && reading.real && reading.hotelWroteLast && !reading.settledText;
  if (payable) return "payment";
  if (reading.settledText || reading.confirmed) return null;
  if (reading.hotelWroteLast && reading.real) return "reply";
  if (!reading.real) {
    if (!Number.isFinite(time(reading.outboundAt))) return null;
    return "upcoming";
  }
  // L’agence a écrit après une vraie réponse : le fil reste dans Le reste, replié.
  return "rest";
}

function choose(list: Reading[], ended: boolean) {
  const ranked = list
    .map((reading) => ({ reading, section: sectionOf(reading, ended) }))
    .filter((item): item is { reading: Reading; section: HotelInboxRow["section"] } => Boolean(item.section));
  if (ended) {
    const paid = ranked.filter((item) => item.section === "paid");
    if (paid.length) {
      paid.sort((a, b) => time(b.reading.activityAt) - time(a.reading.activityAt));
      return paid[0];
    }
    const unpaid = ranked.filter((item) => item.section === "ended");
    unpaid.sort((a, b) => time(a.reading.activityAt) - time(b.reading.activityAt));
    return unpaid[0] || null;
  }
  ranked.sort((a, b) => SECTION_RANK[a.section] - SECTION_RANK[b.section] || time(a.reading.activityAt) - time(b.reading.activityAt));
  return ranked[0] || null;
}

/** Réponses à traiter : paiement à faire et autres réponses. Le badge de l’onglet. */
export function hotelInboxActionCount(inbox: HotelInbox) {
  return inbox.payment.length + inbox.replies.length;
}
