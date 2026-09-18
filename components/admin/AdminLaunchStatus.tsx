import Link from "next/link";
import type { LaunchItem } from "@/lib/crm/launch-status";
import { visibleLaunchItems } from "@/lib/crm/launch-status";

export function AdminLaunchStatus({ items }: { items: LaunchItem[] }) {
  const visible = visibleLaunchItems(items);
  if (!visible.length) return null;

  return (
    <section className="admin-af-card overflow-hidden rounded-2xl border border-[var(--admin-gold)]/40">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Mise en service</h2>
        <p className="mt-1 text-sm text-muted">
          Le site est en ligne. Ces gestes restent à l’agence — aucun séjour fictif.
        </p>
      </div>
      <ol className="divide-y divide-border">
        {visible.map((item) => (
          <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-[var(--admin-navy)]">
                {item.title}
                {item.optional ? (
                  <span className="ml-2 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    optionnel
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-muted">{item.description}</p>
            </div>
            <Link
              href={item.href}
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              {item.cta}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
