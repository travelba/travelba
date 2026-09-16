import { requireStaffPage } from "@/lib/crm/auth";
import { MtripGuideCreateForm } from "@/components/admin/MtripGuideCreateForm";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

export default async function ImportsPage() {
  await requireStaffPage("mtrip");
  return (
    <div className="space-y-6">
      <header>
        <PageEyebrow>Voyages mTrip</PageEyebrow>
        <PageTitle
          title="Imports contrôlés"
          subtitle="Importez les passeports, vérifiez chaque identité, puis ajoutez les confirmations PDF. Un agent contrôle les voyageurs, prestations, dates et coordonnées avant publication."
        />
      </header>
      <MtripGuideCreateForm />
    </div>
  );
}
