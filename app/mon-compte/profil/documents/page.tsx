import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { DocumentsManager } from "@/components/account/DocumentsManager";
import type { CrmCompanion, CrmTravelDocument } from "@/lib/crm/types";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");
  const [{ data: documents }, { data: companions }] = await Promise.all([
    supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
    supabase.from("crm_travel_companions").select("*").eq("customer_id", customer.id),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Coffre</p>
        <h2 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">Pièces</h2>
      </div>
      <DocumentsManager
        documents={(documents || []) as CrmTravelDocument[]}
        companions={(companions || []) as CrmCompanion[]}
        holder={{ first_name: customer.first_name, last_name: customer.last_name }}
      />
    </div>
  );
}
