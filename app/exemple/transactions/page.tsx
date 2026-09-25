import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleTransactionsPage() {
  const { ledger } = readExample();
  return <ClientTransactionsPanel view={ledger} billingHref={`${EXAMPLE_BASE}/profil/facturation`} />;
}
