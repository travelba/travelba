import { ServiceDesk } from "@/components/admin/ServiceDesk";
import { EmptyState, PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { loadAgencyServiceDesk } from "@/lib/crm/service-desk-load";

export const metadata = { title: "Services à confirmer" };

export default async function AdminServicesPage() {
  const { supabase } = await requireStaffPage();
  const lines = await loadAgencyServiceDesk(supabase);

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace agence</PageEyebrow>
        <PageTitle title="Services à confirmer" subtitle="Chauffeur, accueil et enregistrement encore ouverts." />
      </div>
      {lines.length ? (
        <ServiceDesk lines={lines} />
      ) : (
        <EmptyState title="Aucun service à confirmer" description="Les demandes encore ouvertes apparaîtront ici." />
      )}
    </div>
  );
}
