"use client";

import { useEffect, useState } from "react";
import { formatDateTimeFr } from "@/lib/crm/money";
import { JOURNAL_ACTION_LABELS, JOURNAL_ENTITY_LABELS, type JournalAction, type JournalEntity } from "@/lib/crm/agency-journal";

type Row = {
  seq: number;
  occurred_at: string;
  actor: string;
  action: JournalAction;
  entity_type: JournalEntity;
  summary: string;
  diff: unknown;
};

export function AgencyHistoryPanel({
  entity,
  entityId,
  title = "Historique",
}: {
  entity: "dossier" | "client" | "user";
  entityId: string;
  title?: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ entity, id: entityId });
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
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <li key={row.seq} className="py-3 text-sm">
              <p className="font-semibold text-[var(--admin-navy)]">
                {JOURNAL_ACTION_LABELS[row.action] || row.action} · {row.actor}
              </p>
              <p className="text-muted">
                {formatDateTimeFr(row.occurred_at)} · {JOURNAL_ENTITY_LABELS[row.entity_type] || row.entity_type}
              </p>
              <p className="mt-1 text-[var(--admin-navy)]">{row.summary}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
