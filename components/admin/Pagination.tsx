import Link from "next/link";
import { ADMIN_PAGE_SIZE, pageCount, paginationSummary } from "@/lib/crm/admin-list";

/** Pagination serveur des listes : « 1-50 sur 312 », Précédent / Suivant en liens `?page=`. */
export function Pagination({
  page,
  total,
  hrefFor,
  pageSize = ADMIN_PAGE_SIZE,
  label = "lignes",
}: {
  page: number;
  total: number;
  hrefFor: (page: number) => string;
  pageSize?: number;
  label?: string;
}) {
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  const summary = paginationSummary(current, total, pageSize);
  const linkClass =
    "admin-tap inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]";
  const disabledClass =
    "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--border)] bg-white/60 px-4 text-sm font-semibold text-muted";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        {summary} {label}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          {current > 1 ? (
            <Link href={hrefFor(current - 1)} rel="prev" className={linkClass}>
              ← Précédent
            </Link>
          ) : (
            <span aria-disabled className={disabledClass}>
              ← Précédent
            </span>
          )}
          <span aria-current="page" className="px-2 text-muted">
            Page {current} sur {pages}
          </span>
          {current < pages ? (
            <Link href={hrefFor(current + 1)} rel="next" className={linkClass}>
              Suivant →
            </Link>
          ) : (
            <span aria-disabled className={disabledClass}>
              Suivant →
            </span>
          )}
        </div>
      ) : null}
    </nav>
  );
}
