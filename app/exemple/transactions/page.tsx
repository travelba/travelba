import { ClientTransactionsPanel } from "@/components/account/ClientTransactionsPanel";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";

export default function ExampleTransactionsPage() {
  const { ledger } = readExample();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#b89768]">Mon espace voyage</p>
        <h1 className="mt-1 font-display text-[1.625rem] font-bold tracking-tight text-[var(--admin-navy)]">
          Transactions
        </h1>
      </div>
      <ClientTransactionsPanel
        view={ledger}
        billingHref={`${EXAMPLE_BASE}/profil/facturation`}
        statementEndpoint="/api/exemple/releve"
      />
    </div>
  );
}
