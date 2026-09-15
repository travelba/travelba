import { requireStaffPage } from "@/lib/crm/auth";
import { CustomerMerge } from "@/components/admin/CustomerMerge";

export default async function CustomerMergePage() {
  const { supabase } = await requireStaffPage("admin");
  const { data } = await supabase.from("crm_customers").select("id,first_name,last_name,email").order("last_name");
  return <div className="space-y-6"><header><h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Fusionner des clients</h1><p className="text-sm text-muted">Consolider un doublon sans perdre ses dossiers ni son historique.</p></header><CustomerMerge customers={data || []} /></div>;
}
