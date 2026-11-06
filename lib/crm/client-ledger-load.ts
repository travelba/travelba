import "server-only";
import {
  loadClientLedger as loadLedger,
  loadClientLedgerViews as loadLedgerViews,
  type ClientLedgerAudience,
  type ClientLedgerView,
} from "@/lib/crm/client-ledger";
import { reconcileCustomerSepa } from "@/lib/crm/sepa-ledger";
import { createServiceClient } from "@/lib/supabase/admin";
import type { CrmCustomer } from "@/lib/crm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type LedgerCustomer = Pick<CrmCustomer, "id" | "company_role"> &
  Partial<Pick<CrmCustomer, "first_name" | "last_name" | "spending_allowance" | "billing_parent_id" | "stripe_customer_id">>;

/** Relit Stripe avant le grand livre, pour un prélèvement déjà lancé dont le webhook a manqué. */
export async function reconcileLedgerSepa(customer: LedgerCustomer) {
  const stripeCustomerId = customer.stripe_customer_id || null;
  if (!stripeCustomerId || customer.company_role === "member") return;
  try {
    await reconcileCustomerSepa(createServiceClient(), { id: customer.id, stripeCustomerId });
  } catch (error) {
    console.error("[sepa]", error instanceof Error ? error.message : "rapprochement");
  }
}

export async function loadClientLedger(
  supabase: SupabaseClient,
  customer: LedgerCustomer,
  audience: ClientLedgerAudience
): Promise<ClientLedgerView> {
  await reconcileLedgerSepa(customer);
  return loadLedger(supabase, customer, audience);
}

export async function loadClientLedgerViews(
  supabase: SupabaseClient,
  customer: LedgerCustomer,
  audiences: ClientLedgerAudience[]
) {
  await reconcileLedgerSepa(customer);
  return loadLedgerViews(supabase, customer, audiences);
}
