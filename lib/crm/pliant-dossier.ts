import { pliantSpendSettlement, type TripCost, type TripCostDraft } from "./trip-costs";

export type DossierSpend = {
  id: string;
  cardId: string | null;
  status: string | null;
  type: string | null;
  merchant: string | null;
  billingCents: number | null;
  billingCurrency: string | null;
  transactionCents: number | null;
  transactionCurrency: string | null;
  bookedAt: string | null;
  cardLast4: string | null;
  matchStatus: string | null;
  released?: boolean;
};

export type DossierCostSnap = {
  id: string;
  bookingId: string;
  sourceId: string;
  amountEur: number;
  originalAmount: number | null;
  originalCurrency: string | null;
  state: "pending" | "posted";
  supplier: string | null;
  occurredOn: string | null;
};

export type DossierSpendAction =
  | { op: "insert"; bookingId: string; spendId: string; draft: TripCostDraft; state: "pending" | "posted" }
  | { op: "update"; costId: string; spendId: string; draft: TripCostDraft; state: "pending" | "posted" }
  | { op: "drop"; costId: string; spendId: string };

function sameMoney(left: number | null | undefined, right: number | null | undefined) {
  const a = left == null ? null : Math.round(left * 100);
  const b = right == null ? null : Math.round(right * 100);
  return a === b;
}

function changed(cost: DossierCostSnap, draft: TripCostDraft, state: "pending" | "posted") {
  return (
    cost.state !== state ||
    !sameMoney(cost.amountEur, draft.amountEur) ||
    !sameMoney(cost.originalAmount, draft.originalAmount) ||
    (cost.originalCurrency || "") !== (draft.originalCurrency || "") ||
    (cost.supplier || "") !== (draft.supplier || "") ||
    (cost.occurredOn || "") !== (draft.occurredOn || "")
  );
}

/**
 * Une carte liée à un seul dossier : la dépense s’y rattache dès l’autorisation.
 * Au règlement, le montant en euros est mis à jour. Un refus retire le coût encore en attente.
 * « Hors voyage » et un retrait agent (`released`) ne sont pas repris.
 */
export function planDossierPliantSpends(input: {
  spends: DossierSpend[];
  cardBookingId: Map<string, string>;
  costs: DossierCostSnap[];
}): DossierSpendAction[] {
  const costs = new Map(input.costs.map((row) => [row.sourceId, row]));
  const actions: DossierSpendAction[] = [];
  for (const spend of input.spends) {
    const bookingId = spend.cardId ? input.cardBookingId.get(spend.cardId) : undefined;
    if (!bookingId) continue;
    if ((spend.matchStatus || "").toLowerCase() === "ignored" || spend.released) continue;
    const cost = costs.get(spend.id) || null;
    if (cost && cost.bookingId !== bookingId) continue;
    const settlement = pliantSpendSettlement({
      id: spend.id,
      status: spend.status,
      type: spend.type,
      merchant: spend.merchant,
      billing_cents: spend.billingCents,
      billing_currency: spend.billingCurrency,
      transaction_cents: spend.transactionCents,
      transaction_currency: spend.transactionCurrency,
      booked_at: spend.bookedAt,
      card_last4: spend.cardLast4,
    });
    if (!settlement) {
      if (cost && cost.state === "pending") actions.push({ op: "drop", costId: cost.id, spendId: spend.id });
      continue;
    }
    if (!cost) {
      actions.push({ op: "insert", bookingId, spendId: spend.id, draft: settlement.draft, state: settlement.state });
      continue;
    }
    if (changed(cost, settlement.draft, settlement.state)) {
      actions.push({ op: "update", costId: cost.id, spendId: spend.id, draft: settlement.draft, state: settlement.state });
    }
  }
  return actions;
}

/** Carte → dossier. Deux dossiers pour la même carte : pas de rattachement automatique. */
export function singleCardBooking(rows: { cardId: string | null; bookingId: string | null }[]) {
  const seen = new Map<string, string | null>();
  for (const row of rows) {
    if (!row.cardId || !row.bookingId) continue;
    if (!seen.has(row.cardId)) seen.set(row.cardId, row.bookingId);
    else if (seen.get(row.cardId) !== row.bookingId) seen.set(row.cardId, null);
  }
  const map = new Map<string, string>();
  for (const [cardId, bookingId] of seen) {
    if (bookingId) map.set(cardId, bookingId);
  }
  return map;
}

/**
 * Autorisation pas encore écrite dans `crm_trip_costs` : elle s’affiche quand même
 * sur le dossier de la carte, en attente. Un coût déjà posé n’est pas doublé.
 */
export function dossierPendingCosts(input: {
  bookingId: string;
  spends: DossierSpend[];
  existingSourceIds: string[];
}): TripCost[] {
  const have = new Set(input.existingSourceIds);
  const costs: TripCost[] = [];
  for (const spend of input.spends) {
    if (have.has(spend.id) || spend.released) continue;
    const status = (spend.matchStatus || "unmatched").toLowerCase();
    if (status === "ignored" || status === "matched") continue;
    const settlement = pliantSpendSettlement({
      id: spend.id,
      status: spend.status,
      type: spend.type,
      merchant: spend.merchant,
      billing_cents: spend.billingCents,
      billing_currency: spend.billingCurrency,
      transaction_cents: spend.transactionCents,
      transaction_currency: spend.transactionCurrency,
      booked_at: spend.bookedAt,
      card_last4: spend.cardLast4,
    });
    if (!settlement || settlement.state !== "pending") continue;
    costs.push({
      id: `pending:${spend.id}`,
      bookingId: input.bookingId,
      bookingItemId: null,
      state: "pending",
      ...settlement.draft,
    });
  }
  return costs;
}
