import Link from "next/link";
import { NewBookingForm } from "@/components/admin/NewBookingForm";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";
import { requireStaffPage } from "@/lib/crm/auth";
import { aiGatewayConfigured } from "@/lib/crm/ingest-types";

/** Cible unique du bouton « Nouveau dossier » : dropzone PDF / photos, « Saisir à la main » dedans (D-11). */
export const metadata = { title: "Nouveau dossier" };

export default async function NewBookingPage() {
  await requireStaffPage();

  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle
        title="Nouveau dossier"
        subtitle="Déposez les confirmations (PDF, photos) : les cartes se remplissent, vous relisez, puis Créer le dossier le crée en préparation. Sans document, Saisir à la main ouvre une carte vide. Le client ne voit rien avant Montrer au client."
        actions={
          <Link href="/admin/reservations" className="text-sm font-semibold text-[var(--admin-navy)] underline-offset-2 hover:underline">
            ← Dossiers
          </Link>
        }
      />
      <div className="mt-6">
        <NewBookingForm aiConfigured={aiGatewayConfigured()} />
      </div>
    </div>
  );
}
