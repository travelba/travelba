import { HIDDEN_PRICE_LABEL } from "@/lib/crm/carnet";
import { agencyFeeFromGross, formatMoney } from "@/lib/crm/money";
import { ticketingFeeLabel } from "@/lib/crm/ticketing-fee";
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

/** Une carte ou un frais du dossier couvre le montant global. Une dépense libre, non. */
export function coversStayRollup(row: LedgerKindRow & { booking_id?: string | null }) {
  if (!row.booking_id || row.direction !== "debit") return false;
  if (isStayRollupDebit(row)) return false;
  if (isFreeExpenseDebit(row)) return false;
  if (isAgencyCommissionDebit(row)) return false;
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
 * Prix lu sur la réservation : cartes + frais d’agence + billeterie + dépenses libres.
 * L’assiette stockée (`total_amount`) reste la somme des cartes.
 */
export function stayPriceWithExpenses(input: {
  stayTotal: number;
  agencyCommission: boolean;
  expenses: { amount: number | null }[];
  ticketingFee?: number;
}) {
  const stay = Number(input.stayTotal);
  let sum = Number.isFinite(stay) ? stay : 0;
  if (input.agencyCommission) sum += agencyFeeFromGross(sum);
  for (const expense of input.expenses) {
    const amount = Number(expense.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    sum += amount;
  }
  const ticketing = Number(input.ticketingFee);
  if (Number.isFinite(ticketing) && ticketing > 0) sum += ticketing;
  return Math.round(sum * 100) / 100;
}

export function clientStayPriceLabel(input: {
  stayTotal: number;
  currency: string;
  pricesVisible: boolean;
  agencyCommission: boolean;
  expenses: { amount: number | null }[];
  ticketingFee?: number;
}) {
  if (!input.pricesVisible) return HIDDEN_PRICE_LABEL;
  return formatMoney(stayPriceWithExpenses(input), input.currency);
}

/** Lignes lues sur la réservation client : frais d’agence, billeterie, puis dépenses libres. */
export function clientStayExpenseLines(input: {
  expenses: { id: string; title: string; amount: number | null }[];
  agencyCommission: boolean;
  stayTotal: number;
  currency: string;
  pricesVisible: boolean;
  ticketingFee?: number;
  ticketCount?: number;
}): ClientExpenseLine[] {
  const lines: ClientExpenseLine[] = [];
  if (input.agencyCommission) {
    lines.push({
      id: "agency-commission",
      title: AGENCY_FEE_LABEL,
      amountLabel: expenseAmountLabel(agencyFeeFromGross(input.stayTotal), input.currency, input.pricesVisible),
    });
  }
  const ticketing = Number(input.ticketingFee);
  if (Number.isFinite(ticketing) && ticketing > 0) {
    lines.push({
      id: "ticketing-fee",
      title: ticketingFeeLabel(input.ticketCount),
      amountLabel: expenseAmountLabel(ticketing, input.currency, input.pricesVisible),
    });
  }
  for (const expense of input.expenses) {
    const title = visibleServiceCopy((expense.title || "").trim());
    if (!title) continue;
    lines.push({
      id: expense.id,
      title,
      amountLabel: expenseAmountLabel(expense.amount, input.currency, input.pricesVisible),
    });
  }
  return lines;
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
