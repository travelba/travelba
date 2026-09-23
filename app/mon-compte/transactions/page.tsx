import { redirect } from "next/navigation";
import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { loadClientLedger } from "@/lib/crm/client-ledger";

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
    <ClientTransactionsPanel view={view} billingHref="/mon-compte/profil/facturation" />
  );
}
