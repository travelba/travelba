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
import type { CrmRevolutTransaction } from "@/lib/crm/types";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

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
        ? "Compte Revolut connecté. Les virements sans ambiguïté seront crédités automatiquement."
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
  try {
    const { data } = await admin
      .from("crm_revolut_transactions")
      .select("*")
      .eq("direction", "credit")
      .order("booked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    rows = (data || []) as CrmRevolutTransaction[];
  } catch {
    rows = [];
  }

  const suggestions: Record<string, RevolutMatchCandidate[]> = {};
  for (const row of rows) {
    if (row.status !== "unmatched") continue;
    suggestions[row.id] = scoreRevolutMatches(row, index).candidates;
  }

  const hasClientId = Boolean(revolutClientId());
  const connected = await revolutConnected();
  const balance = connected ? await loadRevolutAccountBalances() : null;

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Rapprochement Revolut"
        subtitle="Virements reçus : expéditeur et désignation. Proposition pré-sélectionnée seulement si elle est certaine : Valider, choisir ou Refuser."
      />
      <div className="mt-6 space-y-4">
        {balance ? <AccountBalanceCard pockets={balance} /> : null}
        <RevolutInbox
          rows={rows}
          customers={customers}
          suggestions={suggestions}
          configured={revolutConfigured()}
          connected={connected}
          hasClientId={hasClientId}
          initialMessage={initialMessage}
        />
      </div>
    </div>
  );
}
