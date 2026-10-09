import { GmailDiagnostic } from "@/components/admin/GmailDiagnostic";
import { PageEyebrow, PageTitle } from "@/components/crm/ui";

/** Diagnostic de la boîte Gmail (auth, libellés, suivi), sorti de la file des e-mails (D-43). */
export const metadata = { title: "Diagnostic Gmail" };

export default function GmailOutilsPage() {
  return (
    <div>
      <PageEyebrow>Espace agence</PageEyebrow>
      <PageTitle title="Diagnostic Gmail" subtitle="Accès à la boîte agence, sans lire la file des e-mails." />
      <div className="mt-6">
      <p className="mb-4 text-sm text-muted">
        Vérifie l’accès au compte Gmail de l’agence sans effet de bord. La file des mails à rattacher reste dans
        E-mails.
      </p>
      <GmailDiagnostic />
      </div>
    </div>
  );
}
