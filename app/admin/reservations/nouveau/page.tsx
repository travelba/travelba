import Link from "next/link";
import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";

/** Cible unique du bouton « Nouveau dossier » : dropzone PDF / photos, puis saisie manuelle (D-11). */
export default async function NewBookingPage() {
  const { supabase } = await requireStaffPage();
  const { data: companies } = await supabase
    .from("crm_billing_companies")
    .select("id, customer_id, company_name, sort_order")
    .order("sort_order");

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Nouveau dossier"
        subtitle="Déposez les confirmations (PDF, photos) : les cartes se remplissent, vous relisez, puis Enregistrer crée le dossier en préparation. Le client ne voit rien avant Montrer au client."
        actions={
          <Link href="/admin/reservations" className="text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
            ← Réservations
          </Link>
        }
      />
      <div className="mt-6">
        <NewBookingForm
          companies={(companies || []) as {
            id: string;
            customer_id: string;
            company_name: string | null;
            sort_order: number;
          }[]}
          aiConfigured={aiGatewayConfigured()}
        />
      </div>
    </div>
  );
}
