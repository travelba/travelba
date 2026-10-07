"use client";

import { useMemo, useState } from "react";
import type { ClientMailGroup } from "@/lib/crm/client-mail-catalog";

const FILTERS = [
  { id: "tous", label: "Tous" },
  { id: "acces", label: "Accès" },
  { id: "esta", label: "ESTA" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function MailFrame({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={html}
      className="h-80 w-full border-0 bg-[#FAF9F6] sm:h-[22rem]"
    />
  );
}

export function ClientMailCatalog({ groups }: { groups: ClientMailGroup[] }) {
  const [filter, setFilter] = useState<FilterId>("tous");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const group of groups) {
      map.set(group.id, group.mails.length);
      total += group.mails.length;
    }
    map.set("tous", total);
    return map;
  }, [groups]);

  const needle = query.trim().toLocaleLowerCase("fr");
  const visible = groups
    .filter((group) => filter === "tous" || group.id === filter)
    .map((group) => ({
      ...group,
      mails: group.mails.filter((mail) => {
        if (!needle) return true;
        return [mail.title, mail.when, mail.subject].join("\n").toLocaleLowerCase("fr").includes(needle);
      }),
    }))
    .filter((group) => group.mails.length > 0);

  return (
    <div className="mt-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        Chaque carte montre l’e-mail tel que le client le reçoit. Les prénoms, références et dates sont
        l’exemple Camille, séjour TB-2026-0028.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Filtrer les e-mails">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(item.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "bg-[var(--admin-navy)] text-[var(--admin-gold)]"
                    : "bg-[var(--surface-2)] text-[var(--admin-navy)] hover:bg-[var(--admin-gold-soft)]"
                }`}
              >
                {item.label}
                <span className="ml-1.5 tabular-nums opacity-70">{counts.get(item.id) ?? 0}</span>
              </button>
            );
          })}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          aria-label="Rechercher un e-mail"
          placeholder="Rechercher un objet…"
          className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--admin-navy)] outline-none focus:ring-2 focus:ring-[var(--admin-gold)]/40 sm:w-64"
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--admin-navy)]">
          Aucun e-mail ne correspond.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {visible.map((group) => (
            <section key={group.id} aria-labelledby={`mails-${group.id}`}>
              <h2
                id={`mails-${group.id}`}
                className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]"
              >
                {group.title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{group.intro}</p>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.mails.map((mail) => (
                  <article key={mail.id} className="admin-af-card flex min-w-0 flex-col overflow-hidden rounded-2xl">
                    <header className="px-4 py-3.5">
                      <h3 className="font-display text-lg font-bold text-[var(--admin-navy)]">{mail.title}</h3>
                      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-muted">{mail.when}</p>
                      <p className="mt-3 line-clamp-2 text-sm text-[var(--admin-navy)]">
                        <span className="text-muted">Objet · </span>
                        {mail.subject}
                      </p>
                    </header>
                    <div className="mt-auto border-t border-[var(--border)] bg-[#FAF9F6]">
                      <MailFrame html={mail.html} title={`Aperçu : ${mail.title}`} />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
