import { formatDateFr } from "./dates";
import type { PliantSpendLine } from "./pliant-cards";
import { pliantLedgerDraft } from "./pliant-match";
import { isActiveItem, isLedgerExpenseKind } from "./types";

/** Carte rattachée au dossier, prête pour le récap Pliant. */
export type PliantBookingCard = {
  pliantCardId: string;
  label: string;
  last4: string | null;
  ceilingCents: number | null;
  currency: string;
};

export type PliantCardRecap = PliantBookingCard & {
  spends: PliantSpendLine[];
  spentCents: number;
};

export type OwnedPliantCard = { itemId: string | null } | { closed: true };

/**
 * La carte appartient au dossier : carte générée, carte d’hôtel, ou registre.
 * Une carte clôturée ou supprimée ne s’ouvre pas.
 */
export function ownedBookingPliantCard(input: {
  pliantCardId: string;
  bookingCards: { pliant_card_id: string; status: string | null }[];
  arrivals: {
    booking_item_id: string;
    pliant_card_id: string | null;
    card_closed_at: string | null;
  }[];
  registry: { pliant_card_id: string; status: string | null }[];
}): OwnedPliantCard | null {
  const id = input.pliantCardId.trim();
  if (!id) return null;
  const arrival = input.arrivals.find((row) => row.pliant_card_id === id) || null;
  const booking = input.bookingCards.find((row) => row.pliant_card_id === id) || null;
  const registry = input.registry.find((row) => row.pliant_card_id === id) || null;
  if (!arrival && !booking && !registry) return null;
  if (arrival && !arrival.card_closed_at) return { itemId: arrival.booking_item_id };
  if (booking && booking.status !== "terminated") return { itemId: null };
  if (registry && registry.status !== "terminated") return { itemId: null };
  return { closed: true };
}

const NO_COPY_STATUS = new Set(["DECLINED", "REVERSED"]);
const NO_COPY_TYPE = new Set(["REFUND", "CHARGEBACK", "RECHARGE", "STATUS_INQUIRY"]);

function code(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
}

function moneyCode(value: string | null | undefined) {
  const currency = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

function four(value: string | null | undefined) {
  return value && /^\d{4}$/.test(value) ? value : null;
}

function ceiling(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

function face(input: {
  pliantCardId: string;
  label: string | null;
  last4: string | null;
  ceilingCents: number | null;
  currency: string | null;
}): PliantBookingCard | null {
  const pliantCardId = input.pliantCardId.trim();
  if (!pliantCardId) return null;
  return {
    pliantCardId,
    label: (input.label || "").trim() || "Carte",
    last4: four(input.last4),
    ceilingCents: ceiling(input.ceilingCents),
    currency: moneyCode(input.currency),
  };
}

/**
 * Cartes du dossier, puis cartes d’hôtel, puis la carte registre.
 * Un même identifiant Pliant n’apparaît qu’une fois (la première source gagne).
 */
export function pliantBookingCards(input: {
  bookingCards: {
    pliant_card_id: string;
    label: string | null;
    last4: string | null;
    limit_cents: number | null;
    currency: string | null;
  }[];
  arrivals: {
    pliant_card_id: string | null;
    booking_item_id: string;
    card_last4: string | null;
    card_limit_cents: number | null;
    currency: string | null;
  }[];
  hotelNames: Record<string, string>;
  registry: {
    pliant_card_id: string;
    label: string | null;
    last4: string | null;
    limit_cents: number | null;
    currency: string | null;
  } | null;
}): PliantBookingCard[] {
  const cards: PliantBookingCard[] = [];
  const seen = new Set<string>();
  function push(card: PliantBookingCard | null) {
    if (!card || seen.has(card.pliantCardId)) return;
    seen.add(card.pliantCardId);
    cards.push(card);
  }
  for (const card of input.bookingCards) {
    push(
      face({
        pliantCardId: card.pliant_card_id,
        label: card.label,
        last4: card.last4,
        ceilingCents: card.limit_cents,
        currency: card.currency,
      })
    );
  }
  for (const arrival of input.arrivals) {
    if (!arrival.pliant_card_id) continue;
    push(
      face({
        pliantCardId: arrival.pliant_card_id,
        label: input.hotelNames[arrival.booking_item_id] || "Hôtel",
        last4: arrival.card_last4,
        ceilingCents: arrival.card_limit_cents,
        currency: arrival.currency,
      })
    );
  }
  if (input.registry) {
    push(
      face({
        pliantCardId: input.registry.pliant_card_id,
        label: input.registry.label,
        last4: input.registry.last4,
        ceilingCents: input.registry.limit_cents,
        currency: input.registry.currency,
      })
    );
  }
  return cards;
}

/** Achat copiable en dépense de réservation. Refus, annulation, remboursement et montant nul : non. */
export function pliantSpendCopy(
  line: Pick<PliantSpendLine, "type" | "status" | "billingCents" | "currency">
): { amount: number; currency: string } | null {
  if (NO_COPY_STATUS.has(code(line.status))) return null;
  if (NO_COPY_TYPE.has(code(line.type))) return null;
  if (line.billingCents == null || !Number.isFinite(line.billingCents)) return null;
  const cents = Math.abs(Math.round(line.billingCents));
  if (cents === 0) return null;
  return { amount: cents / 100, currency: moneyCode(line.currency) };
}

export type BookingCardMosaicSlot =
  | { source: "issued"; id: string }
  | { source: "linked"; pliantCardId: string };

/**
 * Mosaïque de l’onglet Carte : les cartes émises, puis les cartes liées
 * (hôtel, registre) qui ne sont pas déjà une carte du dossier.
 * Une carte supprimée ne revient pas par le récap.
 */
export function bookingCardMosaic(
  issued: { id: string; pliant_card_id: string; status: string | null }[],
  linked: { pliantCardId: string }[]
): BookingCardMosaicSlot[] {
  const issuedPliantIds = new Set<string>();
  const slots: BookingCardMosaicSlot[] = [];
  for (const card of issued) {
    const pliantCardId = card.pliant_card_id.trim();
    if (pliantCardId) issuedPliantIds.add(pliantCardId);
    if (card.status === "terminated") continue;
    slots.push({ source: "issued", id: card.id });
  }
  const seenLinked = new Set<string>();
  for (const card of linked) {
    const pliantCardId = card.pliantCardId.trim();
    if (!pliantCardId || issuedPliantIds.has(pliantCardId) || seenLinked.has(pliantCardId)) continue;
    seenLinked.add(pliantCardId);
    slots.push({ source: "linked", pliantCardId });
  }
  return slots;
}

export function pliantCardRecaps(cards: PliantBookingCard[], spends: PliantSpendLine[]): PliantCardRecap[] {
  return cards.map((card) => {
    const lines = spends.filter((row) => row.cardId === card.pliantCardId);
    let spentCents = 0;
    for (const line of lines) {
      const copy = pliantSpendCopy(line);
      if (!copy || copy.currency !== card.currency) continue;
      spentCents += Math.round(copy.amount * 100);
    }
    return { ...card, spends: lines, spentCents };
  });
}

export function pliantExpenseTitle(merchant: string | null | undefined) {
  const label = (merchant || "").replace(/\s+/g, " ").trim();
  return (label || "Dépense").slice(0, 120);
}

export function pliantExpenseTransactionId(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const raw = (details as Record<string, unknown>).pliant_transaction_id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  if (!id || id.length > 128) return null;
  return id;
}

export type PliantReconcileState = "post" | "attach" | "here" | "elsewhere" | "ignored" | "closed";

/** Ce qu’on peut faire de la ligne sur la réservation ouverte. */
export function pliantReconcileState(
  line: {
    type: string | null;
    status: string | null;
    billingCents: number | null;
    billingCurrency?: string | null;
    matchStatus?: string | null;
    matchedBookingId?: string | null;
  },
  bookingId: string
): PliantReconcileState {
  const status = (line.matchStatus || "unmatched").toLowerCase();
  if (status === "ignored") return "ignored";
  const draft = pliantLedgerDraft({
    pliant_transaction_id: "line",
    type: line.type,
    status: line.status,
    merchant: null,
    billing_cents: line.billingCents,
    billing_currency: line.billingCurrency || "EUR",
    booked_at: null,
    card_label: null,
    card_last4: null,
  });
  if (status === "matched") {
    if (!line.matchedBookingId) return draft ? "attach" : "here";
    return line.matchedBookingId === bookingId ? "here" : "elsewhere";
  }
  return draft ? "post" : "closed";
}

export type PliantSettlementStay = {
  id: string;
  reference: string;
  label: string;
};

export function pliantSettlementStayLabel(input: {
  reference: string | null;
  title: string | null;
  destination: string | null;
  startDate: string | null;
}) {
  const place = (input.title || "").trim() || (input.destination || "").trim() || "Séjour";
  const when = input.startDate ? formatDateFr(input.startDate) : "";
  const ref = (input.reference || "").trim();
  return [ref, place, when === "—" ? "" : when].filter(Boolean).join(" · ");
}

/** Réservations du compte, la réservation ouverte en tête. Une annulation autre reste dehors. */
export function pliantSettlementStays(
  rows: {
    id: string;
    reference: string | null;
    title: string | null;
    destination: string | null;
    start_date: string | null;
    status: string | null;
  }[],
  currentId: string
): PliantSettlementStay[] {
  const seen = new Set<string>();
  const stays = rows.filter((row) => {
    if (!row.id || seen.has(row.id)) return false;
    seen.add(row.id);
    if (row.id === currentId) return true;
    return (row.status || "").toLowerCase() !== "cancelled";
  });
  stays.sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    return (b.start_date || "").localeCompare(a.start_date || "");
  });
  return stays.map((row) => ({
    id: row.id,
    reference: (row.reference || "").trim(),
    label: pliantSettlementStayLabel({
      reference: row.reference,
      title: row.title,
      destination: row.destination,
      startDate: row.start_date,
    }),
  }));
}

/** Dépenses actives du dossier déjà liées à une transaction Pliant. */
export function linkedPliantTransactionIds(
  items: { kind: string | null; lifecycle?: string | null; details: unknown }[]
) {
  const ids = new Set<string>();
  for (const item of items) {
    if (!isLedgerExpenseKind(item.kind) || !isActiveItem(item)) continue;
    const id = pliantExpenseTransactionId(item.details);
    if (id) ids.add(id);
  }
  return ids;
}
