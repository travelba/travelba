import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { StripeInbox } from "@/components/admin/StripeInbox";
import { AccountBalanceCard } from "@/components/admin/AccountBalance";
import { loadStripeAccountBalance, stripeConfigured } from "@/lib/crm/stripe";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import {
  scoreStripeMatches,
  STRIPE_MATCH_SELECT,
  type StripeMatchCandidate,
  type StripeMatchCustomer,
} from "@/lib/crm/stripe-match";
import type { CrmStripeTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export default async function AdminStripePage() {
  await requireStaffPage();
  const admin = createServiceClient();
  const { data: people } = await admin
    .from("crm_customers")
    .select(`${STRIPE_MATCH_SELECT}, phone`)
    .order("last_name");
  const index = (people || []) as (StripeMatchCustomer & PickableCustomer)[];
  const customers: PickableCustomer[] = index.map(
    ({ id, first_name, last_name, company_name, email, phone }) => ({
      id,
      first_name,
      last_name,
      company_name,
      email,
      phone,
    })
  );

  let rows: CrmStripeTransaction[] = [];
  try {
    const { data } = await admin
      .from("crm_stripe_transactions")
      .select("*")
      .eq("direction", "credit")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    rows = (data || []) as CrmStripeTransaction[];
  } catch {
    rows = [];
  }

  const suggestions: Record<string, StripeMatchCandidate[]> = {};
  for (const row of rows) {
    if (row.status !== "unmatched") continue;
    suggestions[row.id] = scoreStripeMatches(row, index).candidates;
  }

  const balance = stripeConfigured() ? await loadStripeAccountBalance() : null;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Rapprochement Stripe"
        subtitle="Paiements reçus : payeur et référence. Proposition pré-sélectionnée seulement si elle est certaine : Valider, choisir ou Refuser."
      />
      <div className="mt-6 space-y-4">
        {balance ? <AccountBalanceCard pockets={balance} /> : null}
        <StripeInbox
          rows={rows.map((row) => ({ ...row, payer_email: null, raw: {} }))}
          customers={customers}
          suggestions={suggestions}
          configured={stripeConfigured()}
        />
      </div>
    </div>
  );
}
