import Link from "next/link";
import { formatDateTimeFr } from "@/lib/crm/money";
import { ALERT_LABELS, type AlertKind } from "@/lib/crm/agency-access";
import {
  JOURNAL_ACTION_LABELS,
  JOURNAL_ACTIONS,
  JOURNAL_ENTITIES,
  JOURNAL_ENTITY_LABELS,
  type JournalAction,
  type JournalEntity,
} from "@/lib/crm/agency-journal";

export type JournalRow = {
  seq: number;
  occurred_at: string;
  actor: string;
  action: JournalAction;
  entity_type: JournalEntity;
  entity_id: string | null;
  summary: string;
};

export type JournalAlert = { id: string; created_at: string; summary: string; kind: string };

const field = "admin-af-input text-sm";

export function JournalDesk({
  rows,
  alerts,
  agents,
  filters,
  canExport,
  chainIntact,
}: {
  rows: JournalRow[];
  alerts: JournalAlert[];
  agents: { id: string; name: string }[];
  filters: { agent: string; from: string; to: string; entity: string; action: string };
  canExport: boolean;
  chainIntact: boolean | null;
}) {
  const query = new URLSearchParams();
  if (filters.agent) query.set("agent", filters.agent);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.entity) query.set("entity", filters.entity);
  if (filters.action) query.set("action", filters.action);
  const csv = new URLSearchParams(query);
  csv.set("format", "csv");

  return (
    <div className="mt-6 space-y-4">
      {alerts.length ? (
        <section className="rounded-2xl bg-[var(--admin-peach)] px-4 py-3 text-sm text-[var(--admin-navy)]">
          <p className="font-semibold">Alertes</p>
          <p className="text-xs text-muted">Pour information : rien n’a été bloqué.</p>
          <ul className="mt-2 space-y-1">
            {alerts.map((alert) => (
              <li key={alert.id}>
                {formatDateTimeFr(alert.created_at)} —{" "}
                <span className="font-semibold">{ALERT_LABELS[alert.kind as AlertKind] || alert.kind}</span> · {alert.summary}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form method="get" className="admin-af-card grid gap-3 rounded-2xl p-5 sm:grid-cols-2 lg:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Agent
          <select name="agent" defaultValue={filters.agent} className={field}>
            <option value="">Tous</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Du
          <input type="date" name="from" defaultValue={filters.from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Au
          <input type="date" name="to" defaultValue={filters.to} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Entité
          <select name="entity" defaultValue={filters.entity} className={field}>
            <option value="">Toutes</option>
            {JOURNAL_ENTITIES.map((entity) => (
              <option key={entity} value={entity}>
                {JOURNAL_ENTITY_LABELS[entity]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Action
          <select name="action" defaultValue={filters.action} className={field}>
            <option value="">Toutes</option>
            {JOURNAL_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {JOURNAL_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="admin-af-btn rounded-full px-4 py-2 text-sm">
            Filtrer
          </button>
          {canExport ? (
            <Link href={`/api/admin/journal?${csv.toString()}`} className="text-sm font-semibold text-[var(--admin-navy)] underline">
              CSV
            </Link>
          ) : null}
        </div>
      </form>
      {chainIntact === false ? (
        <p className="text-sm font-semibold text-[var(--admin-red)]">La chaîne du journal est interrompue.</p>
      ) : null}
      {chainIntact ? <p className="text-sm text-muted">Chaîne du journal intacte.</p> : null}
      <section className="admin-af-card overflow-hidden rounded-2xl">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Aucune action pour ces filtres.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <li key={row.seq} className="px-5 py-3 text-sm">
                <p className="font-semibold text-[var(--admin-navy)]">
                  {JOURNAL_ACTION_LABELS[row.action]} · {row.actor}
                </p>
                <p className="text-muted">
                  {formatDateTimeFr(row.occurred_at)} · {JOURNAL_ENTITY_LABELS[row.entity_type]}
                </p>
                <p className="mt-1">{row.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
