import { isLedgerExpenseKind } from "./types";

/**
 * Une dépense créée automatiquement (dépense Pliant rattachée à un dossier) attend la validation de
 * l’agence : elle est au dossier, flagée « À valider », mais ne compte pour rien côté client — ni le
 * grand livre, ni le prix affiché, ni la section Dépenses de la réservation, ni la facture, ni la
 * commission d’agence, ni le montant à régler. Valider (un clic, ou `mettre_a_jour_dossier.depense.valider`)
 * retire le drapeau : la ligne devient une dépense ordinaire et débite si le séjour est Visible.
 */
export const EXPENSE_AWAITING_KEY = "awaiting_validation";

type ExpenseLike = { kind?: string | null; details?: unknown };

export function expenseAwaitsValidation(item: ExpenseLike) {
  if (!isLedgerExpenseKind(item.kind)) return false;
  const details = item.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  return (details as Record<string, unknown>)[EXPENSE_AWAITING_KEY] === true;
}

/** Dépense qui compte côté client : une dépense validée (ou saisie par l’agence). */
export function expenseCountsForClient(item: ExpenseLike) {
  return isLedgerExpenseKind(item.kind) && !expenseAwaitsValidation(item);
}

/** Détails après validation : le drapeau part, le reste (origine Pliant, quantité, prix unitaire) reste. */
export function validatedExpenseDetails(details: unknown): Record<string, unknown> {
  const base = details && typeof details === "object" && !Array.isArray(details) ? { ...(details as Record<string, unknown>) } : {};
  delete base[EXPENSE_AWAITING_KEY];
  return base;
}

/** Détails d’une dépense remise à valider (cachée au client). */
export function awaitingExpenseDetails(details: unknown): Record<string, unknown> {
  const base = details && typeof details === "object" && !Array.isArray(details) ? { ...(details as Record<string, unknown>) } : {};
  base[EXPENSE_AWAITING_KEY] = true;
  return base;
}
