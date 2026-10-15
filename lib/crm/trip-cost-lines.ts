import type { PliantCardRecap, PliantReconcileState } from "./pliant-booking";
import { pliantReconcileState } from "./pliant-booking";
import type { PliantSpendLine } from "./pliant-cards";
import { pliantSignedCents } from "./pliant-tx";
import type { OutgoingLine, TripAccountingView, TripCost } from "./trip-costs";

function moneyCode(value: string | null | undefined) {
  const currency = (value || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "EUR";
}

/** Une dépense de carte Pliant lue comme une sortie à rattacher, pour le même geste que la file. */
export function pliantSpendToOutgoing(
  card: Pick<PliantCardRecap, "label" | "last4"> & Partial<Pick<PliantCardRecap, "ceilingCents" | "currency">>,
  row: PliantSpendLine
): OutgoingLine | null {
  const signed = pliantSignedCents(row.type, row.billingCents);
  if (signed == null || signed === 0) return null;
  const currency = moneyCode(row.currency);
  // Pliant compte un achat en négatif ; un coût est positif, un remboursement négatif.
  const cost = -signed / 100;
  return {
    source: "pliant",
    id: row.id,
    party: (row.merchant || "").trim() || "Dépense",
    amount: Math.abs(cost),
    currency,
    eurAmount: currency === "EUR" ? cost : null,
    refund: cost < 0,
    occurredOn: row.bookedAt ? String(row.bookedAt).slice(0, 10) : null,
    card: [card.label, card.last4 ? `···· ${card.last4}` : ""].filter(Boolean).join(" ") || null,
    text: (row.comment || "").trim(),
    kind: cost < 0 ? "Remboursement" : "Carte",
    agencyCard: false,
    // Carte du dossier : le rattachement à ce dossier est acquis, l’écran la met en avant.
    cardInfo: {
      label: (card.label || "").trim() || null,
      holder: null,
      limit: card.ceilingCents == null ? null : card.ceilingCents / 100,
      currency: moneyCode(card.currency),
      validFrom: null,
      validTo: null,
      countries: [],
      status: null,
    },
    suggestions: [],
  };
}

export function spendReconcileState(row: PliantSpendLine, bookingId: string): PliantReconcileState {
  return pliantReconcileState(
    {
      type: row.type,
      status: row.status,
      billingCents: row.billingCents,
      billingCurrency: row.currency,
      matchStatus: row.matchStatus,
      matchedBookingId: row.matchedBookingId,
    },
    bookingId
  );
}

/** La dépense attend encore un geste : à rattacher, ou rattachée sans voyage. */
export function spendAwaitsAttach(state: PliantReconcileState) {
  return state === "post" || state === "attach";
}

/**
 * Sorties à rattacher sur le dossier : la file proposée (Pliant + Revolut), puis les dépenses des cartes
 * du dossier qui attendent encore et que la file n’a pas déjà. Une transaction n’apparaît qu’une fois.
 */
export function pendingCostLines(input: {
  proposed: OutgoingLine[];
  cards: PliantCardRecap[];
  bookingId: string;
}): OutgoingLine[] {
  const seen = new Set(input.proposed.map((line) => `${line.source}:${line.id}`));
  const lines = [...input.proposed];
  for (const card of input.cards) {
    for (const row of card.spends) {
      const key = `pliant:${row.id}`;
      if (seen.has(key)) continue;
      if (!spendAwaitsAttach(spendReconcileState(row, input.bookingId))) continue;
      const line = pliantSpendToOutgoing(card, row);
      if (!line) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  return lines;
}

export type CostPlacement = { cost: TripCost; lineLabel: string | null };

/** Où chaque coût est posé : la ligne vendue, ou null s’il est sans vente. Clé `source:sourceId`. */
export function costPlacements(view: Pick<TripAccountingView, "lines" | "unsold">) {
  const map = new Map<string, CostPlacement>();
  for (const line of view.lines) {
    for (const cost of line.costs) map.set(`${cost.source}:${cost.sourceId}`, { cost, lineLabel: line.label });
  }
  for (const cost of view.unsold) map.set(`${cost.source}:${cost.sourceId}`, { cost, lineLabel: null });
  return map;
}

/** Débits Revolut rattachés au dossier avant la comptabilité du voyage, sans coût posé : on les montre quand même. */
export function revolutLinkedWithoutCost<T extends { id: string }>(
  linked: T[],
  placements: Map<string, CostPlacement>
): T[] {
  return linked.filter((row) => !placements.has(`revolut:${row.id}`));
}
