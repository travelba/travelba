import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { EXAMPLE_BASE, exampleLedgerView } from "@/lib/crm/example-session";

export default function ExampleTransactionsPage() {
  return (
    <ClientTransactionsPanel view={exampleLedgerView()} billingHref={`${EXAMPLE_BASE}/profil/facturation`} />
  );
}
