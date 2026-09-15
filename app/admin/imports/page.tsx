import { requireStaffPage } from "@/lib/crm/auth";
import { MtripGuideCreateForm } from "@/components/admin/MtripGuideCreateForm";

export default async function ImportsPage() {
  await requireStaffPage("mtrip");
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold text-[var(--admin-navy)]">Imports contrôlés</h1>
        <p className="max-w-3xl text-sm text-muted">Importez d’abord les passeports, vérifiez chaque identité, puis ajoutez les confirmations PDF. L’extraction ne publie jamais automatiquement : un agent contrôle les voyageurs, prestations, dates et coordonnées avant création du carnet mTrip.</p>
      </header>
      <MtripGuideCreateForm />
    </div>
  );
}
