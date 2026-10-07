import { isActiveItem } from "@/lib/crm/types";

export const TICKETING_FEE_EUR = 25;
export const TICKETING_FEE_LABEL = "Frais de billeterie";
/** Marqueur d’une dépense créée pour les frais de billeterie. */
export const AUTO_TICKETING_FEE = "ticketing";
/** Le dossier ne recrée plus la ligne après un retrait. */
export const TICKETING_FEE_OFF = "ticketing_off";

/** 1 passager = 1 billet = 25 €, même avec plusieurs segments. */
export function ticketingTicketCount(input: { hasFlight: boolean; travelerCount?: number }) {
  if (!input.hasFlight) return 0;
  const count = Number(input.travelerCount);
  if (!Number.isFinite(count) || count < 1) return 1;
  return Math.min(99, Math.round(count));
}

/** 25 € par billet. */
export function ticketingFeeAmount(input: { hasFlight: boolean; travelerCount?: number }) {
  return ticketingTicketCount(input) * TICKETING_FEE_EUR;
}

/** Même règle que le débit séjour : 25 € par passager tant que le séjour n’est pas annulé. */
export function collectableTicketingFee(input: { status: string; hasFlight: boolean; travelerCount?: number }) {
  if (input.status === "cancelled") return 0;
  return ticketingFeeAmount(input);
}

export function ticketingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:ticketing-fee`;
}

export function ticketingFeeLabel(ticketCount?: number) {
  const count = Number(ticketCount);
  if (!Number.isFinite(count) || count < 1) return TICKETING_FEE_LABEL;
  const n = Math.round(count);
  return `${TICKETING_FEE_LABEL} (${n} billet${n > 1 ? "s" : ""})`;
}

export function isAutoTicketingExpense(item: {
  kind?: string | null;
  details?: Record<string, unknown> | null;
}) {
  return item.kind === "expense" && item.details?.auto_fee === AUTO_TICKETING_FEE;
}

/** L’agence a modifié le libellé ou le montant : le calcul ne l’écrase plus. */
export function ticketingExpenseTouched(details: Record<string, unknown> | null | undefined) {
  return details?.fee_touched === true;
}

export function ticketingFeeDismissed(feeMode: string | null | undefined) {
  return feeMode === TICKETING_FEE_OFF;
}

/**
 * Montant à ajouter en plus des dépenses.
 * 0 quand la billeterie est déjà une ligne de dépense : elle est dans cette somme.
 */
export function chargeableTicketingFee(input: {
  items: { kind?: string | null; details?: Record<string, unknown> | null; lifecycle?: string | null }[];
  status: string;
  travelerCount?: number;
}) {
  const active = input.items.filter((item) => isActiveItem(item));
  if (active.some((item) => isAutoTicketingExpense(item))) return 0;
  return collectableTicketingFee({
    status: input.status,
    hasFlight: active.some((item) => item.kind === "flight"),
    travelerCount: input.travelerCount,
  });
}

/** Créer, mettre à jour, retirer ou laisser la dépense de billeterie. */
export function ticketingExpenseAction(input: {
  hasFlight: boolean;
  dismissed: boolean;
  exists: boolean;
  touched: boolean;
  amount: number;
  currentAmount: number | null;
  title: string;
  currentTitle: string | null;
}): "create" | "update" | "remove" | "keep" {
  if (input.dismissed) return input.exists ? "remove" : "keep";
  if (!input.hasFlight || input.amount <= 0) {
    return input.exists && !input.touched ? "remove" : "keep";
  }
  if (!input.exists) return "create";
  if (input.touched) return "keep";
  const current = Number(input.currentAmount);
  if (current !== input.amount || (input.currentTitle || "") !== input.title) return "update";
  return "keep";
}
