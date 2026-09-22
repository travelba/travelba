import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBalance, CrmBooking, CrmCustomer, CrmTransaction } from "@/lib/crm/types";
import {
  companyDisplayName,
  companyPaidBookingIds,
  isCompanyMember,
  sortLedgerRows,
  splitMemberLedger,
} from "@/lib/crm/company-role";

export type ClientMoneySnapshot = {
  member: boolean;
  companyName: string | null;
  companyRows: CrmTransaction[];
  personalRows: CrmTransaction[];
  personalBalance: number;
  personalCurrency: string;
};

/** Encours perso + frais de dossiers société (sans le solde société). */
export async function loadClientMoneySnapshot(
  supabase: SupabaseClient,
  customer: CrmCustomer
): Promise<ClientMoneySnapshot> {
  const member = isCompanyMember(customer);

  const [{ data: myBookings }, { data: personalTxs }, { data: balances }, parentRes] =
    await Promise.all([
      supabase
        .from("crm_bookings")
        .select("id, customer_id, billing_customer_id")
        .eq("customer_id", customer.id),
      supabase
        .from("crm_transactions")
        .select("*")
        .eq("customer_id", customer.id)
        .eq("status", "posted")
        .order("occurred_on", { ascending: false }),
      supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
      member && customer.billing_parent_id
        ? supabase
            .from("crm_customers")
            .select("id, first_name, last_name, company_name")
            .eq("id", customer.billing_parent_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const bookings = (myBookings || []) as Pick<
    CrmBooking,
    "id" | "customer_id" | "billing_customer_id"
  >[];
  const paidIds = companyPaidBookingIds(bookings, customer.id);

  let companyDebitRows: CrmTransaction[] = [];
  if (member && paidIds.length) {
    const { data } = await supabase
      .from("crm_transactions")
      .select("*")
      .eq("status", "posted")
      .eq("direction", "debit")
      .in("booking_id", paidIds)
      .order("occurred_on", { ascending: false });
    companyDebitRows = (data || []) as CrmTransaction[];
  }

  const personalRows = (personalTxs || []) as CrmTransaction[];
  const split = member
    ? splitMemberLedger({
        personalRows,
        companyDebitRows,
        companyPaidBookingIds: paidIds,
      })
    : { personalRows, companyRows: [] as CrmTransaction[] };

  const bal = ((balances || []) as CrmBalance[])[0];
  const parent = parentRes.data as Pick<
    CrmCustomer,
    "company_name" | "first_name" | "last_name"
  > | null;

  return {
    member,
    companyName: member ? companyDisplayName(parent) : null,
    companyRows: sortLedgerRows(split.companyRows),
    personalRows: sortLedgerRows(split.personalRows),
    personalBalance: bal ? Number(bal.balance) : 0,
    personalCurrency: bal?.currency || split.personalRows[0]?.currency || "EUR",
  };
}
