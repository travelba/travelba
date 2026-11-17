import { HOTEL_DESK_LABELS, hotelReplyForDesk, hotelReplyLink, isAutomaticHotelMail } from "./hotel-desk";
import {
  classificationStillHolds,
  hotelConfirmedText,
  latestHotelPliantPayment,
  paymentSettledText,
  stayDepartureDay,
  stayEndedBeforeToday,
  type HotelCourrierTurn,
  type HotelPliantSpend,
} from "./hotel-courrier-board";
import { followUpCountLabel, followUpHref, outboundAnchor, UNANSWERED_AFTER_MS } from "./mail-followup";
import { replyHref } from "./mail-reply";
import { formatMoney } from "./money";
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
  paymentState: "unpaid" | "paid" | "unknown" | "hidden";
  paidLabel: string | null;
  cardLabel: string | null;
  ceilingEuros: string;
  followUpLabel: string | null;
  section: "payment" | "reply" | "unanswered" | "waiting" | "rest" | "ended";
};

export type HotelInbox = {
  payment: HotelInboxRow[];
  replies: HotelInboxRow[];
  unanswered: HotelInboxRow[];
  waiting: HotelInboxRow[];
  rest: HotelInboxRow[];
  endedUnpaid: HotelInboxRow[];
  /** Lecture principale en échec. Les listes sont vides, le bandeau le dit. */
  loadError?: string | null;
};

export const HOTEL_INBOX_LOAD_ERROR = "Lecture des courriers impossible, réessayez";

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

function asksSomething(text: string) {
  return /\?/.test(text) || /\b(?:please|kindly|could you|can you|merci de|pouvez-vous|veuillez)\b/i.test(text);
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
  paid: boolean;
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
  spends: HotelPliantSpend[],
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
  const linkedSpends = spends.filter(
    (spend) =>
      (spend.bookingItemId != null && spend.bookingItemId === request.itemId) ||
      (spend.hotelRequestId != null && spend.hotelRequestId === request.id)
  );
  const payment = signal && paymentsKnown ? latestHotelPliantPayment(linkedSpends) : null;
  const paid = Boolean(payment);
  const paidAt = payment?.bookedAt || "";
  const askedAfter =
    paid &&
    hotelWroteLast &&
    asksSomething(text) &&
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
    paid,
    paidLabel: payment
      ? `Payé le ${formatFrenchDay(stayDepartureDay(payment.bookedAt, null) || parisIsoDate(new Date(time(payment.bookedAt) || nowMs)))} · ${formatMoney(payment.amount, payment.currency)}`
      : null,
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
  const status =
    section === "unanswered"
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
  const paymentState: HotelInboxRow["paymentState"] = !reading.signal
    ? "hidden"
    : !paymentsKnown
      ? "unknown"
      : reading.paid
        ? "paid"
        : "unpaid";
  const ceiling = amountFromText
    ? (amountFromText / 100).toFixed(2).replace(".", ",")
    : card && card.limitCents > 0
      ? (card.limitCents / 100).toFixed(2).replace(".", ",")
      : "";
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
    status,
    lastWriter: reading.hotelWroteLast ? "L'hôtel" : "L'agence",
    activityAt: reading.activityAt,
    excerpt: reading.excerpt,
    href,
    dossierHref: `/admin/reservations/${request.bookingId}?hotel=${encodeURIComponent(request.itemId)}`,
    signal: reading.signal,
    payUrl: reading.payUrl,
    amountLabel,
    paymentState,
    paidLabel: reading.paidLabel,
    cardLabel: card && card.status === "active" ? pliantCardCaption(card) : null,
    ceilingEuros: ceiling,
    followUpLabel: followUpCountLabel(request.followUpCount),
    section,
  };
}

const SECTION_RANK = { payment: 0, reply: 1, unanswered: 2, waiting: 3, rest: 4, ended: 5 } as const;

/**
 * Une ligne par dossier et par hôtel.
 * (a) paiement à faire, (b) autre réponse, (c) sans réponse, (d) le reste, puis les séjours terminés impayés.
 */
export function buildHotelInbox(
  requests: HotelInboxRequest[],
  spends: HotelPliantSpend[],
  paymentsKnown: boolean,
  cards: HotelInboxCard[],
  links: HotelInboxLink[],
  nowMs = Date.now()
): HotelInbox {
  const readings = requests
    .filter((request) => request.status === "sent" || request.status === "follow_up" || request.status === "replied")
    .map((request) => readRequest(request, spends, paymentsKnown, nowMs));
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
  const inbox: HotelInbox = { payment: [], replies: [], unanswered: [], waiting: [], rest: [], endedUnpaid: [] };
  for (const list of groups.values()) {
    if (list.every((reading) => reading.cancelled)) continue;
    const open = list.filter((reading) => !reading.cancelled);
    const ended = open.every((reading) => reading.ended);
    const picked = choose(open, ended, nowMs);
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
      section === "payment" || section === "ended"
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
    else inbox.endedUnpaid.push(row);
  }
  const oldest = (a: HotelInboxRow, b: HotelInboxRow) => a.activityAt.localeCompare(b.activityAt) || a.id.localeCompare(b.id);
  inbox.payment.sort(oldest);
  inbox.replies.sort(oldest);
  inbox.unanswered.sort(oldest);
  inbox.waiting.sort(oldest);
  inbox.rest.sort(oldest);
  inbox.endedUnpaid.sort(oldest);
  return inbox;
}

function sectionOf(reading: Reading, ended: boolean, nowMs: number): HotelInboxRow["section"] | null {
  if (ended) {
    if (reading.signal && reading.real && !reading.noise && !reading.paid && !reading.settledText && !reading.askedAfter) return "ended";
    return null;
  }
  if (reading.classified || reading.noise) return "rest";
  const payable = Boolean(reading.signal) && reading.real && reading.hotelWroteLast && !reading.paid && !reading.settledText && !reading.askedAfter;
  if (payable) return "payment";
  if (reading.settledText || reading.confirmed || (reading.paid && !reading.askedAfter)) return null;
  if (reading.hotelWroteLast && reading.real) return "reply";
  if (!reading.real) {
    const at = time(reading.outboundAt);
    if (!Number.isFinite(at)) return null;
    return nowMs - at >= UNANSWERED_AFTER_MS ? "unanswered" : "waiting";
  }
  // L’agence a écrit après une vraie réponse : le fil reste dans Le reste, replié.
  return "rest";
}

function choose(list: Reading[], ended: boolean, nowMs: number) {
  const ranked = list
    .map((reading) => ({ reading, section: sectionOf(reading, ended, nowMs) }))
    .filter((item): item is { reading: Reading; section: HotelInboxRow["section"] } => Boolean(item.section));
  if (ended) {
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
