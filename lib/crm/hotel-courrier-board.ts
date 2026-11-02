import { hotelReplyHref, meaningfulMailExcerpt, noticeHotelName } from "./hotel-reply-notice";
import { HOTEL_DESK_LABELS } from "./hotel-desk";
import { followUpCountLabel, followUpHref, isUnanswered } from "./mail-followup";
import { formatMoney } from "./money";
import { pliantSpendCopy } from "./pliant-booking";
import type { HotelDeskKind } from "./types";

/** Trois courriers visibles, le reste derrière Voir plus. */
export const DASHBOARD_MAIL_PREVIEW = 3;

/** Un achat réellement passé : réservé ou confirmé, comme le grand livre Pliant. */
const POSTED_PAYMENT = new Set(["BOOKED", "CONFIRMED"]);

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
};

/** Dépense Pliant déjà rattachée à l’hôtel ou au courrier. Sans numéro de carte. */
export type HotelPliantSpend = {
  bookingItemId: string | null;
  hotelRequestId: string | null;
  transactionId: string;
  status: string | null;
  type: string | null;
  billingCents: number | string | null;
  billingCurrency: string | null;
  bookedAt: string | null;
};

export type HotelPliantPayment = {
  amount: number;
  currency: string;
  bookedAt: string;
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

/** Dernier achat Pliant qui compte. Refus, attente, remboursement et montant nul : non. */
export function latestHotelPliantPayment(spends: HotelPliantSpend[]): HotelPliantPayment | null {
  const hits: { payment: HotelPliantPayment; id: string }[] = [];
  for (const spend of spends) {
    const status = (spend.status || "").trim().toUpperCase();
    if (!POSTED_PAYMENT.has(status)) continue;
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
      payment: {
        amount: copy.amount,
        currency: copy.currency,
        bookedAt: spend.bookedAt || "",
      },
    });
  }
  hits.sort((a, b) => time(b.payment.bookedAt) - time(a.payment.bookedAt) || a.id.localeCompare(b.id));
  return hits[0]?.payment || null;
}

function spendsForCourrier(row: HotelCourrierSource, spends: HotelPliantSpend[]) {
  if (row.kind !== "payment_link") return [];
  const seen = new Set<string>();
  const hits: HotelPliantSpend[] = [];
  for (const spend of spends) {
    const linked =
      (spend.bookingItemId != null && spend.bookingItemId === row.itemId) ||
      (spend.hotelRequestId != null && spend.hotelRequestId === row.id);
    if (!linked || seen.has(spend.transactionId)) continue;
    seen.add(spend.transactionId);
    hits.push(spend);
  }
  return hits;
}

export function pliantPaymentCaption(payment: HotelPliantPayment | null) {
  if (!payment) return "Pas de paiement Pliant";
  const amount = formatMoney(payment.amount, payment.currency);
  const when = payment.bookedAt && Number.isFinite(time(payment.bookedAt)) ? formatPaymentDate(payment.bookedAt) : "";
  return when ? `Paiement Pliant effectué · ${amount} · ${when}` : `Paiement Pliant effectué · ${amount}`;
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
  lastActivityMs: number;
  nowMs: number;
}): CourrierCloseReason | null {
  if (input.bookingStatus === "cancelled" || input.bookingArchived || input.itemLifecycle === "cancelled") {
    return "cancelled";
  }
  if (input.kind === "payment_link" && input.paymentsKnown && input.payment) {
    const stillOpen = input.hotelWroteLast && asksSomething(input.latestHotelText) && !paymentSettledText(input.latestHotelText);
    if (!stillOpen) return "payment";
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
    const ordered = realTurns(turnsOf(row));
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
