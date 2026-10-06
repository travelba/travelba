import type { SupabaseClient } from "@supabase/supabase-js";
import { filterClientLedgerRows, isCompanyMember } from "@/lib/crm/company-role";
import {
  ledgerMovementTitle,
  ledgerPlace,
  ledgerSubjectTitle,
  ledgerWhenWhere,
  visibleLedgerRows,
} from "@/lib/crm/ledger-display";
import type { LedgerMovementRow } from "@/lib/crm/ledger-movement";
import {
  formatDateFr,
  formatDateRangeShort,
  formatMoney,
  postedLedgerTotals,
} from "@/lib/crm/money";
import { transactionCompanyLabel } from "@/lib/crm/billing-companies";
import { loadDisplayedStayAmounts } from "@/lib/crm/displayed-stay";
import {
  hasSpendingAllowance,
  shapeSpendingDesk,
  type SpendingAccountInput,
  type SpendingDesk,
} from "@/lib/crm/spending-desk";
import { createServiceClient } from "@/lib/supabase/admin";
import { fitPayerOwed, owedByPayer } from "@/lib/crm/payer";
import {
  TX_KIND_LABELS,
  customerFullName,
  visibleServiceCopy,
  type CompanyRole,
  type CrmBalance,
  type CrmBillingCompany,
  type CrmCustomer,
  type CrmTransaction,
} from "@/lib/crm/types";

export type ClientLedgerAudience = "client" | "staff";

export type ClientLedgerBooking = {
  id: string;
  title: string | null;
  destination: string | null;
  reference: string;
  start_date: string | null;
  end_date: string | null;
  visible_to_client: boolean;
  payer_kind?: "company" | "personal" | null;
  /** Titulaire du dossier : le compte de rattachement du droit de dépense. */
  customer_id?: string | null;
  owner_name?: string | null;
  /** Prix affiché du séjour. Absent : la carte reprend les débits postés. */
  displayed_amount?: number | null;
  status?: string | null;
  total_amount?: number | string | null;
  agency_commission?: boolean | null;
};

export type ClientLedgerWallet = {
  currency: string;
  balanceValue: number;
  debits: number;
  remaining: number;
  remainingPct: number | null;
  creditCount: number;
};

export type ClientLedgerView = {
  member: boolean;
  /** Devise principale (euros si le compte en a) : le règlement et les champs à plat la suivent. */
  currency: string;
  balanceValue: number;
  debits: number;
  remaining: number;
  remainingPct: number | null;
  creditCount: number;
  /** Un encours par devise de crm_customer_balances (un seul bloc dans le cas courant). */
  wallets: ClientLedgerWallet[];
  /** Somme due, puis part société et part particulier. */
  owed: { total: number; company: number; personal: number };
  soleCompanyName: string | null;
  movements: LedgerMovementRow[];
  /** Null tant qu’aucun droit de dépense n’est fixé : le grand livre actuel reste. */
  spending: SpendingDesk | null;
};

function walletView(
  currency: string,
  balance: number,
  rows: { direction: "debit" | "credit"; amount: number | string; currency: string }[]
): ClientLedgerWallet {
  const inCurrency = rows.filter((row) => (row.currency || "EUR") === currency);
  const { debits, settledPct } = postedLedgerTotals(inCurrency);
  return {
    currency,
    balanceValue: balance,
    debits,
    remaining: Math.max(0, -balance),
    remainingPct: settledPct == null ? null : Math.max(0, 100 - settledPct),
    creditCount: inCurrency.filter((row) => row.direction === "credit").length,
  };
}

/** L’euro d’abord quand il existe, sinon la première devise. */
export function primaryWallet<T extends { currency: string }>(wallets: T[]): T | null {
  if (!wallets.length) return null;
  return wallets.find((wallet) => (wallet.currency || "EUR").toUpperCase() === "EUR") || wallets[0];
}

export function clientLedgerAdminHref(customerId: string) {
  return `/admin/transactions/client/${customerId}`;
}

export function shapeClientLedger(input: {
  companyRole: CompanyRole | null | undefined;
  travelerBookingIds: string[];
  rows: CrmTransaction[];
  walletBalance: number | null;
  currency: string;
  bookings: ClientLedgerBooking[];
  audience: ClientLedgerAudience;
  billingCompanyCount?: number;
  companyNames?: Map<string, string | null>;
  /** Tous les soldes du compte (une ligne par devise). Absent : le seul walletBalance / currency. */
  wallets?: { currency: string; balance: number }[];
  viewerId?: string;
  spendAccounts?: SpendingAccountInput[];
}): ClientLedgerView {
  const member = isCompanyMember({ company_role: input.companyRole ?? null });
  const scoped = filterClientLedgerRows(input.rows, {
    companyRole: input.companyRole,
    travelerBookingIds: input.travelerBookingIds,
  });
  const shown = visibleLedgerRows(scoped);
  const bookingById = new Map(input.bookings.map((booking) => [booking.id, booking]));
  const movements = shown.map((row) => {
    const credit = row.direction === "credit";
    const booking = row.booking_id ? bookingById.get(row.booking_id) : undefined;
    const visibleBooking = booking?.visible_to_client ? booking : undefined;
    const tripDates =
      visibleBooking && (visibleBooking.start_date || visibleBooking.end_date)
        ? formatDateRangeShort(visibleBooking.start_date, visibleBooking.end_date)
        : null;
    const place = ledgerPlace(visibleBooking);
    const reference = visibleBooking?.reference || null;
    const rawTitle = ledgerMovementTitle(row, TX_KIND_LABELS[row.kind] || row.kind);
    const carnet = carnetLink(booking, input.audience, input.viewerId);
    const companyName = row.billing_company_id
      ? input.companyNames?.get(row.billing_company_id)
      : null;
    return {
      id: row.id,
      credit,
      title: ledgerSubjectTitle(rawTitle, reference),
      amountLabel: `${credit ? "+" : "−"}${formatMoney(Number(row.amount), row.currency)}`,
      occurredLabel: formatDateFr(row.occurred_on),
      kindLabel: TX_KIND_LABELS[row.kind] || row.kind,
      whenWhere: ledgerWhenWhere(tripDates, place),
      reference,
      carnetHref: carnet.href,
      carnetLabel: carnet.label,
      companyLabel: transactionCompanyLabel(input.billingCompanyCount || 0, companyName),
      bookingId: row.booking_id,
    };
  });

  // Le pourcentage suit le wallet (séjour compris), pas la liste qui masque le montant global.
  const { debits, settledPct } = postedLedgerTotals(scoped);
  const balanceValue = member
    ? -debits
    : input.walletBalance == null
      ? 0
      : input.walletBalance;
  const currency = member ? scoped[0]?.currency || input.currency || "EUR" : input.currency || "EUR";
  const remaining = Math.max(0, -balanceValue);
  const payerByBooking = new Map(
    input.bookings.map((booking) => [booking.id, booking.payer_kind ?? null] as const)
  );
  const split = owedByPayer(scoped, payerByBooking, currency);
  const owed = fitPayerOwed(split.company, split.personal, remaining);
  const soleCompanyName =
    (input.billingCompanyCount || 0) === 1
      ? [...(input.companyNames?.values() || [])][0] || null
      : null;
  const walletRows = member
    ? [{ currency, balance: balanceValue }]
    : input.wallets && input.wallets.length
      ? input.wallets.map((wallet) => ({ currency: wallet.currency || "EUR", balance: Number(wallet.balance) || 0 }))
      : [{ currency, balance: balanceValue }];
  const wallets = walletRows.map((wallet) => walletView(wallet.currency, wallet.balance, scoped));

  return {
    member,
    currency,
    balanceValue,
    debits,
    remaining,
    remainingPct: settledPct == null ? null : Math.max(0, 100 - settledPct),
    creditCount: shown.filter((row) => row.direction === "credit").length,
    wallets,
    owed,
    soleCompanyName,
    movements,
    spending: input.spendAccounts?.length
      ? shapeSpendingDesk({
          member,
          viewerId: input.viewerId || "",
          currency,
          accounts: input.spendAccounts,
          bookings: input.bookings,
          movements,
          rows: shown.map((row) => ({
            booking_id: row.booking_id,
            direction: row.direction,
            amount: row.amount,
            currency: row.currency,
          })),
        })
      : null,
  };
}

function carnetLink(
  booking: ClientLedgerBooking | undefined,
  audience: ClientLedgerAudience,
  viewerId?: string
): { href: string | null; label: string | null } {
  if (!booking) return { href: null, label: null };
  if (audience === "staff") {
    return { href: `/admin/reservations/${booking.id}`, label: "Ouvrir le dossier" };
  }
  if (booking.customer_id && viewerId && booking.customer_id !== viewerId) {
    return { href: null, label: null };
  }
  if (booking.visible_to_client && booking.reference) {
    return {
      href: `/mon-compte/reservations/${booking.reference}`,
      label: "Accéder à ma réservation",
    };
  }
  return { href: null, label: null };
}

type SpendPerson = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  spending_allowance: number | string | null;
};

function spendPersonName(person: { first_name?: string | null; last_name?: string | null }) {
  return customerFullName({
    first_name: person.first_name || "",
    last_name: person.last_name || "",
  });
}

function serviceClientOrNull() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

const SPEND_BOOKING_SELECT =
  "id, title, destination, reference, start_date, end_date, visible_to_client, payer_kind, customer_id, status, total_amount, agency_commission";

async function enrichSpendBookings(
  reader: SupabaseClient,
  bookings: ClientLedgerBooking[],
  people: Map<string, SpendPerson>
) {
  const priced = bookings.filter((booking) => booking.id);
  if (!priced.length) return bookings;
  let amounts = new Map<string, number>();
  try {
    amounts = await loadDisplayedStayAmounts(
      reader,
      priced.map((booking) => ({
        id: booking.id,
        status: booking.status || "confirmed",
        total_amount: booking.total_amount ?? 0,
        agency_commission: booking.agency_commission === true,
      }))
    );
  } catch {
    amounts = new Map();
  }
  return bookings.map((booking) => {
    const owner = booking.customer_id ? people.get(booking.customer_id) : undefined;
    const displayed = amounts.get(booking.id);
    return {
      ...booking,
      owner_name: owner ? spendPersonName(owner) : booking.owner_name || null,
      displayed_amount: displayed == null ? booking.displayed_amount ?? null : displayed,
    };
  });
}

export async function loadClientLedger(
  supabase: SupabaseClient,
  customer: Pick<CrmCustomer, "id" | "company_role"> &
    Partial<Pick<CrmCustomer, "first_name" | "last_name" | "spending_allowance">>,
  audience: ClientLedgerAudience
): Promise<ClientLedgerView> {
  const member = isCompanyMember(customer);
  const { data: myBookings } = await supabase
    .from("crm_bookings")
    .select("id")
    .eq("customer_id", customer.id);
  const bookingIds = ((myBookings || []) as { id: string }[]).map((booking) => booking.id);

  let rows: CrmTransaction[] = [];
  let walletBalance: number | null = null;
  let currency = "EUR";
  let wallets: { currency: string; balance: number }[] = [];

  if (member) {
    if (bookingIds.length) {
      const { data: txs } = await supabase
        .from("crm_transactions")
        .select("*")
        .eq("status", "posted")
        .eq("direction", "debit")
        .in("booking_id", bookingIds)
        .order("occurred_on", { ascending: false });
      rows = (txs || []) as CrmTransaction[];
    }
  } else {
    const [{ data: txs }, { data: balances }] = await Promise.all([
      supabase
        .from("crm_transactions")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("status", "posted")
        .order("occurred_on", { ascending: false }),
      supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    ]);
    rows = (txs || []) as CrmTransaction[];
    // Un solde par devise : l’euro reste la devise principale (règlement), les autres ont leur bloc.
    wallets = ((balances || []) as CrmBalance[]).map((row) => ({
      currency: row.currency || "EUR",
      balance: Number(row.balance),
    }));
    const balance = primaryWallet(wallets);
    walletBalance = balance ? balance.balance : 0;
    currency = balance?.currency || "EUR";
  }

  const { data: companyRows } = await supabase
    .from("crm_billing_companies")
    .select("id, company_name")
    .eq("customer_id", customer.id)
    .order("sort_order");
  const billingCompanies = (companyRows || []) as Pick<CrmBillingCompany, "id" | "company_name">[];
  const companyNames = new Map(billingCompanies.map((company) => [company.id, company.company_name]));
  const contextIds = [...new Set(rows.map((row) => row.booking_id).filter(Boolean))] as string[];
  let bookings: ClientLedgerBooking[] = [];
  if (contextIds.length) {
    const { data: linked } = await supabase
      .from("crm_bookings")
      .select(SPEND_BOOKING_SELECT)
      .in("id", contextIds);
    bookings = (linked || []) as ClientLedgerBooking[];
  }

  const spend = await loadSpendAccounts(supabase, customer, bookings, contextIds);
  bookings = spend.bookings;

  return shapeClientLedger({
    companyRole: customer.company_role,
    travelerBookingIds: bookingIds,
    rows,
    walletBalance,
    currency,
    bookings,
    audience,
    billingCompanyCount: billingCompanies.length,
    companyNames,
    wallets,
    viewerId: customer.id,
    spendAccounts: spend.accounts,
  });
}

function roundLedger(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function expenseMovementTitle(title: string) {
  return `Dépense · ${visibleServiceCopy(title.trim())}`;
}

function shiftBalance(balance: number, debits: number, delta: number) {
  const credits = balance + debits;
  const nextDebits = roundLedger(debits + delta);
  const nextBalance = roundLedger(balance - delta);
  const settled = nextDebits > 0 ? Math.min(100, Math.round((credits / nextDebits) * 100)) : null;
  return {
    balanceValue: nextBalance,
    debits: nextDebits,
    remaining: Math.max(0, roundLedger(-nextBalance)),
    remainingPct: settled == null ? null : Math.max(0, 100 - settled),
  };
}

function patchExpenseMovements(
  rows: LedgerMovementRow[],
  change: {
    bookingId: string;
    itemId: string;
    previousTitle: string;
    title: string;
    amount: number;
    removed: boolean;
    currency: string;
  }
) {
  const previous = expenseMovementTitle(change.previousTitle);
  const next = expenseMovementTitle(change.title);
  let found = false;
  const mapped = rows.flatMap((row) => {
    const same =
      !row.credit &&
      row.bookingId === change.bookingId &&
      (row.title === previous || row.id === `expense:${change.itemId}`);
    if (!same) return [row];
    found = true;
    if (change.removed || change.amount <= 0) return [];
    return [{ ...row, id: row.id.startsWith("expense:") ? `expense:${change.itemId}` : row.id, title: next, amountLabel: `−${formatMoney(change.amount, change.currency)}` }];
  });
  if (!found && !change.removed && change.amount > 0) {
    mapped.unshift({
      id: `expense:${change.itemId}`,
      credit: false,
      title: next,
      amountLabel: `−${formatMoney(change.amount, change.currency)}`,
      occurredLabel: formatDateFr(new Date().toISOString().slice(0, 10)),
      kindLabel: "Dépense",
      whenWhere: null,
      reference: null,
      carnetHref: null,
      bookingId: change.bookingId,
    });
  }
  return mapped;
}

/** Le prix affiché dans Transactions suit la dépense tout de suite, avant le rechargement du dossier. */
export function applyExpenseLedgerChange(
  view: ClientLedgerView | null,
  change: {
    bookingId: string;
    itemId: string;
    previousTitle: string;
    title: string;
    previousAmount: number;
    amount: number;
    removed?: boolean;
    currency?: string;
  }
): ClientLedgerView | null {
  if (!view) return view;
  const currency = change.currency || view.currency || "EUR";
  const removed = change.removed === true;
  const delta = roundLedger((removed ? 0 : change.amount) - change.previousAmount);
  const patch = {
    bookingId: change.bookingId,
    itemId: change.itemId,
    previousTitle: change.previousTitle,
    title: change.title,
    amount: change.amount,
    removed,
    currency,
  };
  const shifted = shiftBalance(view.balanceValue, view.debits, delta);
  const owedRemaining = shifted.remaining;
  const solePersonal = view.owed.company <= 0;
  const soleCompany = view.owed.personal <= 0 && view.owed.company > 0;
  return {
    ...view,
    ...shifted,
    wallets: view.wallets.map((wallet) =>
      wallet.currency === currency ? { ...wallet, ...shiftBalance(wallet.balanceValue, wallet.debits, delta) } : wallet
    ),
    owed: {
      total: owedRemaining,
      company: soleCompany ? roundLedger(Math.max(0, view.owed.company + delta)) : view.owed.company,
      personal: solePersonal ? roundLedger(Math.max(0, view.owed.personal + delta)) : view.owed.personal,
    },
    movements: patchExpenseMovements(view.movements, patch),
    spending: view.spending
      ? {
          ...view.spending,
          cards: view.spending.cards.map((card) =>
            card.id === change.bookingId
              ? { ...card, movements: patchExpenseMovements(card.movements, patch) }
              : card
          ),
          otherMovements: patchExpenseMovements(view.spending.otherMovements, patch),
        }
      : null,
  };
}

async function loadSpendAccounts(
  supabase: SupabaseClient,
  customer: Pick<CrmCustomer, "id" | "company_role"> &
    Partial<Pick<CrmCustomer, "first_name" | "last_name" | "spending_allowance">>,
  bookings: ClientLedgerBooking[],
  contextIds: string[]
): Promise<{ bookings: ClientLedgerBooking[]; accounts: SpendingAccountInput[] }> {
  let allowance = customer.spending_allowance;
  let firstName = customer.first_name;
  let lastName = customer.last_name;
  if (allowance === undefined || (!firstName && !lastName)) {
    const { data } = await supabase
      .from("crm_customers")
      .select("first_name, last_name, spending_allowance")
      .eq("id", customer.id)
      .maybeSingle();
    const row = data as SpendPerson | null;
    if (row) {
      if (allowance === undefined) allowance = row.spending_allowance == null ? null : Number(row.spending_allowance);
      firstName = firstName || row.first_name || undefined;
      lastName = lastName || row.last_name || undefined;
    }
  }

  const people = new Map<string, SpendPerson>();
  people.set(customer.id, {
    id: customer.id,
    first_name: firstName || null,
    last_name: lastName || null,
    spending_allowance: allowance ?? null,
  });

  const member = isCompanyMember(customer);
  if (!member && customer.company_role === "admin") {
    const admin = serviceClientOrNull();
    if (admin) {
      const { data: members } = await admin
        .from("crm_customers")
        .select("id, first_name, last_name, spending_allowance")
        .eq("billing_parent_id", customer.id)
        .eq("company_role", "member");
      for (const row of (members || []) as SpendPerson[]) people.set(row.id, row);

      if (contextIds.length) {
        const { data: linked } = await admin.from("crm_bookings").select(SPEND_BOOKING_SELECT).in("id", contextIds);
        const byId = new Map(bookings.map((booking) => [booking.id, booking]));
        for (const row of (linked || []) as ClientLedgerBooking[]) {
          const current = byId.get(row.id);
          byId.set(row.id, { ...current, ...row, customer_id: row.customer_id ?? current?.customer_id });
        }
        bookings = [...byId.values()];
      }
    }
  }

  const accounts: SpendingAccountInput[] = [...people.values()].map((person) => ({
    id: person.id,
    name: spendPersonName(person),
    allowance: person.spending_allowance == null ? null : Number(person.spending_allowance),
  }));
  if (!accounts.some((account) => hasSpendingAllowance(account.allowance))) {
    return { bookings, accounts: [] };
  }

  const reader = !member && customer.company_role === "admin" ? serviceClientOrNull() || supabase : supabase;
  return { bookings: await enrichSpendBookings(reader, bookings, people), accounts };
}
