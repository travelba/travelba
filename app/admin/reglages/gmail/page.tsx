import { GmailDiagnostic } from "@/components/admin/GmailDiagnostic";

/** Diagnostic de la boîte Gmail (auth, libellés, suivi), sorti de la file des e-mails (D-43). */
export const metadata = { title: "Diagnostic Gmail" };

export default function GmailReglagesPage() {
  return (
    <div>
      <h2 className="mt-6 font-display text-lg font-bold text-[var(--admin-navy)]">Diagnostic Gmail</h2>
      <p className="mt-1 text-sm text-muted">
        Vérifie l’accès au compte Gmail de l’agence, sans effet de bord. Les e-mails à traiter restent dans la Boîte de
        réception.
      </p>
      <div className="mt-6">
        <GmailDiagnostic />
      </div>
    </div>
  );
}
