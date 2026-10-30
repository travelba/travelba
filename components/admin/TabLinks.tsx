import Link from "next/link";

export type TabLink = { id: string; href: string; label: string; count?: number };

/** Onglets d’une page à onglets : des liens (pas d’état), la pastille porte le nombre de gestes en attente. */
export function TabLinks({ tabs, active, ariaLabel }: { tabs: TabLink[]; active: string; ariaLabel: string }) {
  return (
    <nav className="mt-6 flex gap-6 overflow-x-auto border-b border-[var(--border)]" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        const count = tab.count || 0;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-2 text-sm transition ${
              selected
                ? "border-[var(--admin-gold)] font-bold text-[var(--admin-navy)]"
                : "border-transparent font-medium text-muted hover:text-[var(--admin-navy)]"
            }`}
          >
            {tab.label}
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

/** Pilules d’une vue secondaire (filtre dans l’onglet). */
export function ViewPills({ views, active, ariaLabel }: { views: TabLink[]; active: string; ariaLabel: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {views.map((view) => {
        const selected = view.id === active;
        return (
          <Link
            key={view.id}
            href={view.href}
            aria-current={selected ? "page" : undefined}
            className={`admin-tap inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
              selected ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white" : "border-[var(--border)] bg-white text-[var(--admin-navy)]"
            }`}
          >
            {view.label}
            {view.count ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  selected ? "bg-[var(--admin-gold)] text-[var(--admin-navy)]" : "bg-[#f8f4ed] text-[#9e7e51]"
                }`}
              >
                {view.count > 99 ? "99+" : view.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
