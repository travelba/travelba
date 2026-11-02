"use client";

import { useEffect, useMemo, useState } from "react";
import { JournalAvatar, JournalTimeline, type JournalFeedItem } from "@/components/admin/journal/JournalTimeline";
import {
  familiesPresent,
  filterJournalRows,
  JOURNAL_FAMILY_LABELS,
  journalAuthor,
  journalIsSensitive,
  type JournalFamily,
} from "@/lib/crm/agency-journal-kinds";

const chip = (active: boolean) =>
  `inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
    active
      ? "border-[var(--admin-navy)] bg-[var(--admin-navy)] text-white"
      : "border-[var(--border)] bg-white text-[var(--admin-navy)] hover:border-[var(--admin-gold)]"
  }`;

/**
 * Historique d’un dossier : chaque geste (carnet, option, carte, paiement, e-mail, responsable), qui l’a fait
 * et quand, en frise. Filtres par type d’action et par collègue. Un clic ouvre l’avant/après.
 */
export function DossierHistorique({ bookingId }: { bookingId: string }) {
  const [rows, setRows] = useState<JournalFeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ entity: "dossier", id: bookingId });
    void fetch(`/api/admin/journal?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lecture impossible.");
        if (!cancelled) setRows((json.rows || []) as JournalFeedItem[]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  return <DossierHistoriqueView rows={rows} error={error} />;
}

/** La frise et ses filtres, à partir des lignes déjà lues (`null` : chargement). */
export function DossierHistoriqueView({ rows, error = null }: { rows: JournalFeedItem[] | null; error?: string | null }) {
  const [family, setFamily] = useState<JournalFamily | "tous">("tous");
  const [agent, setAgent] = useState<string>("");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);

  const families = useMemo(() => familiesPresent(rows || []), [rows]);
  const agents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows || []) {
      const key = row.staff_id || row.actor_label || "agence";
      if (!seen.has(key)) seen.set(key, journalAuthor(row));
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [rows]);
  const sensitiveCount = useMemo(() => (rows || []).filter((row) => journalIsSensitive(row)).length, [rows]);

  const shown = useMemo(() => {
    const base = filterJournalRows(rows || [], { family, sensitiveOnly });
    if (!agent) return base;
    return base.filter((row) => (row.staff_id || row.actor_label || "agence") === agent);
  }, [rows, family, agent, sensitiveOnly]);

  return (
    <section className="admin-af-card space-y-4 rounded-3xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-display text-lg font-bold text-[var(--admin-navy)]">Historique</p>
        {rows ? (
          <p className="text-xs text-muted">
            {rows.length} action{rows.length > 1 ? "s" : ""}
            {sensitiveCount ? ` · ${sensitiveCount} carte${sensitiveCount > 1 ? "s" : ""} ou paiement${sensitiveCount > 1 ? "s" : ""}` : ""}
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {rows == null && !error ? <p className="text-sm text-muted">Chargement…</p> : null}
      {rows && rows.length ? (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Type d’action">
            <button type="button" className={chip(family === "tous")} onClick={() => setFamily("tous")}>
              Tout
            </button>
            {families.map((item) => (
              <button key={item} type="button" className={chip(family === item)} onClick={() => setFamily(item)}>
                {JOURNAL_FAMILY_LABELS[item]}
              </button>
            ))}
            {sensitiveCount ? (
              <button
                type="button"
                className={chip(sensitiveOnly)}
                onClick={() => setSensitiveOnly((value) => !value)}
                aria-pressed={sensitiveOnly}
              >
                Cartes et paiements seulement
              </button>
            ) : null}
          </div>
          {agents.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Collègue">
              <button type="button" className={chip(agent === "")} onClick={() => setAgent("")}>
                Tous les collègues
              </button>
              {agents.map((item) => (
                <button key={item.id} type="button" className={chip(agent === item.id)} onClick={() => setAgent(item.id)}>
                  <JournalAvatar name={item.name} colorKey={item.id} size={18} />
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
          <JournalTimeline items={shown} emptyText="Aucune action pour ces filtres." />
        </>
      ) : null}
      {rows && rows.length === 0 ? <p className="text-sm text-muted">Aucune action enregistrée sur ce dossier.</p> : null}
    </section>
  );
}
