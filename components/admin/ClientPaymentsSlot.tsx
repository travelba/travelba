import { ClientPaymentsToCredit } from "@/components/admin/argent/ClientPaymentsToCredit";
import { suggestionsForCustomer, type RevolutMatchCustomer } from "@/lib/crm/revolut-match";
import { suggestionsForStripeCustomer, type StripeMatchCustomer } from "@/lib/crm/stripe-match";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer, CrmRevolutTransaction, CrmStripeTransaction } from "@/lib/crm/types";

const MATCH_SELECT = "id, first_name, last_name, company_name, iban, email, stripe_customer_id";

/** Une seule lecture de crm_customers pour Revolut et Stripe. Hors du premier affichage. */
export async function ClientPaymentsSlot({ customer }: { customer: CrmCustomer }) {
  let revolutRows: CrmRevolutTransaction[] = [];
  let stripeRows: CrmStripeTransaction[] = [];
  let people: (RevolutMatchCustomer & StripeMatchCustomer)[] = [];
  try {
    const admin = createServiceClient();
    const [revolut, stripe, roster] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("*")
        .eq("status", "unmatched")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(100),
      admin
        .from("crm_stripe_transactions")
        .select("*")
        .eq("status", "unmatched")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(100),
      admin.from("crm_customers").select(MATCH_SELECT),
    ]);
    revolutRows = (revolut.data || []) as CrmRevolutTransaction[];
    stripeRows = (stripe.data || []) as CrmStripeTransaction[];
    people = (roster.data || []) as (RevolutMatchCustomer & StripeMatchCustomer)[];
  } catch {
    revolutRows = [];
    stripeRows = [];
    people = [];
  }
  const count =
    suggestionsForCustomer(customer, revolutRows, people).length +
    suggestionsForStripeCustomer(customer, stripeRows, people).length;
  return <ClientPaymentsToCredit customerId={customer.id} count={count} />;
}
