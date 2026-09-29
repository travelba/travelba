"use client";

import { useMemo, useState } from "react";
import type { WhatsappBubble, WhatsappCatalogGroup } from "@/lib/crm/whatsapp-catalog";

const FILTERS = [
  { id: "partent", label: "Qui partent" },
  { id: "acces", label: "Accès" },
  { id: "sejour", label: "Séjour" },
  { id: "pieces", label: "Pièces" },
  { id: "depart", label: "Départ" },
  { id: "partage", label: "Partage" },
  { id: "reponses", label: "Réponses" },
  { id: "attente", label: "Pas encore envoyés" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function Bubble({ bubble }: { bubble: WhatsappBubble }) {
  return (
    <div className="flex items-end gap-2.5">
      <span className="mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-gold)] text-[10px] font-bold tracking-wide text-[var(--admin-navy)]">
        TBA
      </span>
      <div className="min-w-0 flex-1">
        {bubble.photo ? (
          <div className="mb-1.5 flex h-16 items-end rounded-xl bg-[#16324f] px-3 py-2">
            <span className="font-label text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
              Photo du séjour
            </span>
          </div>
        ) : null}
        <div className="rounded-2xl rounded-bl-md bg-[#f4efe4] px-3.5 py-3 text-[14px] leading-relaxed text-[var(--admin-navy)] shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
          <p className="whitespace-pre-wrap">{bubble.body}</p>
          {bubble.button ? (
            <p className="mt-2.5 border-t border-[#0B192C]/10 pt-2 text-center text-sm font-semibold text-[#1d4e89]">
              {bubble.button}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function WhatsappCatalog({ groups }: { groups: WhatsappCatalogGroup[] }) {
  const [filter, setFilter] = useState<FilterId>("partent");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    let leaving = 0;
    for (const group of groups) {
      map.set(group.id, group.messages.length);
      leaving += group.messages.filter((message) => message.wired).length;
    }
    map.set("partent", leaving);
    return map;
  }, [groups]);

  const needle = query.trim().toLocaleLowerCase("fr");
  const visible = groups
    .filter((group) => (filter === "partent" ? group.id !== "attente" : group.id === filter))
    .map((group) => ({
      ...group,
      messages: group.messages.filter((message) => {
        if (!needle) return true;
        const blob = [message.title, message.when, message.bubble.body, message.fallback?.body || ""]
          .join("\n")
          .toLocaleLowerCase("fr");
        return blob.includes(needle);
      }),
    }))
    .filter((group) => group.messages.length > 0);

  return (
    <div className="mt-6">
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        Chaque carte montre le texte tel que le client le reçoit. Un modèle part si le téléphone est
        valide, si le client a accepté WhatsApp, et si Meta a approuvé le texte. Une réponse part
        quand le client vient d’écrire. Les prénoms, heures et montants des réponses sont un exemple
        fictif à Avoriaz.
      </p>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Filtrer les messages">
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
          aria-label="Rechercher un message"
          placeholder="Rechercher un texte…"
          className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm text-[var(--admin-navy)] outline-none focus:ring-2 focus:ring-[var(--admin-gold)]/40 sm:w-64"
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--admin-navy)]">
          Aucun message ne correspond.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {visible.map((group) => (
            <section key={group.id} aria-labelledby={`whatsapp-${group.id}`}>
              <h2
                id={`whatsapp-${group.id}`}
                className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]"
              >
                {group.title}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{group.intro}</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {group.messages.map((message) => (
                  <article
                    key={message.id}
                    className="admin-af-card flex flex-col overflow-hidden rounded-2xl"
                  >
                    <header className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[var(--admin-navy)] px-2 py-0.5 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
                          {message.kind === "modele" ? "Modèle" : "Réponse"}
                        </span>
                        {message.wired ? null : (
                          <span className="rounded-full bg-[var(--admin-peach)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--admin-navy)]">
                            Pas encore envoyé
                          </span>
                        )}
                        {message.bubble.modelName ? (
                          <span className="text-[11px] text-muted">{message.bubble.modelName}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 font-display text-lg font-bold text-[var(--admin-navy)]">
                        {message.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{message.when}</p>
                    </header>
                    <div className="mt-auto bg-[var(--admin-navy)] px-4 py-4">
                      <Bubble bubble={message.bubble} />
                    </div>
                    {message.fallback ? (
                      <details className="border-t border-[var(--border)] px-4 py-3">
                        <summary className="cursor-pointer text-sm font-semibold text-[var(--admin-navy)]">
                          Texte de repli
                        </summary>
                        <p className="mt-2 text-xs leading-relaxed text-muted">
                          {message.fallback.label}
                          {message.fallback.modelName ? ` · ${message.fallback.modelName}` : ""}
                        </p>
                        <div className="mt-3 rounded-xl bg-[var(--admin-navy)] px-3 py-3">
                          <Bubble bubble={message.fallback} />
                        </div>
                      </details>
                    ) : null}
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
