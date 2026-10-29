import Link from "next/link";
import { ARGENT_TAB_IDS, ARGENT_TAB_LABELS, argentHref, type ArgentTab } from "@/lib/crm/argent-tabs";

/** Onglets Argent : liens (pas d’état), la pastille porte le nombre de gestes en attente. */
export function ArgentTabs({ active, counts }: { active: ArgentTab; counts: Partial<Record<ArgentTab, number>> }) {
  return (
    <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-[var(--border)]" aria-label="Onglets Argent">
      {ARGENT_TAB_IDS.map((tab) => {
        const selected = tab === active;
        const count = counts[tab] || 0;
        return (
          <Link
            key={tab}
            href={argentHref(tab)}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-2 text-sm transition ${
              selected
                ? "border-[var(--admin-gold)] font-bold text-[var(--admin-navy)]"
                : "border-transparent font-medium text-muted hover:text-[var(--admin-navy)]"
            }`}
          >
            {ARGENT_TAB_LABELS[tab]}
            {count > 0 ? (
              <span className="rounded-full bg-[var(--admin-gold)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[var(--admin-navy)]">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
