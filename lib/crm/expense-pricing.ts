import { parseMoney } from "./money";

/**
 * Une dépense du dossier se lit en quantité × prix unitaire. Le montant reste la vérité du grand livre :
 * `amount` = quantité × prix unitaire, arrondi au centime. Sans quantité enregistrée, la ligne vaut 1 × montant.
 * Modifier le montant seul garde la quantité et recalcule le prix unitaire : les trois restent cohérents.
 */

export const EXPENSE_QUANTITY_KEY = "quantity";
export const EXPENSE_UNIT_PRICE_KEY = "unit_price";

const MAX_QUANTITY = 9_999;

export type ExpensePricing = {
  quantity: number;
  unitPrice: number;
  amount: number;
};

function cents(value: number) {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function parseExpenseQuantity(value: unknown): number | null {
  if (value == null || value === "") return null;
  const raw = typeof value === "number" ? value : Number(String(value).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(raw) || raw <= 0 || raw > MAX_QUANTITY) return null;
  return roundQuantity(raw);
}

/** Quantité et prix unitaire enregistrés sur la ligne ; sinon 1 × montant. */
export function readExpensePricing(details: unknown, amount: number | null | undefined): ExpensePricing {
  const row = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  const total = typeof amount === "number" && Number.isFinite(amount) ? cents(amount) : 0;
  const quantity = parseExpenseQuantity(row[EXPENSE_QUANTITY_KEY]) ?? 1;
  const storedUnit = parseMoney(
    typeof row[EXPENSE_UNIT_PRICE_KEY] === "number" || typeof row[EXPENSE_UNIT_PRICE_KEY] === "string"
      ? (row[EXPENSE_UNIT_PRICE_KEY] as number | string)
      : null
  );
  const unitPrice =
    storedUnit != null && storedUnit >= 0 && cents(storedUnit * quantity) === total ? cents(storedUnit) : cents(total / quantity);
  return { quantity, unitPrice, amount: total };
}

export type ExpensePricingInput = {
  quantity?: unknown;
  unit_price?: unknown;
  amount?: unknown;
};

export type ExpensePricingResult =
  | { ok: true; pricing: ExpensePricing; details: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * Ce que la ligne devient après une saisie. Quantité et prix unitaire donnés : le montant suit.
 * Montant donné seul : la quantité reste, le prix unitaire se recalcule. Quantité seule : le prix unitaire reste.
 */
export function applyExpensePricing(
  input: ExpensePricingInput,
  current: { amount: number | null | undefined; details: unknown }
): ExpensePricingResult {
  const base = readExpensePricing(current.details, current.amount);
  const hasQuantity = input.quantity !== undefined && input.quantity !== null && input.quantity !== "";
  const hasUnit = input.unit_price !== undefined && input.unit_price !== null && input.unit_price !== "";
  const hasAmount = input.amount !== undefined && input.amount !== null && input.amount !== "";

  let quantity = base.quantity;
  if (hasQuantity) {
    const parsed = parseExpenseQuantity(input.quantity);
    if (parsed == null) return { ok: false, error: "Quantité invalide (un nombre supérieur à zéro)." };
    quantity = parsed;
  }

  let unitPrice = base.unitPrice;
  let amount: number;
  if (hasUnit) {
    const parsed = parseMoney(typeof input.unit_price === "number" || typeof input.unit_price === "string" ? input.unit_price : null);
    if (parsed == null || parsed < 0) return { ok: false, error: "Prix unitaire invalide." };
    unitPrice = cents(parsed);
    amount = cents(unitPrice * quantity);
  } else if (hasAmount) {
    const parsed = parseMoney(typeof input.amount === "number" || typeof input.amount === "string" ? input.amount : null);
    if (parsed == null || parsed < 0) return { ok: false, error: "Montant invalide." };
    amount = cents(parsed);
    unitPrice = cents(amount / quantity);
  } else {
    amount = cents(unitPrice * quantity);
  }
  if (amount <= 0) return { ok: false, error: "Montant requis." };

  const details =
    current.details && typeof current.details === "object" && !Array.isArray(current.details)
      ? { ...(current.details as Record<string, unknown>) }
      : {};
  details[EXPENSE_QUANTITY_KEY] = quantity;
  details[EXPENSE_UNIT_PRICE_KEY] = unitPrice;
  return { ok: true, pricing: { quantity, unitPrice, amount }, details };
}

/** Vrai quand la saisie touche la quantité ou le prix unitaire : le montant doit être recalculé côté serveur. */
export function hasExpensePricingInput(body: Record<string, unknown>) {
  return (
    (body.quantity !== undefined && body.quantity !== null && body.quantity !== "") ||
    (body.unit_price !== undefined && body.unit_price !== null && body.unit_price !== "")
  );
}

/** « 2 × 45,00 € » quand la quantité n’est pas 1 ; sinon rien. */
export function expensePricingLabel(pricing: ExpensePricing, formatMoney: (amount: number) => string) {
  if (pricing.quantity === 1) return null;
  const quantity = pricing.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
  return `${quantity} × ${formatMoney(pricing.unitPrice)}`;
}
