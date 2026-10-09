import { requireStaffPage } from "@/lib/crm/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { RevolutInbox } from "@/components/admin/RevolutInbox";
import { AccountBalanceCard } from "@/components/admin/AccountBalance";
import { loadRevolutAccountBalances, revolutClientId, revolutConfigured, revolutConnected } from "@/lib/crm/revolut";
import type { PickableCustomer } from "@/lib/crm/customer-search";
import {
  REVOLUT_MATCH_SELECT,
  scoreRevolutMatches,
  type RevolutMatchCandidate,
  type RevolutMatchCustomer,
} from "@/lib/crm/revolut-match";
import { wireAccountChoices } from "@/lib/crm/funding-wallet";
import { revolutDebitLine } from "@/lib/crm/revolut-inbox";
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export const metadata = { title: "Revolut" };

export default async function AdminRevolutPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  await requireStaffPage();
  const params = await searchParams;
  const initialMessage =
    params.error === "oauth"
      ? "Connexion Revolut refusée ou expirée. Relancez « Connecter Revolut »."
      : params.connected === "1"
        ? "Compte Revolut connecté. Chaque virement reste à rapprocher jusqu’au clic Valider."
        : null;
  const admin = createServiceClient();
  const { data: people } = await admin
    .from("crm_customers")
    .select(`${REVOLUT_MATCH_SELECT}, email, phone`)
    .order("last_name");
  const index = (people || []) as (RevolutMatchCustomer & PickableCustomer)[];
  // Le score (IBAN compris) se calcule ici ; le navigateur ne reçoit que les colonnes du sélecteur.
  const customers: PickableCustomer[] = index.map(({ id, first_name, last_name, company_name, email, phone }) => ({
    id,
    first_name,
    last_name,
    company_name,
    email,
    phone,
  }));

  let rows: CrmRevolutTransaction[] = [];
  let debits: ReturnType<typeof revolutDebitLine>[] = [];
  try {
    const [credits, outs] = await Promise.all([
      admin
        .from("crm_revolut_transactions")
        .select("*")
        .eq("direction", "credit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
      admin
        .from("crm_revolut_transactions")
        .select("id, amount, currency, counterparty_name, reference, booked_at, raw")
        .eq("direction", "debit")
        .order("booked_at", { ascending: false, nullsFirst: false })
        .limit(200),
    ]);
    rows = (credits.data || []) as CrmRevolutTransaction[];
    debits = ((outs.data || []) as CrmRevolutTransaction[]).map(revolutDebitLine);
  } catch {
    rows = [];
    debits = [];
  }

  const suggestions: Record<string, RevolutMatchCandidate[]> = {};
  for (const row of rows) {
    if (row.status !== "unmatched") continue;
    suggestions[row.id] = scoreRevolutMatches(row, index).candidates;
  }

  const { data: fundingCompanies } = await admin
    .from("crm_billing_companies")
    .select("id, customer_id, company_name, funding, sort_order")
    .in("funding", ["advance", "pro"]);
  const accounts = wireAccountChoices(
    (fundingCompanies || []) as {
      id: string;
      customer_id: string;
      company_name: string | null;
      funding: string | null;
      sort_order: number;
    }[]
  );

  const hasClientId = Boolean(revolutClientId());
  const connected = await revolutConnected();
  const balance = connected ? await loadRevolutAccountBalances() : null;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Revolut"
        subtitle="Virements reçus à rapprocher. Les sorties du compte sont dans l’onglet Débits : elles ne créditent pas un client."
      />
      <div className="mt-6 space-y-4">
        {balance ? <AccountBalanceCard pockets={balance} /> : null}
        <RevolutInbox
          rows={rows}
          debits={debits}
          customers={customers}
          suggestions={suggestions}
          accounts={accounts}
          configured={revolutConfigured()}
          connected={connected}
          hasClientId={hasClientId}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
