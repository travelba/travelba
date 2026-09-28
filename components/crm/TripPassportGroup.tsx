import { FilePreviewGrid } from "@/components/crm/FilePreview";
import { PassportCoffre } from "@/components/crm/PassportCoffre";
import type { FilePreviewModel } from "@/lib/crm/preview-files";
import type { PassportVaultRow } from "@/lib/crm/passport-vault";

/** Coffre et passeports du séjour : un seul bloc. */
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
      <PassportCoffre embedded rows={rows} hrefFor={hrefFor} />
      {missingCount > 0 && missingHref ? (
        <a
          href={missingHref}
          className="block rounded-2xl bg-[var(--admin-peach)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Pièce manquante pour {missingCount} voyageur{missingCount > 1 ? "s" : ""}.
        </a>
      ) : null}
      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
          Passeports des voyageurs
        </p>
        {passports.length ? (
          <FilePreviewGrid files={passports} />
        ) : (
          <p className="text-sm text-muted">Aucun passeport n’est joint pour ces voyageurs.</p>
        )}
      </div>
    </section>
  );
}
