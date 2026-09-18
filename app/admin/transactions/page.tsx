import { Ledger } from "@/components/admin/Ledger";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { stripeConfigured, stripeWebhookConfigured } from "@/lib/crm/stripe";
import type { CrmCustomer, CrmTransaction } from "@/lib/crm/types";

export default async function AdminTransactionsPage() {
  const { supabase } = await requireStaffPage();
  const [{ data: transactions }, { data: customers }] = await Promise.all([
    supabase
      .from("crm_transactions")
      .select("*")
      .order("occurred_on", { ascending: false })
      .limit(200),
    supabase.from("crm_customers").select("*").order("last_name"),
  ]);
  const stripeReady = stripeConfigured() && stripeWebhookConfigured();

  return (
    <div>
      <PageEyebrow>Back-office</PageEyebrow>
      <PageTitle
        title="Grand livre"
        subtitle="Débits réservations, crédits Revolut et ajustements — seules les écritures comptabilisées impactent l’encours."
      />
      {!stripeReady ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-white/70 px-4 py-3 text-sm text-muted">
          Cartes Stripe non ouvertes. Le grand livre manuel et le rapprochement Revolut suffisent.
          Pour un webhook live plus tard : coller sk_live, pk_live et whsec dans Vercel Production.
        </p>
      ) : null}
      <div className="mt-6">
        <Ledger
          transactions={(transactions || []) as CrmTransaction[]}
          customers={(customers || []) as CrmCustomer[]}
        />
      </div>
    </div>
  );
}
