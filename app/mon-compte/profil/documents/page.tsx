import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { DocumentsManager } from "@/components/account/DocumentsManager";
import { ProfileSubnav } from "@/components/account/ProfileSubnav";
import { ConciergeBanner, PageEyebrow, PageTitle } from "@/components/crm/ui";
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
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace privilège voyageur</PageEyebrow>
        <PageTitle
          title="Documents de voyage"
          subtitle="Passeports, visas et pièces d’identité associés à votre compte."
        />
        <ProfileSubnav />
      </div>
      <DocumentsManager
        documents={(documents || []) as CrmTravelDocument[]}
        companions={(companions || []) as CrmCompanion[]}
      />
      <ConciergeBanner />
    </div>
  );
}
