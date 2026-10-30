"use client";

import { useEffect, useState } from "react";
import { formatDateTimeFr } from "@/lib/crm/money";
import {
  JOURNAL_ACTION_LABELS,
  JOURNAL_ENTITY_LABELS,
  journalDiffLines,
  type JournalAction,
  type JournalEntity,
} from "@/lib/crm/agency-journal";

type Row = {
  seq: number;
  occurred_at: string;
  actor: string;
  action: JournalAction;
  entity_type: JournalEntity;
  entity_id?: string | null;
  summary: string;
  diff?: unknown;
};

/**
 * Historique lisible : qui, quoi, quand, avant → après.
 * `dossier` / `client` / `user` : ce qui a été fait sur cette fiche. `acteur` : tout ce qu’un collègue a fait.
 * Les numéros de pièce et de carte sont masqués à l’écriture ; rien de complet ne passe ici.
 */
export function AgencyHistoryPanel({
  entity,
  entityId,
  title = "Historique",
}: {
  entity: "dossier" | "client" | "user" | "acteur";
  entityId: string;
  title?: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = entity === "acteur" ? new URLSearchParams({ agent: entityId }) : new URLSearchParams({ entity, id: entityId });
    void fetch(`/api/admin/journal?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Lecture impossible.");
        if (!cancelled) setRows(json.rows || []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [entity, entityId]);

  return (
    <section className="admin-af-card space-y-3 rounded-3xl p-5">
      <p className="font-display text-lg font-bold text-[var(--admin-navy)]">{title}</p>
      {error ? <p className="text-sm text-[var(--admin-red)]">{error}</p> : null}
      {rows == null && !error ? <p className="text-sm text-muted">Chargement…</p> : null}
      {rows && rows.length === 0 ? <p className="text-sm text-muted">Aucune action enregistrée.</p> : null}
      {rows && rows.length ? (
        <ol className="divide-y divide-[var(--border)]">
          {rows.map((row) => {
            const lines = journalDiffLines(row.diff);
            return (
              <li key={row.seq} className="grid gap-1 py-3 text-sm sm:grid-cols-[11rem_1fr] sm:gap-4">
                <div className="text-xs text-muted sm:text-sm">
                  <p className="font-semibold text-[var(--admin-navy)]">{row.actor}</p>
                  <p>{formatDateTimeFr(row.occurred_at)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[var(--admin-navy)]">
                    <span className="mr-2 inline-flex rounded-full bg-[var(--admin-sky)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--admin-navy)]">
                      {JOURNAL_ACTION_LABELS[row.action] || row.action}
                    </span>
                    {row.summary}
                    {entity === "acteur" ? (
                      <span className="ml-1 text-xs text-muted">· {JOURNAL_ENTITY_LABELS[row.entity_type] || row.entity_type}</span>
                    ) : null}
                  </p>
                  {lines.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {lines.map((line) => (
                        <li key={line.key} className="break-words">
                          <span className="font-semibold text-[var(--admin-navy)]">{line.label}</span>
                          {line.before != null ? (
                            <>
                              {" "}: <span className="line-through">{line.before}</span> → {line.after}
                            </>
                          ) : (
                            <> : {line.after}</>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
