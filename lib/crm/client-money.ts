import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmBalance, CrmBooking, CrmCustomer, CrmTransaction } from "@/lib/crm/types";
import {
  companyDisplayName,
  companyPaidBookingIds,
  hasBillingParent,
  sortLedgerRows,
  splitMemberLedger,
} from "@/lib/crm/company-role";

export type ClientMoneySnapshot = {
  /** Voyages facturés à un autre wallet (parent ou dossier). */
  sharedBilling: boolean;
  /** @deprecated alias de sharedBilling */
  member: boolean;
  companyName: string | null;
  companyRows: CrmTransaction[];
  personalRows: CrmTransaction[];
  personalBalance: number;
  personalCurrency: string;
};

/** Encours du voyageur + frais de dossiers facturés ailleurs (sans le solde payeur). */
export async function loadClientMoneySnapshot(
  supabase: SupabaseClient,
  customer: CrmCustomer
): Promise<ClientMoneySnapshot> {
  const parentId = customer.billing_parent_id;

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
      parentId
        ? supabase
            .from("crm_customers")
            .select("id, first_name, last_name, company_name")
            .eq("id", parentId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const bookings = (myBookings || []) as Pick<
    CrmBooking,
    "id" | "customer_id" | "billing_customer_id"
  >[];
  const paidIds = companyPaidBookingIds(bookings, customer.id);
  const sharedBilling = hasBillingParent(customer) || paidIds.length > 0;

  let companyDebitRows: CrmTransaction[] = [];
  if (paidIds.length) {
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
  const split = sharedBilling
    ? splitMemberLedger({
        personalRows,
        companyDebitRows,
        companyPaidBookingIds: paidIds,
      })
    : { personalRows, companyRows: [] as CrmTransaction[] };

  const bal = ((balances || []) as CrmBalance[])[0];
  let parent = parentRes.data as Pick<
    CrmCustomer,
    "company_name" | "first_name" | "last_name"
  > | null;

  if (!parent && paidIds.length) {
    const payerId = bookings.find((b) => b.billing_customer_id !== customer.id)?.billing_customer_id;
    if (payerId) {
      const { data } = await supabase
        .from("crm_customers")
        .select("id, first_name, last_name, company_name")
        .eq("id", payerId)
        .maybeSingle();
      parent = data as typeof parent;
    }
  }

  return {
    sharedBilling,
    member: sharedBilling,
    companyName: sharedBilling ? companyDisplayName(parent) : null,
    companyRows: sortLedgerRows(split.companyRows),
    personalRows: sortLedgerRows(split.personalRows),
    personalBalance: bal ? Number(bal.balance) : 0,
    personalCurrency: bal?.currency || split.personalRows[0]?.currency || "EUR",
  };
}
