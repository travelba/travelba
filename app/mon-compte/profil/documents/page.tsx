import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
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
    <div className="space-y-4 pb-6">
      <ProfileSubnav />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          L’agence
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold text-[var(--admin-navy-deep)]">
          Pièces d’identité
        </h1>
        <p className="mt-1 text-sm text-muted">
          Plusieurs passeports possibles. Cochez celui du séjour depuis chaque réservation.
        </p>
      </div>
      <DocumentsManager
        documents={(documents || []) as CrmTravelDocument[]}
        companions={(companions || []) as CrmCompanion[]}
      />
    </div>
  );
}
