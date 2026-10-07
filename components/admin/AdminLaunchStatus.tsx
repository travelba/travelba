import Link from "next/link";
import type { LaunchItem } from "@/lib/crm/launch-status";
import { visibleLaunchItems } from "@/lib/crm/launch-status";

/** Bandeau discret : seulement s’il reste un geste obligatoire. */
export function AdminLaunchStatus({ items }: { items: LaunchItem[] }) {
  const visible = visibleLaunchItems(items);
  if (!visible.length) return null;

  return (
    <section className="rounded-2xl border border-[var(--admin-gold)]/40 bg-[#f8f4ed] px-5 py-4">
      <h2 className="font-display text-base font-bold text-[var(--admin-navy)]">Mise en service</h2>
      <p className="mt-1 text-sm text-muted">Ces gestes restent à l’agence. Aucun séjour fictif.</p>
      <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-2">
        {visible.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="text-sm font-semibold text-[var(--admin-navy)] underline">
              {item.title}
              {item.optional ? " (optionnel)" : ""}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
