import { redirect } from "next/navigation";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { EncoursPayment } from "@/components/account/EncoursPayment";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { stripePublishableKey } from "@/lib/crm/stripe";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const view = await loadClientLedger(supabase, customer, "client");

  return (
    <ClientTransactionsPanel
      view={view}
      billingHref="/mon-compte/profil/facturation"
      payments={
        view.member || view.owed.total <= 0 ? null : (
          <EncoursPayment
            compact
            company={view.owed.company}
            personal={view.owed.personal}
            currency={view.currency}
            soleCompanyName={view.soleCompanyName}
            stripeKey={stripePublishableKey()}
          />
        )
      }
    />
  );
}
