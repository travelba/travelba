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
};

export type ClientLedgerView = {
  member: boolean;
  currency: string;
  balanceValue: number;
  debits: number;
  remaining: number;
  remainingPct: number | null;
  creditCount: number;
  movements: LedgerMovementRow[];
};

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

  const { debits: scopedDebits } = postedLedgerTotals(scoped);
  const balanceValue = member
    ? -scopedDebits
    : input.walletBalance == null
      ? 0
      : input.walletBalance;
  const currency = member ? scoped[0]?.currency || input.currency || "EUR" : input.currency || "EUR";
  const { debits, settledPct } = postedLedgerTotals(shown);
  const remaining = Math.max(0, -balanceValue);

  return {
    member,
    currency,
    balanceValue,
    debits,
    remaining,
    remainingPct: settledPct == null ? null : Math.max(0, 100 - settledPct),
    creditCount: shown.filter((row) => row.direction === "credit").length,
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
    const balance = ((balances || []) as CrmBalance[])[0];
    walletBalance = balance ? Number(balance.balance) : 0;
    currency = balance?.currency || "EUR";
  }

  const shown = visibleLedgerRows(
    filterClientLedgerRows(rows, {
      companyRole: customer.company_role,
      travelerBookingIds: bookingIds,
    })
  );
  const { data: companyRows } = await supabase
    .from("crm_billing_companies")
    .select("id, company_name")
    .eq("customer_id", customer.id)
    .order("sort_order");
  const billingCompanies = (companyRows || []) as Pick<CrmBillingCompany, "id" | "company_name">[];
  const companyNames = new Map(billingCompanies.map((company) => [company.id, company.company_name]));
  const contextIds = [...new Set(shown.map((row) => row.booking_id).filter(Boolean))] as string[];
  let bookings: ClientLedgerBooking[] = [];
  if (contextIds.length) {
    const { data: linked } = await supabase
      .from("crm_bookings")
      .select("id, title, destination, reference, start_date, end_date, visible_to_client")
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
  });
}
