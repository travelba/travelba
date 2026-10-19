import { hotelReplyHref, noticeHotelName, replyExcerpt } from "./hotel-reply-notice";
import { HOTEL_DESK_LABELS } from "./hotel-desk";
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
  detail: string;
  receivedAt: string;
  href: string;
  mark: string;
  replyState: "received" | "waiting";
  replyLabel: string;
  paymentState: "paid" | "unpaid" | "hidden";
  paymentLabel: string | null;
};

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

function latestReply(replies: HotelCourrierReply[]) {
  return [...replies].sort((a, b) => time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id))[0] || null;
}

/**
 * Un courrier envoyé par ligne, le plus récent d’abord.
 * `paymentsKnown` faux : on n’affiche pas « Pas de paiement » (la lecture a échoué).
 */
export function dashboardCourriers(
  rows: HotelCourrierSource[],
  spends: HotelPliantSpend[],
  paymentsKnown: boolean
): DashboardCourrier[] {
  const lines: DashboardCourrier[] = [];
  for (const row of rows) {
    if (!SENT.has(row.status)) continue;
    const mark = deskKindLabel(row.kind);
    if (!mark) continue;
    const received = courrierReplyReceived(row);
    const reply = latestReply(row.replies);
    const excerpt = received ? replyExcerpt(reply?.body || row.replyBody || "") : "";
    const reference = (row.reference || "").trim();
    const moment = received
      ? latestMoment([reply?.receivedAt, row.repliedAt, row.lastFollowUpAt, row.sentAt])
      : latestMoment([row.lastFollowUpAt, row.sentAt]);
    if (!moment) continue;
    const payment =
      row.kind === "payment_link" && paymentsKnown ? latestHotelPliantPayment(spendsForCourrier(row, spends)) : null;
    const showPayment = row.kind === "payment_link" && paymentsKnown;
    lines.push({
      id: row.id,
      title: noticeHotelName({ hotelName: row.hotelName, title: row.itemTitle }),
      detail: [reference, excerpt].filter(Boolean).join(" · "),
      receivedAt: moment,
      href: hotelReplyHref(row.bookingId, row.itemId),
      mark,
      replyState: received ? "received" : "waiting",
      replyLabel: received ? "Réponse reçue" : "En attente de réponse",
      paymentState: !showPayment ? "hidden" : payment ? "paid" : "unpaid",
      paymentLabel: showPayment ? pliantPaymentCaption(payment) : null,
    });
  }
  return lines.sort((a, b) => time(b.receivedAt) - time(a.receivedAt) || a.id.localeCompare(b.id));
}
