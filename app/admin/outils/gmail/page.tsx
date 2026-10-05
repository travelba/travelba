import { GmailDiagnostic } from "@/components/admin/GmailDiagnostic";

/** Diagnostic de la boîte Gmail (auth, libellés, suivi), sorti de la file des e-mails (D-43). */
export default function GmailOutilsPage() {
  return (
    <div className="mt-6">
      <p className="mb-4 text-sm text-muted">
        Vérifie l’accès au compte Gmail de l’agence sans effet de bord. La file des mails à rattacher reste dans
        E-mails.
      </p>
      <GmailDiagnostic />
    </div>
  );
}
