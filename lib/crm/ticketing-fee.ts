export const TICKETING_FEE_EUR = 25;
export const TICKETING_FEE_LABEL = "Frais de billeterie";
export const TRANSFER_FEE_EUR = 15;
export const TRANSFER_FEE_LABEL = "Frais de transfert";
export const LODGING_FEE_EUR = 20;
export const LODGING_FEE_LABEL = "Frais d’hébergement";
export const MISC_FEE_LABEL = "Frais divers";

/** null = ancien calcul. percent et carte ne se cumulent pas. */
export type FeeMode = "percent" | "carte" | null;
export type FeeChoice = "percent" | "carte";

/** 1 passager = 1 billet = 25 €, même avec plusieurs segments. */
export function ticketingTicketCount(input: {
  hasFlight: boolean;
  travelerCount: number;
}) {
  if (!input.hasFlight) return 0;
  return Math.max(1, input.travelerCount);
}

export function ticketingFeeAmount(input: {
  hasFlight: boolean;
  travelerCount: number;
}) {
  return ticketingTicketCount(input) * TICKETING_FEE_EUR;
}

export function ticketingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:ticketing-fee`;
}

export function ticketingFeeLabel(ticketCount: number) {
  const n = Math.max(0, ticketCount);
  return `${TICKETING_FEE_LABEL} (${n} billet${n > 1 ? "s" : ""})`;
}

export function transferFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:transfer-fee`;
}

export function lodgingFeeExternalId(bookingId: string) {
  return `booking:${bookingId}:lodging-fee`;
}

export function feePostsNow(status: string) {
  return status === "confirmed" || status === "travelling" || status === "completed";
}

/** 10 % seulement hors mode à la carte. Le mode percent l’active même si l’ancienne case est restée fausse. */
export function commissionApplies(input: { feeMode?: FeeMode; agencyCommission: boolean }) {
  const mode = input.feeMode ?? null;
  if (mode === "carte") return false;
  if (mode === "percent") return true;
  return input.agencyCommission;
}

export function resolvedTicketingCount(input: {
  feeMode?: FeeMode;
  qty: number;
  hasFlight: boolean;
  travelerCount: number;
}) {
  const mode = input.feeMode ?? null;
  if (mode === "percent") return 0;
  if (mode === "carte") {
    const qty = Math.floor(Number(input.qty));
    return Number.isFinite(qty) && qty > 0 ? qty : 0;
  }
  return ticketingTicketCount({
    hasFlight: input.hasFlight,
    travelerCount: input.travelerCount,
  });
}

/** Montant posté au livre. 0 = la ligne part en void. */
export function resolvedTicketingAmount(input: {
  feeMode?: FeeMode;
  qty: number;
  hasFlight: boolean;
  travelerCount: number;
  status: string;
}) {
  if (!feePostsNow(input.status)) return 0;
  return resolvedTicketingCount(input) * TICKETING_FEE_EUR;
}

export function resolvedFlatFeeAmount(input: {
  feeMode?: FeeMode;
  enabled: boolean;
  unit: number;
  status: string;
}) {
  if ((input.feeMode ?? null) !== "carte" || !input.enabled) return 0;
  if (!feePostsNow(input.status)) return 0;
  return input.unit;
}

export function suggestedTicketingQty(travelerCount: number) {
  const n = Math.floor(Number(travelerCount));
  return Math.max(1, Number.isFinite(n) && n > 0 ? n : 1);
}

/** Dossier déjà en commission, ou mode percent : ouvrir sur 10 %. Sinon à la carte. */
export function initialFeeChoice(input: { feeMode?: FeeMode; agencyCommission: boolean }): FeeChoice {
  if (input.feeMode === "carte") return "carte";
  if (input.feeMode === "percent" || input.agencyCommission) return "percent";
  return "carte";
}

/**
 * Quantité proposée = nombre de voyageurs (minimum 1).
 * Cochée seulement si le mode carte a une quantité, ou si l’ancien calcul auto court encore (vol, sans commission).
 */
export function initialTicketingSelection(input: {
  feeMode?: FeeMode;
  agencyCommission: boolean;
  storedQty: number;
  hasFlight: boolean;
  travelerCount: number;
}): { on: boolean; qty: number } {
  const suggested = suggestedTicketingQty(input.travelerCount);
  if ((input.feeMode ?? null) === "carte") {
    const stored = Math.floor(Number(input.storedQty));
    const qty = Number.isFinite(stored) && stored > 0 ? stored : 0;
    return { on: qty > 0, qty: qty > 0 ? qty : suggested };
  }
  if ((input.feeMode ?? null) == null && !input.agencyCommission && input.hasFlight) {
    return { on: true, qty: suggested };
  }
  return { on: false, qty: suggested };
}

export function feeSchedulePatch(input: {
  mode: FeeChoice;
  ticketingOn: boolean;
  ticketingQty: number;
  transferOn: boolean;
  lodgingOn: boolean;
}) {
  if (input.mode === "percent") {
    return {
      fee_mode: "percent" as const,
      agency_commission: true,
      ticketing_fee_qty: 0,
      transfer_fee: false,
      lodging_fee: false,
    };
  }
  const raw = Math.floor(Number(input.ticketingQty));
  const qty = input.ticketingOn ? Math.max(1, Number.isFinite(raw) && raw > 0 ? raw : 1) : 0;
  return {
    fee_mode: "carte" as const,
    agency_commission: false,
    ticketing_fee_qty: qty,
    transfer_fee: input.transferOn,
    lodging_fee: input.lodgingOn,
  };
}
