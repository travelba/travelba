"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import type { ClientActivityGroup } from "@/lib/crm/client-activity-feed";

/** Connexions des clients à leur espace, sur le tableau de bord agence. */
export function ClientActivity({
  groups,
  initialOpen = [],
}: {
  groups: ClientActivityGroup[];
  initialOpen?: string[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialOpen.map((id) => [id, true]))
  );
  const todayCount = groups[0]?.label === "Aujourd’hui" ? groups[0].rows.length : 0;

  return (
    <section aria-labelledby="activite-clients-titre">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="activite-clients-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
          Activité clients
        </h2>
        {todayCount ? (
          <p className="text-sm font-semibold text-[var(--admin-gold-dark)]">
            {todayCount === 1 ? "1 aujourd’hui" : `${todayCount} aujourd’hui`}
          </p>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">Connexions à l’espace client, sur sept jours.</p>

      {groups.length ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
          {groups.map((group) => (
            <section
              key={group.day}
              aria-labelledby={`activite-jour-${group.day}`}
              className="border-t border-[#e5e0d4] first:border-t-0"
            >
              <h3
                id={`activite-jour-${group.day}`}
                className="bg-[#f8f4ed] px-4 py-3 font-display text-sm font-bold text-[var(--admin-navy)]"
              >
                <span className="text-[var(--admin-gold-dark)]">{group.label}</span>
              </h3>
              <ul className="divide-y divide-[#efeae0]">
                {group.rows.map((row) => {
                  const isOpen = Boolean(open[row.id]);
                  const panelId = `activite-detail-${row.id}`;
                  return (
                    <li key={row.id}>
                      <div className="px-4 pt-4">
                        <Link
                          href={row.href}
                          className="block break-words font-display text-base font-bold leading-snug text-[var(--admin-navy)] hover:text-[var(--admin-lagoon)]"
                        >
                          {row.name}
                        </Link>
                        <button
                          type="button"
                          className="mt-1 flex min-h-11 w-full items-center gap-3 text-left"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => setOpen((current) => ({ ...current, [row.id]: !current[row.id] }))}
                        >
                          <span className="min-w-0 flex-1 break-words text-sm leading-snug text-muted">{row.meta}</span>
                          <span className="sr-only">{isOpen ? "Masquer le détail" : "Afficher le détail"}</span>
                          <Icon
                            name="expand_more"
                            className={`h-5 w-5 shrink-0 text-[var(--admin-navy)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                      {row.dossiers.length ? (
                        <ul className="flex flex-wrap gap-1.5 px-4 pb-4">
                          {row.dossiers.map((dossier) => (
                            <li key={dossier.id} className="max-w-full">
                              <Link
                                href={dossier.href}
                                className="inline-block max-w-full break-words rounded-full bg-[#f8f4ed] px-2.5 py-1 text-xs font-semibold leading-snug text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]/40"
                              >
                                {dossier.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="h-3" />
                      )}
                      {isOpen ? (
                        <div id={panelId} className="border-t border-[#efeae0] bg-[#fbfaf7] px-4 py-4">
                          {row.events.length ? (
                            <ol className="ml-1 space-y-4 border-l border-[var(--admin-gold)]/70 pl-4">
                              {row.events.map((event) => (
                                <li key={event.id}>
                                  <p className="text-xs font-semibold tabular-nums text-[var(--admin-gold-dark)]">{event.time}</p>
                                  <p className="mt-0.5 break-words text-sm font-medium leading-snug text-[var(--admin-navy)]">
                                    {event.text}
                                  </p>
                                  {event.detail ? (
                                    <p className="mt-0.5 break-words text-sm leading-snug text-muted">{event.detail}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-sm text-muted">Aucun geste enregistré pour cette journée.</p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-[var(--admin-gold)]/30 bg-[#f8f4ed] px-5 py-8">
          <p className="font-display text-base font-bold text-[var(--admin-navy)]">Aucune connexion</p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
            Aucun client ne s’est connecté à son espace ces sept derniers jours.
          </p>
        </div>
      )}
    </section>
  );
}
