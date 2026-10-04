import { redirect } from "next/navigation";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { EncoursPayment } from "@/components/account/EncoursPayment";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { stripePublishableKey } from "@/lib/crm/stripe";
import { siteConfig } from "@/lib/site";

export const metadata = { title: `Transactions — ${siteConfig.shortName}` };

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
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#b89768]">Mon espace voyage</p>
        <h1 className="mt-1 font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
          Transactions
        </h1>
      </div>
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
    </div>
  );
}
