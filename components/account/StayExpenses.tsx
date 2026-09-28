import type { ClientExpenseLine } from "@/lib/crm/ledger-display";

/** Dépenses du séjour, lecture seule. Hors itinéraire. */
export function StayExpenses({ lines }: { lines: ClientExpenseLine[] }) {
  if (!lines.length) return null;
  return (
    <section className="aura-card space-y-3 rounded-[1.35rem] bg-white p-4" aria-label="Dépenses">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">Dépenses</p>
        <p className="mt-1 text-sm text-muted">En plus du montant du séjour.</p>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="font-medium text-[var(--admin-navy)]">{line.title}</span>
            {line.amountLabel ? (
              <span className="shrink-0 font-semibold text-[var(--admin-navy)]">{line.amountLabel}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
