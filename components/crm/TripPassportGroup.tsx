import { FilePreviewGrid } from "@/components/crm/FilePreview";
import { PassportCoffre } from "@/components/crm/PassportCoffre";
import type { FilePreviewModel } from "@/lib/crm/preview-files";
import type { PassportVaultRow } from "@/lib/crm/passport-vault";

/**
 * Passeports du séjour : un seul statut par voyageur (à jour, expire bientôt, manquant),
 * puis les fichiers joints s’il y en a. Pas de seconde phrase qui contredirait le statut.
 */
export function TripPassportGroup({
  rows,
  hrefFor,
  passports,
  missingHref = null,
  missingCount = 0,
  embedded = false,
}: {
  rows: PassportVaultRow[];
  hrefFor: (row: PassportVaultRow) => string | null;
  passports: FilePreviewModel[];
  missingHref?: string | null;
  missingCount?: number;
  embedded?: boolean;
}) {
  if (!rows.length && !passports.length && missingCount < 1) return null;
  return (
    <section
      className={
        embedded
          ? "space-y-3"
          : "aura-card space-y-3 rounded-[1.35rem] bg-white p-4"
      }
    >
      {rows.length ? (
        <PassportCoffre embedded title="Passeports des voyageurs" rows={rows} hrefFor={hrefFor} />
      ) : (
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5A880]">
          Passeports des voyageurs
        </p>
      )}
      {missingCount > 0 && missingHref ? (
        <a
          href={missingHref}
          className="block rounded-2xl bg-[var(--admin-peach)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Pièce manquante pour {missingCount} voyageur{missingCount > 1 ? "s" : ""}.
        </a>
      ) : null}
      {passports.length ? <FilePreviewGrid files={passports} /> : null}
    </section>
  );
}
