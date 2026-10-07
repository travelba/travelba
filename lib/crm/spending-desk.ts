import type { LedgerMovementRow } from "@/lib/crm/ledger-movement";
import { formatDateRangeShort, formatMoney } from "@/lib/crm/money";

export type SpendingBooking = {
  id: string;
  title: string | null;
  destination: string | null;
  reference: string;
  start_date: string | null;
  end_date: string | null;
  customer_id?: string | null;
  owner_name?: string | null;
  displayed_amount?: number | null;
  /** Société de facturation du séjour. Pro : pas de plafond. */
  billing_company_id?: string | null;
};

export type SpendingAccountInput = {
  id: string;
  name: string;
  /** Null = pas de droit personnel. */
  allowance: number | null;
};

export type SpendingAccount = {
  id: string;
  name: string;
  allowance: number;
  spent: number;
  remaining: number;
};

export type SpendingCard = {
  id: string;
  title: string;
  dates: string | null;
  reference: string | null;
  amountLabel: string;
  accountName: string;
  /** Société qui règle, quand la fiche en a plusieurs. */
  payerLabel: string | null;
  remainingLabel: string | null;
  movements: LedgerMovementRow[];
};

export type SpendingDesk = {
  mode: "member" | "admin";
  currency: string;
  /** Collaborateur : son seul droit. Admin : null, l’encours société reste le wallet. */
  own: SpendingAccount | null;
  /** Admin : une pastille par personne qui a un droit, lui compris. */
  accounts: SpendingAccount[];
  cards: SpendingCard[];
  /** Virement et lignes sans séjour. Le collaborateur ne les voit pas. */
  otherMovements: LedgerMovementRow[];
};

type SpendRow = {
  booking_id: string | null;
  direction: "debit" | "credit";
  amount: number | string;
  currency: string;
  billing_company_id?: string | null;
};

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function hasSpendingAllowance(allowance: number | null | undefined) {
  return allowance != null && Number.isFinite(Number(allowance));
}

/** Reste du droit. Négatif = le séjour dépasse le plafond. */
export function spendingRemaining(allowance: number, spent: number) {
  return roundMoney(allowance - spent);
}

export function spendingRemainLabel(remaining: number, currency: string) {
  if (remaining < 0) return `Dépassé de ${formatMoney(-remaining, currency)}`;
  if (remaining === 0) return "Droit utilisé";
  return `Reste ${formatMoney(remaining, currency)}`;
}

/** Part du droit déjà engagée, pour la barre. */
export function spendingUsedPct(allowance: number, spent: number) {
  if (!(allowance > 0)) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((spent / allowance) * 100)));
}

function onUnlimitedAccount(row: SpendRow, unlimited: Set<string>) {
  return Boolean(row.billing_company_id && unlimited.has(row.billing_company_id));
}

function engagedByOwner(
  rows: SpendRow[],
  ownerByBooking: Map<string, string>,
  currency: string,
  unlimited: Set<string>
) {
  const spent = new Map<string, number>();
  for (const row of rows) {
    if ((row.currency || "EUR") !== currency || !row.booking_id) continue;
    if (onUnlimitedAccount(row, unlimited)) continue;
    const owner = ownerByBooking.get(row.booking_id);
    if (!owner) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const delta = row.direction === "credit" ? -amount : amount;
    spent.set(owner, (spent.get(owner) || 0) + delta);
  }
  for (const [owner, amount] of spent) spent.set(owner, roundMoney(amount));
  return spent;
}

function debitSum(rows: SpendRow[], bookingId: string, currency: string) {
  let sum = 0;
  for (const row of rows) {
    if (row.booking_id !== bookingId || row.direction !== "debit") continue;
    if ((row.currency || "EUR") !== currency) continue;
    const amount = Number(row.amount);
    if (Number.isFinite(amount)) sum += amount;
  }
  return roundMoney(sum);
}

/**
 * Lecture des droits sur un seul wallet. Null si personne n’a de plafond :
 * l’écran Transactions reste le grand livre actuel.
 */
export function shapeSpendingDesk(input: {
  member: boolean;
  viewerId: string;
  currency: string;
  accounts: SpendingAccountInput[];
  bookings: SpendingBooking[];
  movements: LedgerMovementRow[];
  /** Lignes visibles (séjour masqué dès qu’une carte le couvre). */
  rows: SpendRow[];
  /** Sociétés Pro : leurs dépenses ne consomment pas le droit. */
  unlimitedCompanyIds?: string[];
  /** Société qui règle, déjà filtrée (au moins deux sociétés). */
  companyLabels?: Map<string, string>;
}): SpendingDesk | null {
  const granted = input.accounts.filter((account) => hasSpendingAllowance(account.allowance));
  if (!granted.length) return null;
  if (input.member && !granted.some((account) => account.id === input.viewerId)) return null;

  const unlimited = new Set(input.unlimitedCompanyIds || []);
  const bookingById = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const ownerByBooking = new Map<string, string>();
  for (const booking of input.bookings) {
    if (booking.customer_id) ownerByBooking.set(booking.id, booking.customer_id);
    else if (input.member) ownerByBooking.set(booking.id, input.viewerId);
  }
  const spentByOwner = engagedByOwner(input.rows, ownerByBooking, input.currency, unlimited);
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));

  const toAccount = (account: SpendingAccountInput): SpendingAccount => {
    const allowance = Number(account.allowance);
    const spent = spentByOwner.get(account.id) || 0;
    return {
      id: account.id,
      name: account.name,
      allowance,
      spent,
      remaining: spendingRemaining(allowance, spent),
    };
  };

  const accounts = granted
    .map(toAccount)
    .sort((a, b) => {
      if (a.id === input.viewerId) return -1;
      if (b.id === input.viewerId) return 1;
      return a.name.localeCompare(b.name, "fr");
    });
  const own = input.member ? accounts.find((account) => account.id === input.viewerId) || null : null;

  const movementsByBooking = new Map<string, LedgerMovementRow[]>();
  const otherMovements: LedgerMovementRow[] = [];
  for (const movement of input.movements) {
    if (!movement.bookingId) {
      if (!input.member) otherMovements.push(movement);
      continue;
    }
    const booking = bookingById.get(movement.bookingId);
    const owner = booking?.customer_id;
    if (input.member && owner && owner !== input.viewerId) continue;
    const list = movementsByBooking.get(movement.bookingId) || [];
    list.push(movement);
    movementsByBooking.set(movement.bookingId, list);
  }

  const cards: SpendingCard[] = [];
  for (const [bookingId, movements] of movementsByBooking) {
    const booking = bookingById.get(bookingId);
    const ownerId = booking?.customer_id || (input.member ? input.viewerId : null);
    const account = ownerId ? accountById.get(ownerId) : undefined;
    const posted = ownerId ? accounts.find((row) => row.id === ownerId) : undefined;
    const stayDebits = input.rows.filter(
      (row) => row.booking_id === bookingId && row.direction === "debit" && (row.currency || "EUR") === input.currency
    );
    const unlimitedStay =
      unlimited.size > 0 &&
      ((booking?.billing_company_id && unlimited.has(booking.billing_company_id)) ||
        (stayDebits.length > 0 && stayDebits.every((row) => onUnlimitedAccount(row, unlimited))));
    const companyId =
      booking?.billing_company_id ||
      stayDebits.find((row) => row.billing_company_id)?.billing_company_id ||
      null;
    const displayed = booking?.displayed_amount;
    const amount =
      displayed != null && Number.isFinite(Number(displayed))
        ? Number(displayed)
        : debitSum(input.rows, bookingId, input.currency);
    const dates =
      booking && (booking.start_date || booking.end_date)
        ? formatDateRangeShort(booking.start_date, booking.end_date)
        : null;
    cards.push({
      id: bookingId,
      title: (booking?.title || "").trim() || (booking?.destination || "").trim() || movements[0]?.title || "Séjour",
      dates,
      reference: booking?.reference || movements[0]?.reference || null,
      amountLabel: formatMoney(amount, input.currency),
      accountName: (booking?.owner_name || "").trim() || account?.name || "Compte",
      payerLabel: companyId ? input.companyLabels?.get(companyId) || null : null,
      remainingLabel:
        posted && !unlimitedStay ? spendingRemainLabel(posted.remaining, input.currency) : null,
      movements,
    });
  }

  return {
    mode: input.member ? "member" : "admin",
    currency: input.currency,
    own,
    accounts: input.member ? [] : accounts,
    cards,
    otherMovements: input.member ? [] : otherMovements,
  };
}
