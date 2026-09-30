import { redirect } from "next/navigation";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { StayPayment } from "@/components/account/StayPayment";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger";
import { formatMoney } from "@/lib/crm/money";
import { encoursPartLabel, type PayerKind } from "@/lib/crm/payer";
import { stripePublishableKey } from "@/lib/crm/stripe";
import { stayPayMethods } from "@/lib/crm/stripe-pay";

export default async function TransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const view = await loadClientLedger(supabase, customer, "client");
  const stripeKey = stripePublishableKey();

  function part(kind: PayerKind) {
    const amount = kind === "company" ? view.owed.company : view.owed.personal;
    const payable = amount >= 0.5;
    return (
      <StayPayment
        compact
        stripeKey={stripeKey}
        parts={[
          {
            kind,
            mention: encoursPartLabel(kind, kind === "company" ? view.soleCompanyName : null),
            amountLabel: formatMoney(amount, view.currency),
            payable,
            canPay: payable,
            methods: payable ? stayPayMethods(kind, view.currency) : [],
            companyName: kind === "company" ? view.soleCompanyName : null,
          },
        ]}
      />
    );
  }

  return (
    <ClientTransactionsPanel
      view={view}
      billingHref="/mon-compte/profil/facturation"
      payments={
        view.member || view.owed.total <= 0
          ? null
          : {
              company: view.owed.company >= 0.5 ? part("company") : null,
              personal: view.owed.personal >= 0.5 ? part("personal") : null,
            }
      }
    />
  );
}
