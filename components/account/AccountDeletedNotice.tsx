import { ACCOUNT_DELETED_TITLE } from "@/lib/crm/account-deletion-copy";
import { siteConfig } from "@/lib/site";

/** Écran après suppression. Visible avant la déconnexion, et sur la page publique qui suit. */
export function AccountDeletedNotice() {
  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl font-bold text-[var(--admin-navy)]">{ACCOUNT_DELETED_TITLE}</h1>
      <p className="text-sm leading-relaxed text-[#44474c]">
        La connexion n’est plus possible. Les dossiers, les factures et les règlements que la loi impose de conserver
        restent à l’agence.
      </p>
      <p className="text-sm leading-relaxed text-[#44474c]">
        Une question :{" "}
        <a className="font-semibold text-[var(--admin-navy)] underline" href={`mailto:${siteConfig.contactEmail}`}>
          {siteConfig.contactEmail}
        </a>
      </p>
    </div>
  );
}
