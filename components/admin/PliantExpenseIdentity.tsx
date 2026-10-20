import { pliantExpenseCaption, type PliantDossierFace } from "@/lib/crm/pliant-tx";

/**
 * Dépense Pliant : dossier et client d’abord, le membre Pliant de l’agence en dernier.
 * Sans dossier, l’ordre reste porteur · type · catégorie.
 */
export function PliantExpenseIdentity({
  dossier,
  holderName,
  type,
  category,
  comment,
  href,
}: {
  dossier?: PliantDossierFace | null;
  holderName?: string | null;
  type?: string | null;
  category?: string | null;
  comment?: string | null;
  href?: string | null;
}) {
  const caption = pliantExpenseCaption({ holderName, type, category, comment, dossier });
  return (
    <div className="min-w-0">
      {caption.stay ? (
        <p className="break-words text-sm font-semibold leading-snug text-[var(--admin-navy)]">
          {href ? (
            <a href={href} className="underline">
              {caption.stay}
            </a>
          ) : (
            caption.stay
          )}
        </p>
      ) : null}
      {caption.who ? <p className="break-words text-sm leading-snug text-[var(--admin-navy)]">{caption.who}</p> : null}
      {caption.detail ? <p className="mt-0.5 break-words text-xs leading-5 text-muted">{caption.detail}</p> : null}
    </div>
  );
}
