import { requireStaffPage } from "@/lib/crm/auth";
import { QuotesManager } from "@/components/admin/QuotesManager";

export default async function AdminQuotesPage() {
  const { supabase } = await requireStaffPage("quotes");
  const [{ data: quotes }, { data: customers }] = await Promise.all([
    supabase.from("crm_quotes").select("id,reference,title,status,currency,valid_until,customer_id").order("created_at", { ascending: false }),
    supabase.from("crm_customers").select("id,first_name,last_name,email").order("last_name"),
  ]);
  return (
    <div className="space-y-6">
      <header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Devis</h1><p className="text-sm text-muted">Construire, chiffrer, envoyer et suivre les propositions.</p></header>
      <QuotesManager initialQuotes={quotes || []} customers={customers || []} />
    </div>
  );
}
