import { HIDDEN_PRICE_LABEL } from "@/lib/crm/carnet";
import { agencyFeeFromGross, formatMoney } from "@/lib/crm/money";
import {
  commissionApplies,
  LODGING_FEE_EUR,
  LODGING_FEE_LABEL,
  TICKETING_FEE_EUR,
  TRANSFER_FEE_EUR,
  TRANSFER_FEE_LABEL,
  ticketingFeeLabel,
  type FeeMode,
} from "@/lib/crm/ticketing-fee";
import { AGENCY_FEE_LABEL, visibleServiceCopy } from "@/lib/crm/types";

type LedgerKindRow = {
  direction: string;
  kind: string;
  external_id: string | null;
};

type LedgerRow = LedgerKindRow & {
  booking_id: string | null;
};

/** Débit unique du montant du séjour, pas une dépense (vol, hôtel, frais). */
export function isStayRollupDebit(row: LedgerKindRow) {
  return row.direction === "debit" && row.kind === "booking" && !row.external_id;
}

/** Dépense libre : s’ajoute au livre sans remplacer le montant du séjour. */
export function isFreeExpenseDebit(row: { external_id?: string | null }) {
  return (row.external_id || "").includes(":expense:");
}

/** Commission 10 % du séjour : s’ajoute aux dépenses, sans retirer le montant global. */
export function isAgencyCommissionDebit(row: { external_id?: string | null }) {
  return (row.external_id || "").endsWith(":agency-commission");
}

export function isTicketingFeeDebit(row: { external_id?: string | null }) {
  return (row.external_id || "").endsWith(":ticketing-fee");
}

export function isTransferFeeDebit(row: { external_id?: string | null }) {
  return (row.external_id || "").endsWith(":transfer-fee");
}

export function isLodgingFeeDebit(row: { external_id?: string | null }) {
  return (row.external_id || "").endsWith(":lodging-fee");
}

/** Frais ajoutés au séjour : ils ne remplacent pas le montant global. */
export function isAdditiveServiceFeeDebit(row: { external_id?: string | null }) {
  return isTicketingFeeDebit(row) || isTransferFeeDebit(row) || isLodgingFeeDebit(row);
}

/**
 * Ancien calcul (fee_mode null) : la billeterie auto retire encore le montant global.
 * Les modes percent et carte l’ajoutent, comme la commission.
 */
export function legacyTicketingDropsStay(
  feeMode: FeeMode | undefined,
  rows: { external_id?: string | null }[]
) {
  return (feeMode ?? null) === null && rows.some((row) => isTicketingFeeDebit(row));
}

/** Une carte du dossier couvre le montant global. Commission, dépense libre et frais de service, non. */
export function coversStayRollup(row: LedgerKindRow & { booking_id?: string | null }) {
  if (!row.booking_id || row.direction !== "debit") return false;
  if (isStayRollupDebit(row)) return false;
  if (isFreeExpenseDebit(row)) return false;
  if (isAgencyCommissionDebit(row)) return false;
  if (isAdditiveServiceFeeDebit(row)) return false;
  return true;
}

/**
 * Masque le montant global du séjour dès qu’une dépense du même dossier est déjà au livre.
 * La dépense libre reste à côté du séjour.
 */
export function visibleLedgerRows<T extends LedgerRow>(rows: T[]): T[] {
  const covered = new Set(
    rows.filter((row) => coversStayRollup(row)).map((row) => row.booking_id as string)
  );
  return rows.filter((row) => {
    if (!row.booking_id || !isStayRollupDebit(row)) return true;
    return !covered.has(row.booking_id);
  });
}

export function reservationContextLabel(
  booking: {
    title?: string | null;
    destination?: string | null;
    reference: string;
  } | null | undefined
) {
  if (!booking) return null;
  return (booking.title || "").trim() || (booking.destination || "").trim() || booking.reference || null;
}

/** Retire la référence en fin de libellé : elle va dans le détail. */
export function ledgerSubjectTitle(label: string, reference: string | null | undefined) {
  const ref = (reference || "").trim();
  if (!ref) return label;
  const suffix = ` — ${ref}`;
  if (!label.endsWith(suffix)) return label;
  return label.slice(0, -suffix.length).trim() || label;
}

export function ledgerPlace(
  booking: { title?: string | null; destination?: string | null; reference: string } | null | undefined
) {
  if (!booking) return null;
  const destination = (booking.destination || "").trim();
  if (destination) return destination;
  const title = (booking.title || "").trim();
  if (title && title !== booking.reference) return title;
  return null;
}

/** Date du séjour et lieu, sous le sujet du mouvement. */
export function ledgerWhenWhere(dates: string | null | undefined, place: string | null | undefined) {
  return [dates, place].map((value) => (value || "").trim()).filter(Boolean).join(" · ") || null;
}

export type ClientExpenseLine = {
  id: string;
  title: string;
  amountLabel: string | null;
};

/**
 * Prix lu sur la réservation. L’assiette stockée (`total_amount`) reste la somme des cartes.
 * null : commission si cochée + dépenses libres. percent : 10 % seul. carte : frais cochés + dépenses libres.
 */
type StayFeeInput = {
  stayTotal: number;
  agencyCommission: boolean;
  expenses: { id?: string; title?: string; amount: number | null }[];
  feeMode?: FeeMode;
  ticketingQty?: number;
  transferFee?: boolean;
  lodgingFee?: boolean;
};

function positiveAmount(amount: number | null | undefined) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export function stayPriceWithExpenses(input: StayFeeInput) {
  const stay = Number(input.stayTotal);
  const base = Number.isFinite(stay) ? stay : 0;
  const mode = input.feeMode ?? null;
  let sum = base;
  if (commissionApplies(input)) sum += agencyFeeFromGross(base);
  if (mode !== "percent") {
    for (const expense of input.expenses) sum += positiveAmount(expense.amount);
  }
  if (mode === "carte") {
    const qty = Math.floor(Number(input.ticketingQty));
    if (Number.isFinite(qty) && qty > 0) sum += qty * TICKETING_FEE_EUR;
    if (input.transferFee) sum += TRANSFER_FEE_EUR;
    if (input.lodgingFee) sum += LODGING_FEE_EUR;
  }
  return Math.round(sum * 100) / 100;
}

export function clientStayPriceLabel(
  input: StayFeeInput & {
    currency: string;
    pricesVisible: boolean;
  }
) {
  if (!input.pricesVisible) return HIDDEN_PRICE_LABEL;
  return formatMoney(stayPriceWithExpenses(input), input.currency);
}

/** Lignes lues sur la réservation client : frais actifs, puis dépenses libres hors mode 10 %. */
export function clientStayExpenseLines(
  input: StayFeeInput & {
    expenses: { id: string; title: string; amount: number | null }[];
    currency: string;
    pricesVisible: boolean;
  }
): ClientExpenseLine[] {
  const lines: ClientExpenseLine[] = [];
  const mode = input.feeMode ?? null;
  if (commissionApplies(input)) {
    lines.push({
      id: "agency-commission",
      title: AGENCY_FEE_LABEL,
      amountLabel: expenseAmountLabel(agencyFeeFromGross(input.stayTotal), input.currency, input.pricesVisible),
    });
  }
  if (mode === "carte") {
    const qty = Math.floor(Number(input.ticketingQty));
    if (Number.isFinite(qty) && qty > 0) {
      lines.push({
        id: "ticketing-fee",
        title: ticketingFeeLabel(qty),
        amountLabel: expenseAmountLabel(qty * TICKETING_FEE_EUR, input.currency, input.pricesVisible),
      });
    }
    if (input.transferFee) {
      lines.push({
        id: "transfer-fee",
        title: TRANSFER_FEE_LABEL,
        amountLabel: expenseAmountLabel(TRANSFER_FEE_EUR, input.currency, input.pricesVisible),
      });
    }
    if (input.lodgingFee) {
      lines.push({
        id: "lodging-fee",
        title: LODGING_FEE_LABEL,
        amountLabel: expenseAmountLabel(LODGING_FEE_EUR, input.currency, input.pricesVisible),
      });
    }
  }
  if (mode !== "percent") {
    for (const expense of input.expenses) {
      const title = visibleServiceCopy((expense.title || "").trim());
      if (!title) continue;
      lines.push({
        id: expense.id,
        title,
        amountLabel: expenseAmountLabel(expense.amount, input.currency, input.pricesVisible),
      });
    }
  }
  return lines;
}

export function stayFeeFields(booking: {
  fee_mode?: FeeMode | null;
  agency_commission?: boolean | null;
  ticketing_fee_qty?: number | null;
  transfer_fee?: boolean | null;
  lodging_fee?: boolean | null;
}) {
  return {
    feeMode: booking.fee_mode ?? null,
    agencyCommission: booking.agency_commission === true,
    ticketingQty: Number(booking.ticketing_fee_qty || 0),
    transferFee: booking.transfer_fee === true,
    lodgingFee: booking.lodging_fee === true,
  };
}

function expenseAmountLabel(amount: number | null, currency: string, pricesVisible: boolean) {
  if (!pricesVisible) return HIDDEN_PRICE_LABEL;
  if (amount == null || Number.isNaN(Number(amount))) return null;
  return formatMoney(Number(amount), currency);
}

/** Le montant global du séjour s’affiche comme une dépense, pas comme « Réservation … ». */
export function ledgerMovementTitle(
  row: LedgerKindRow & { label: string | null; booking_id?: string | null },
  fallback: string
) {
  if (isStayRollupDebit(row)) return "Séjour";
  return visibleServiceCopy((row.label || "").trim() || fallback);
}
