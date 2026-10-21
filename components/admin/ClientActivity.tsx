"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/crm/icons";
import { addIsoDays } from "@/lib/crm/dates";
import type { ClientActivityGroup, ClientActivityRow } from "@/lib/crm/client-activity-feed";

/** Connexions et visites de l’espace client, sur le tableau de bord agence. */
export function ClientActivity({
  groups,
  today,
  initialOpen = [],
}: {
  groups: ClientActivityGroup[];
  /** Jour civil à Paris (`yyyy-mm-dd`). Seuls aujourd’hui et hier sont ouverts. */
  today: string;
  initialOpen?: string[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialOpen.map((id) => [id, true]))
  );
  const yesterday = addIsoDays(today, -1);
  const recent = groups.filter((group) => group.day === today || group.day === yesterday);
  const older = groups.filter((group) => group.day !== today && group.day !== yesterday);
  const todayCount = recent.find((group) => group.day === today)?.rows.length || 0;

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
      <p className="mt-1 text-sm text-muted">Connexions et visites de l’espace client, aujourd’hui et hier.</p>

      {recent.length ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
          <ActivityDays groups={recent} open={open} setOpen={setOpen} />
          {older.length ? <OlderActivity groups={older} open={open} setOpen={setOpen} /> : null}
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-2xl border border-[var(--admin-gold)]/30 bg-[#f8f4ed] px-5 py-8">
            <p className="font-display text-base font-bold text-[var(--admin-navy)]">Aucune connexion</p>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">Aucune connexion aujourd’hui ni hier.</p>
          </div>
          <OlderActivity groups={older} open={open} setOpen={setOpen} bare />
        </>
      )}
    </section>
  );
}

function OlderActivity({
  groups,
  open,
  setOpen,
  bare = false,
}: {
  groups: ClientActivityGroup[];
  open: Record<string, boolean>;
  setOpen: (value: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void;
  bare?: boolean;
}) {
  return (
    <details className={bare ? "group/more mt-3" : "group/more border-t border-[#e5e0d4]"}>
      <summary
        className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden [&::marker]:content-none ${
          bare
            ? "rounded-2xl border border-[#e5e0d4] bg-white px-4 py-3"
            : "bg-[#f8f4ed] px-4 py-3"
        }`}
      >
        <span className="group-open/more:hidden">Voir plus</span>
        <span className="hidden group-open/more:inline">Voir moins</span>
        <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open/more:rotate-180" />
      </summary>
      {groups.length ? (
        <div className={bare ? "mt-3 overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white" : ""}>
          <ActivityDays groups={groups} open={open} setOpen={setOpen} />
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted">Aucune connexion les jours précédents.</p>
      )}
    </details>
  );
}

function ActivityDays({
  groups,
  open,
  setOpen,
}: {
  groups: ClientActivityGroup[];
  open: Record<string, boolean>;
  setOpen: (value: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void;
}) {
  return (
    <>
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
            {group.rows.map((row) => (
              <ActivityRow key={row.id} row={row} open={Boolean(open[row.id])} setOpen={setOpen} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function ActivityRow({
  row,
  open,
  setOpen,
}: {
  row: ClientActivityRow;
  open: boolean;
  setOpen: (value: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void;
}) {
  const panelId = `activite-detail-${row.id}`;
  return (
    <li>
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
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => ({ ...current, [row.id]: !current[row.id] }))}
        >
          <span className="min-w-0 flex-1 break-words text-sm leading-snug text-muted">{row.meta}</span>
          <span className="sr-only">{open ? "Masquer le détail" : "Afficher le détail"}</span>
          <Icon
            name="expand_more"
            className={`h-5 w-5 shrink-0 text-[var(--admin-navy)] transition-transform ${open ? "rotate-180" : ""}`}
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
      {open ? (
        <div id={panelId} className="border-t border-[#efeae0] bg-[#fbfaf7] px-4 py-4">
          {row.events.length ? (
            <ol className="ml-1 space-y-4 border-l border-[var(--admin-gold)]/70 pl-4">
              {row.events.map((event) => (
                <li key={event.id}>
                  <p className="text-xs font-semibold tabular-nums text-[var(--admin-gold-dark)]">{event.time}</p>
                  <p className="mt-0.5 break-words text-sm font-medium leading-snug text-[var(--admin-navy)]">{event.text}</p>
                  {event.detail ? <p className="mt-0.5 break-words text-sm leading-snug text-muted">{event.detail}</p> : null}
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
}
