import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { DocumentsManager } from "@/components/account/DocumentsManager";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
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
    <div className="space-y-4 px-5 pb-10">
      <ProfileSubnav />
      <h1 className="text-xl font-semibold text-[var(--admin-navy-deep)]">Coffre-fort documents</h1>
      <p className="text-xs text-muted">
        Passeports, visas et pièces d’identité. Fichiers privés via l’API Travelba — aucun lien
        long n’est exposé.
      </p>
      <DocumentsManager
        documents={(documents || []) as CrmTravelDocument[]}
        companions={(companions || []) as CrmCompanion[]}
      />
    </div>
  );
}
