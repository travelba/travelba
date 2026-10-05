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
import { fitPayerOwed, owedByPayer } from "@/lib/crm/payer";
import {
  TX_KIND_LABELS,
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
    const carnet = carnetLink(booking, input.audience);
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
  };
}

function carnetLink(
  booking: ClientLedgerBooking | undefined,
  audience: ClientLedgerAudience
): { href: string | null; label: string | null } {
  if (!booking) return { href: null, label: null };
  if (audience === "staff") {
    return { href: `/admin/reservations/${booking.id}`, label: "Ouvrir le dossier" };
  }
  if (booking.visible_to_client && booking.reference) {
    return {
      href: `/mon-compte/reservations/${booking.reference}`,
      label: "Accéder à ma réservation",
    };
  }
  return { href: null, label: null };
}

export async function loadClientLedger(
  supabase: SupabaseClient,
  customer: Pick<CrmCustomer, "id" | "company_role">,
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
      .select("id, title, destination, reference, start_date, end_date, visible_to_client, payer_kind")
      .in("id", contextIds);
    bookings = (linked || []) as ClientLedgerBooking[];
  }

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
  });
}
