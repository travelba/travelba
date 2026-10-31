import { pliantExpenseTitle, pliantExpenseTransactionId } from "./pliant-booking";
import { EXPENSE_QUANTITY_KEY, EXPENSE_UNIT_PRICE_KEY } from "./expense-pricing";
import type { TripCostDraft } from "./trip-costs";
import { isActiveItem, isLedgerExpenseKind } from "./types";

/**
 * Une dépense Pliant rattachée à un dossier devient, par défaut, une ligne Dépense du dossier :
 * libellé = commerçant, montant = montant Pliant en euros, date = jour de la dépense.
 * La ligne porte l’identifiant de la transaction Pliant (une seule ligne par transaction) et le montant
 * tel que Pliant l’a donné (`pliant_amount`) : tant que l’agence n’a pas touché au montant, le règlement
 * Pliant peut le corriger ; une fois modifié, la ligne suit l’agence et la transaction Pliant ne bouge pas.
 */

export const PLIANT_EXPENSE_ID_KEY = "pliant_transaction_id";
export const PLIANT_EXPENSE_AMOUNT_KEY = "pliant_amount";
export const PLIANT_EXPENSE_MERCHANT_KEY = "pliant_merchant";
export const PLIANT_EXPENSE_DATE_KEY = "pliant_date";

type Details = Record<string, unknown>;

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function asDetails(value: unknown): Details {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Details) : {};
}

function merchantName(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim() || null;
}

function money(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? cents(value) : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? cents(parsed) : null;
  }
  return null;
}

export type PliantExpenseDraft = {
  title: string;
  amount: number;
  start_at: string | null;
  details: Details;
};

/**
 * Ligne Dépense à créer pour un coût Pliant. Un remboursement ou une rétrofacturation (coût négatif)
 * n’est pas une dépense à refacturer : rien n’est proposé.
 */
export function pliantExpenseDraft(draft: Pick<TripCostDraft, "sourceId" | "amountEur" | "supplier" | "occurredOn">): PliantExpenseDraft | null {
  const amount = cents(Number(draft.amountEur));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const merchant = merchantName(draft.supplier);
  const date = draft.occurredOn ? String(draft.occurredOn).slice(0, 10) : null;
  return {
    title: pliantExpenseTitle(merchant),
    amount,
    start_at: date,
    details: {
      [PLIANT_EXPENSE_ID_KEY]: draft.sourceId,
      [PLIANT_EXPENSE_AMOUNT_KEY]: amount,
      [PLIANT_EXPENSE_MERCHANT_KEY]: merchant,
      [PLIANT_EXPENSE_DATE_KEY]: date,
      [EXPENSE_QUANTITY_KEY]: 1,
      [EXPENSE_UNIT_PRICE_KEY]: amount,
    },
  };
}

export type PliantExpenseOrigin = {
  transactionId: string;
  merchant: string | null;
  date: string | null;
  /** Montant donné par Pliant, en euros ; null pour une ligne créée avant cette mémoire. */
  amount: number | null;
  /** Vrai quand l’agence a changé le montant : la ligne ne suit plus Pliant. */
  edited: boolean;
};

/** Origine Pliant d’une dépense, pour l’écran et la synchronisation. */
export function pliantExpenseOrigin(details: unknown, amount: number | null | undefined): PliantExpenseOrigin | null {
  const transactionId = pliantExpenseTransactionId(details);
  if (!transactionId) return null;
  const row = asDetails(details);
  const synced = money(row[PLIANT_EXPENSE_AMOUNT_KEY]);
  const current = money(amount);
  const merchant = typeof row[PLIANT_EXPENSE_MERCHANT_KEY] === "string" ? (row[PLIANT_EXPENSE_MERCHANT_KEY] as string).trim() || null : null;
  const date = typeof row[PLIANT_EXPENSE_DATE_KEY] === "string" ? (row[PLIANT_EXPENSE_DATE_KEY] as string).slice(0, 10) || null : null;
  return {
    transactionId,
    merchant,
    date,
    amount: synced,
    edited: synced != null && current != null && synced !== current,
  };
}

/**
 * Au règlement Pliant, le montant en euros peut bouger (autorisation → écriture).
 * Une ligne que l’agence n’a pas touchée suit ; une ligne modifiée garde son montant.
 * Renvoie le correctif à écrire, ou null s’il n’y a rien à changer.
 */
export function pliantExpenseSyncPatch(
  item: { amount: number | null | undefined; details: unknown },
  draft: Pick<TripCostDraft, "amountEur" | "supplier" | "occurredOn">
): { amount: number; details: Details } | null {
  const origin = pliantExpenseOrigin(item.details, item.amount);
  if (!origin || origin.edited) return null;
  const next = cents(Number(draft.amountEur));
  if (!Number.isFinite(next) || next <= 0) return null;
  const details = asDetails(item.details);
  const date = draft.occurredOn ? String(draft.occurredOn).slice(0, 10) : origin.date;
  const merchant = merchantName(draft.supplier) || origin.merchant;
  if (origin.amount === next && origin.date === date && origin.merchant === merchant) return null;
  return {
    amount: next,
    details: {
      ...details,
      [PLIANT_EXPENSE_AMOUNT_KEY]: next,
      [PLIANT_EXPENSE_MERCHANT_KEY]: merchant,
      [PLIANT_EXPENSE_DATE_KEY]: date,
      [EXPENSE_QUANTITY_KEY]: 1,
      [EXPENSE_UNIT_PRICE_KEY]: next,
    },
  };
}

/** Une autorisation refusée retire la ligne seulement si l’agence ne l’a pas modifiée. */
export function pliantExpenseRemovable(item: { amount: number | null | undefined; details: unknown }) {
  const origin = pliantExpenseOrigin(item.details, item.amount);
  return Boolean(origin && !origin.edited);
}

/** La ligne Dépense déjà créée pour cette transaction, parmi les lignes actives du dossier. */
export function findPliantExpenseItem<T extends { id: string; kind: string | null; lifecycle?: string | null; details: unknown }>(
  items: T[],
  transactionId: string
): T | null {
  for (const item of items) {
    if (!isLedgerExpenseKind(item.kind) || !isActiveItem(item)) continue;
    if (pliantExpenseTransactionId(item.details) === transactionId) return item;
  }
  return null;
}
