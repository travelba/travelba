import Link from "next/link";
import type { AdminTodoLine } from "@/lib/crm/admin-todo";
import type { MissingPassportCard } from "@/lib/crm/admin-now";

/** Ce qui attend l’agence, avant le reste du tableau de bord. */
export function AgencyAttention({
  lines,
  documents,
}: {
  lines: AdminTodoLine[];
  documents: MissingPassportCard[];
}) {
  return (
    <section aria-labelledby="attention-titre">
      <h2 id="attention-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Ce qui vous attend
      </h2>
      {lines.length ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {lines.map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="flex min-h-24 flex-col justify-between rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-4 py-3 text-[var(--admin-navy)] transition hover:border-[var(--admin-gold)]"
              >
                <span className="font-display text-3xl font-bold tabular-nums text-[var(--admin-gold)]">{row.count}</span>
                <span className="text-sm font-semibold leading-snug">{row.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Rien ne vous attend. Bonne journée.</p>
      )}
      {documents.length ? (
        <ul className="mt-3 space-y-1">
          {documents.map((row) => (
            <li key={row.bookingId}>
              <Link href={`/admin/reservations/${row.bookingId}?onglet=client`} className="text-sm font-semibold text-[var(--admin-navy)] underline">
                Passeport · {row.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
