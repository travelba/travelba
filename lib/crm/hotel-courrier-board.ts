import { hotelReplyHref, meaningfulMailExcerpt, noticeHotelName } from "./hotel-reply-notice";
import { HOTEL_DESK_LABELS } from "./hotel-desk";
import { followUpCountLabel, followUpHref, isUnanswered } from "./mail-followup";
import { formatMoney } from "./money";
import { pliantSpendCopy } from "./pliant-booking";
import type { HotelDeskKind } from "./types";

/** Trois courriers visibles, le reste derrière Voir plus. */
export const DASHBOARD_MAIL_PREVIEW = 3;

/** Autorisation encore ouverte : le paiement est passé, Pliant n’a pas soldé. */
const AUTHORIZED_PAYMENT = new Set(["PENDING"]);
/** Achat soldé, comme le grand livre Pliant. */
const SETTLED_PAYMENT = new Set(["BOOKED", "CONFIRMED"]);
/** Fenêtre d’un règlement d’hôtel : avant l’arrivée, jusqu’au départ. */
const PAYMENT_BEFORE_STAY_MS = 90 * 24 * 60 * 60 * 1000;
const PAYMENT_AFTER_STAY_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_HOTEL_WORD = new Set(["hotel", "hotels", "resort", "resorts", "palace", "beach", "suite", "suites", "spa"]);

export type HotelCourrierReply = {
  id: string;
  body: string;
  receivedAt: string;
};

/** Un tour du fil Gmail : nous, ou l’hôtel. */
export type HotelCourrierTurn = {
  id: string;
  at: string;
  direction: "out" | "in";
  body: string;
  countsAsReply: boolean;
};

/** Courrier déjà parti (envoyé, relancé ou répondu). */
export type HotelCourrierSource = {
  id: string;
  bookingId: string;
  itemId: string;
  kind: string;
  status: string;
  sentAt: string | null;
  lastFollowUpAt: string | null;
  repliedAt: string | null;
  replyBody: string;
  hotelName: string;
  itemTitle: string;
  reference: string;
  replies: HotelCourrierReply[];
  followUpCount?: number;
  /** Tours du fil, nous compris. Absent : on les reconstruit depuis l’envoi et les réponses. */
  turns?: HotelCourrierTurn[];
  bookingStatus?: string;
  bookingArchived?: boolean;
  bookingEnd?: string | null;
  itemEnd?: string | null;
  itemLifecycle?: string | null;
  /** Classement manuel. Il prime tant qu’aucun message entrant n’est plus récent. */
  classifiedAt?: string | null;
  /** Hôtels actifs du dossier. Absent : on ne devine pas un paiement de carte dossier. */
  hotelCount?: number;
  stayStart?: string | null;
  stayAmountCents?: number | null;
  stayAmountCurrency?: string | null;
  /** Autres lignes hôtel du même dossier, pour ne pas coller un débit au mauvais séjour. */
  siblingItemIds?: string[];
  siblingHotelNames?: string[];
};

/** Efface le classement. Aucun e-mail. */
export const HOTEL_COURRIER_CLASS_CLEAR = {
  classified_at: null,
  classified_by: null,
  classified_by_name: null,
  classified_note: null,
} as const;

/** Dépense Pliant déjà rattachée à l’hôtel, au courrier, ou à une carte du dossier. Sans numéro de carte. */
export type HotelPliantSpend = {
  bookingItemId: string | null;
  hotelRequestId: string | null;
  transactionId: string;
  status: string | null;
  type: string | null;
  billingCents: number | string | null;
  billingCurrency: string | null;
  bookedAt: string | null;
  /** Dossier de la carte émise, quand l’achat n’est pas déjà pointé sur l’hôtel. */
  bookingId?: string | null;
  /** Libellé ou objet de la carte. Jamais un numéro. */
  cardPurpose?: string | null;
  /** Ligne du coût : l’hôtel, ou une dépense à part. */
  costItemId?: string | null;
};

export type HotelPliantPayment = {
  amount: number;
  currency: string;
  bookedAt: string;
  state: "authorized" | "settled";
};

export type DashboardCourrier = {
  id: string;
  title: string;
  reference: string;
  excerpt: string;
  detail: string;
  receivedAt: string;
  href: string;
  mark: string;
  /** L’hôtel a écrit en dernier, ou nous attendons encore sa réponse. */
  replyState: "treat" | "waiting" | "silent";
  replyLabel: string;
  /** Qui a écrit le dernier message du fil. */
  lastWriter: "L'hôtel" | "L'agence";
  followUpLabel: string | null;
  paymentState: "paid" | "unpaid" | "hidden";
  paymentLabel: string | null;
};

/** Fil sans nouveau message, et séjour déjà terminé : on retire le courrier. */
export const HOTEL_THREAD_INACTIVE_MS = 14 * 24 * 60 * 60 * 1000;

const SENT = new Set(["sent", "follow_up", "replied"]);

function deskKindLabel(kind: string) {
  if (!(kind in HOTEL_DESK_LABELS)) return "";
  return HOTEL_DESK_LABELS[kind as HotelDeskKind];
}

function time(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function latestMoment(values: (string | null | undefined)[]) {
  let best = "";
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const ms = time(value);
    if (!Number.isFinite(ms) || ms < bestMs) continue;
    bestMs = ms;
    best = value || "";
  }
  return best;
}

function centsOf(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Vrai si l’hôtel a répondu au courrier (statut du bureau, ou un message qui compte). */
export function courrierReplyReceived(row: Pick<HotelCourrierSource, "status" | "replies">) {
  if (row.status === "replied") return true;
  return row.replies.some((reply) => Boolean(reply.receivedAt));
}

function paymentStateOf(status: string): HotelPliantPayment["state"] | null {
  if (SETTLED_PAYMENT.has(status)) return "settled";
  if (AUTHORIZED_PAYMENT.has(status)) return "authorized";
  return null;
}

/** Dernier achat Pliant qui compte. Refus, annulation, remboursement et montant nul : non. Une autorisation compte. */
export function latestHotelPliantPayment(spends: HotelPliantSpend[]): HotelPliantPayment | null {
  const hits: { payment: HotelPliantPayment; id: string; rank: number }[] = [];
  for (const spend of spends) {
    const status = (spend.status || "").trim().toUpperCase();
    const state = paymentStateOf(status);
    if (!state) continue;
    const cents = centsOf(spend.billingCents);
    const copy = pliantSpendCopy({
      type: spend.type,
      status: spend.status,
      billingCents: cents,
      currency: spend.billingCurrency,
    });
    if (!copy) continue;
    hits.push({
      id: spend.transactionId,
      rank: state === "settled" ? 1 : 0,
      payment: {
        amount: copy.amount,
        currency: copy.currency,
        bookedAt: spend.bookedAt || "",
        state,
      },
    });
  }
  hits.sort(
    (a, b) => time(b.payment.bookedAt) - time(a.payment.bookedAt) || b.rank - a.rank || a.id.localeCompare(b.id)
  );
  return hits[0]?.payment || null;
}

function foldHotel(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function distinctiveTokens(name: string) {
  return foldHotel(name)
    .split(" ")
    .filter((token) => token.length >= 5 && !GENERIC_HOTEL_WORD.has(token));
}

function purposeNamesHotel(purpose: string, hotelName: string) {
  const hay = foldHotel(purpose);
  const full = foldHotel(hotelName);
  if (!hay || full.length < 4) return false;
  if (hay.includes(full)) return true;
  return distinctiveTokens(hotelName).some((token) => hay.includes(token));
}

function dayMs(value: string | null | undefined) {
  const day = (value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Number.NaN;
  return Date.parse(`${day}T12:00:00Z`);
}

function dateNearStay(bookedAt: string | null | undefined, start: string | null | undefined, end: string | null | undefined) {
  const at = time(bookedAt) || dayMs(bookedAt);
  if (!Number.isFinite(at)) return false;
  const startMs = dayMs(start);
  const endMs = dayMs(end);
  const from = Number.isFinite(startMs) ? startMs : endMs;
  const to = Number.isFinite(endMs) ? endMs : startMs;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
  return at >= from - PAYMENT_BEFORE_STAY_MS && at <= to + PAYMENT_AFTER_STAY_MS;
}

function amountNearStay(spend: HotelPliantSpend, row: HotelCourrierSource) {
  const stay = row.stayAmountCents;
  if (stay == null || !Number.isFinite(stay) || stay <= 0) return false;
  const paid = centsOf(spend.billingCents);
  if (paid == null) return false;
  const cents = Math.abs(Math.round(paid));
  if (cents === 0) return false;
  const paidCode = (spend.billingCurrency || "EUR").trim().toUpperCase();
  const stayCode = (row.stayAmountCurrency || "EUR").trim().toUpperCase();
  if (paidCode !== stayCode) return false;
  return Math.abs(cents - stay) <= Math.max(100, Math.round(stay * 0.2));
}

function purposeMatchesThisHotel(row: HotelCourrierSource, purpose: string) {
  const name = noticeHotelName({ hotelName: row.hotelName, title: row.itemTitle });
  if (!purposeNamesHotel(purpose, name)) return false;
  return !(row.siblingHotelNames || []).some((sibling) => sibling && purposeNamesHotel(purpose, sibling));
}

/**
 * Carte émise sur le dossier, pas encore liée à l’hôtel.
 * Un seul hôtel : l’achat compte. Le coût posé sur cette ligne aussi.
 * Sinon, seulement si l’objet de la carte nomme cet hôtel et que le montant et la date collent au séjour.
 */
export function dossierCardSpendCounts(row: HotelCourrierSource, spend: HotelPliantSpend) {
  if (!spend.bookingId || spend.bookingId !== row.bookingId) return false;
  if (spend.costItemId && spend.costItemId === row.itemId) return true;
  if (spend.costItemId && (row.siblingItemIds || []).includes(spend.costItemId)) return false;
  if (row.hotelCount === 1) return true;
  if (row.hotelCount == null || row.hotelCount < 2) return false;
  const purpose = (spend.cardPurpose || "").trim();
  if (!purpose || !purposeMatchesThisHotel(row, purpose)) return false;
  return dateNearStay(spend.bookedAt, row.stayStart, row.itemEnd || row.bookingEnd) && amountNearStay(spend, row);
}

function directlyLinked(row: HotelCourrierSource, spend: HotelPliantSpend) {
  return (
    (spend.bookingItemId != null && spend.bookingItemId === row.itemId) ||
    (spend.hotelRequestId != null && spend.hotelRequestId === row.id)
  );
}

function linkScore(row: HotelCourrierSource, spend: HotelPliantSpend) {
  let score = 0;
  if (spend.bookingItemId != null && spend.bookingItemId === row.itemId) score += 4;
  if (spend.hotelRequestId != null && spend.hotelRequestId === row.id) score += 2;
  if (spend.costItemId != null && spend.costItemId === row.itemId) score += 1;
  return score;
}

function spendsForCourrier(row: HotelCourrierSource, spends: HotelPliantSpend[]) {
  if (row.kind !== "payment_link") return [];
  const byId = new Map<string, HotelPliantSpend>();
  for (const spend of spends) {
    if (!directlyLinked(row, spend) && !dossierCardSpendCounts(row, spend)) continue;
    const prev = byId.get(spend.transactionId);
    if (!prev || linkScore(row, spend) > linkScore(row, prev)) byId.set(spend.transactionId, spend);
  }
  return [...byId.values()];
}

export function pliantPaymentCaption(payment: HotelPliantPayment | null) {
  if (!payment) return "Pas de paiement Pliant";
  const amount = formatMoney(payment.amount, payment.currency);
  const when = payment.bookedAt && Number.isFinite(time(payment.bookedAt)) ? formatPaymentDate(payment.bookedAt) : "";
  const verb = payment.state === "authorized" ? "Paiement Pliant autorisé" : "Paiement Pliant effectué";
  return when ? `${verb} · ${amount} · ${when}` : `${verb} · ${amount}`;
}

function formatPaymentDate(value: string) {
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
}

function parisDay(ms: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function stayEndOf(row: HotelCourrierSource) {
  for (const value of [row.bookingEnd, row.itemEnd]) {
    const day = (value || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  }
  return "";
}

function turnsOf(row: HotelCourrierSource): HotelCourrierTurn[] {
  if (row.turns?.length) return row.turns;
  const turns: HotelCourrierTurn[] = [];
  if (row.sentAt) {
    turns.push({ id: `out:${row.id}`, at: row.sentAt, direction: "out", body: "", countsAsReply: false });
  }
  if (row.lastFollowUpAt) {
    turns.push({ id: `follow:${row.id}`, at: row.lastFollowUpAt, direction: "out", body: "", countsAsReply: false });
  }
  for (const reply of row.replies) {
    if (!reply.receivedAt) continue;
    turns.push({ id: reply.id, at: reply.receivedAt, direction: "in", body: reply.body, countsAsReply: true });
  }
  if (!row.replies.length && row.repliedAt) {
    turns.push({
      id: `reply:${row.id}`,
      at: row.repliedAt,
      direction: "in",
      body: row.replyBody,
      countsAsReply: true,
    });
  }
  return turns;
}

/** Tours qui comptent : nos envois, et les vraies réponses. Une absence ne décide pas. */
function realTurns(turns: HotelCourrierTurn[]) {
  return turns
    .filter((turn) => turn.direction === "out" || turn.countsAsReply)
    .filter((turn) => Number.isFinite(time(turn.at)))
    .sort((a, b) => time(a.at) - time(b.at) || a.id.localeCompare(b.id));
}

function asksSomething(text: string) {
  return /\?/.test(text) || /\b(?:please|kindly|could you|can you|merci de|pouvez-vous|veuillez)\b/i.test(text);
}

/** L’hôtel confirme la demande. Une question, ou un refus, ne ferme pas le courrier. */
export function hotelConfirmedText(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat || asksSomething(flat)) return false;
  if (/(?:^|[^\p{L}])(?:not|no longer|pas encore|n['’]est pas|non)(?![\p{L}]).{0,24}confirm/iu.test(flat)) return false;
  return /(?:^|[^\p{L}])(?:pleased to confirm|we confirm|nous confirmons|confirmed|confirmée|confirmé)(?![\p{L}])/iu.test(flat);
}

/**
 * Le classement manuel tient tant qu’aucun message entrant de l’hôtel n’est plus récent.
 * Un message à la même seconde ne rouvre pas : il faut qu’il arrive après.
 */
export function classificationStillHolds(
  classifiedAt: string | null | undefined,
  turns: { at: string; direction: string }[]
) {
  if (!classifiedAt) return false;
  const mark = time(classifiedAt);
  if (!Number.isFinite(mark)) return false;
  return !turns.some((turn) => turn.direction === "in" && Number.isFinite(time(turn.at)) && time(turn.at) > mark);
}

/** Vrai si un message entrant est arrivé après le classement : le fil est rouvert. */
export function classificationSuperseded(
  classifiedAt: string | null | undefined,
  turns: { at: string; direction: string }[]
) {
  return Boolean(classifiedAt) && !classificationStillHolds(classifiedAt, turns);
}

/** Le lien est payé, dit par l’hôtel. « Le lien est prêt » ne compte pas. */
export function paymentSettledText(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat || asksSomething(flat)) return false;
  return /(?:^|[^\p{L}])(?:payment (?:has been )?(?:received|successful|completed|confirmed)|paiement (?:a été )?(?:reçu|effectué|effectue|confirmé)|paid in full)(?![\p{L}])/iu.test(
    flat
  );
}

export type CourrierCloseReason = "payment" | "confirmed" | "cancelled" | "past";

/**
 * Le besoin est réglé : on retire le courrier de la liste d’action.
 * Paiement Pliant ou lien payé, confirmation de l’hôtel, dossier annulé,
 * ou fil muet sur un séjour déjà passé.
 * Un lien déjà payé reste ouvert seulement si l’hôtel a posé une question après le paiement.
 */
export function courrierCloseReason(input: {
  kind: string;
  bookingStatus: string;
  bookingArchived: boolean;
  itemLifecycle: string | null;
  stayEnd: string;
  payment: HotelPliantPayment | null;
  paymentsKnown: boolean;
  hotelWroteLast: boolean;
  latestHotelText: string;
  /** Heure du dernier message de l’hôtel. Vide si l’hôtel n’a pas écrit. */
  latestHotelAt: string;
  lastActivityMs: number;
  nowMs: number;
}): CourrierCloseReason | null {
  if (input.bookingStatus === "cancelled" || input.bookingArchived || input.itemLifecycle === "cancelled") {
    return "cancelled";
  }
  if (input.kind === "payment_link" && input.paymentsKnown && input.payment) {
    const paymentAt = time(input.payment.bookedAt);
    const hotelAt = time(input.latestHotelAt);
    const askedAfterPayment =
      input.hotelWroteLast &&
      asksSomething(input.latestHotelText) &&
      !paymentSettledText(input.latestHotelText) &&
      (!Number.isFinite(paymentAt) || (Number.isFinite(hotelAt) && hotelAt > paymentAt));
    if (!askedAfterPayment) return "payment";
  }
  if (input.kind === "payment_link" && paymentSettledText(input.latestHotelText)) return "payment";
  if (input.kind !== "payment_link" && input.hotelWroteLast && hotelConfirmedText(input.latestHotelText)) {
    return "confirmed";
  }
  const today = parisDay(input.nowMs);
  if (input.stayEnd && input.stayEnd < today && Number.isFinite(input.lastActivityMs)) {
    if (input.nowMs - input.lastActivityMs >= HOTEL_THREAD_INACTIVE_MS) return "past";
  }
  return null;
}

const ACTION_RANK = { treat: 0, silent: 1, waiting: 2 } as const;

/**
 * Courriers qui attendent une action, le plus urgent d’abord.
 * L’agence a répondu en dernier : le courrier sort. L’hôtel a écrit en dernier : « Réponse à traiter ».
 * `paymentsKnown` faux : on ne conclut pas qu’un lien est payé, et on n’écrit pas « Pas de paiement ».
 */
export function dashboardCourriers(
  rows: HotelCourrierSource[],
  spends: HotelPliantSpend[],
  paymentsKnown: boolean,
  nowMs = Date.now()
): DashboardCourrier[] {
  const lines: DashboardCourrier[] = [];
  for (const row of rows) {
    if (!SENT.has(row.status)) continue;
    const mark = deskKindLabel(row.kind);
    if (!mark) continue;
    const openedTurns = turnsOf(row);
    if (classificationStillHolds(row.classifiedAt, openedTurns)) continue;
    const ordered = realTurns(openedTurns);
    const last = ordered[ordered.length - 1] || null;
    const hotelWroteLast = last?.direction === "in";
    const agencyAfterHotel =
      last?.direction === "out" && ordered.some((turn) => turn.direction === "in" && time(turn.at) <= time(last.at));
    const latestHotel = [...ordered].reverse().find((turn) => turn.direction === "in");
    const latestHotelText = meaningfulMailExcerpt(latestHotel?.body || "", 400);
    const moment = last?.at || latestMoment([row.repliedAt, row.lastFollowUpAt, row.sentAt]);
    if (!moment) continue;
    const payment =
      row.kind === "payment_link" && paymentsKnown ? latestHotelPliantPayment(spendsForCourrier(row, spends)) : null;
    const closed = courrierCloseReason({
      kind: row.kind,
      bookingStatus: row.bookingStatus || "",
      bookingArchived: Boolean(row.bookingArchived),
      itemLifecycle: row.itemLifecycle || null,
      stayEnd: stayEndOf(row),
      payment,
      paymentsKnown,
      hotelWroteLast,
      latestHotelText,
      latestHotelAt: latestHotel?.at || "",
      lastActivityMs: time(moment),
      nowMs,
    });
    if (closed || agencyAfterHotel) continue;
    const showPayment = row.kind === "payment_link" && paymentsKnown;
    const silent = !hotelWroteLast && isUnanswered({
      status: row.status === "replied" ? "sent" : row.status,
      sentAt: row.sentAt,
      lastFollowUpAt: row.lastFollowUpAt,
      hasReply: false,
      nowMs,
    });
    const replyState = hotelWroteLast ? "treat" : silent ? "silent" : "waiting";
    const excerpt = hotelWroteLast ? meaningfulMailExcerpt(latestHotel?.body || row.replyBody || "") : "";
    const reference = (row.reference || "").trim();
    const followUps = row.followUpCount || 0;
    lines.push({
      id: row.id,
      title: noticeHotelName({ hotelName: row.hotelName, title: row.itemTitle }),
      reference,
      excerpt,
      detail: [reference, excerpt].filter(Boolean).join(" · "),
      receivedAt: moment,
      href: hotelWroteLast ? hotelReplyHref(row.bookingId, row.itemId) : followUpHref(row.bookingId, row.itemId, row.id),
      mark,
      replyState,
      replyLabel: hotelWroteLast ? "Réponse à traiter" : silent ? "Sans réponse" : "En attente de réponse",
      lastWriter: hotelWroteLast ? "L'hôtel" : "L'agence",
      followUpLabel: followUpCountLabel(followUps),
      paymentState: !showPayment ? "hidden" : payment ? "paid" : "unpaid",
      paymentLabel: showPayment ? pliantPaymentCaption(payment) : null,
    });
  }
  return lines.sort(
    (a, b) => ACTION_RANK[a.replyState] - ACTION_RANK[b.replyState] || time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id)
  );
}
