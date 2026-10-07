import { Icon } from "@/components/crm/icons";
import { formatCustomerLoginAt, loginMethodLabel } from "@/lib/crm/customer-login";
import type { CrmCustomerActivity, CrmCustomerLogin } from "@/lib/crm/types";

const VISIBLE = 8;

type Line = { id: string; at: string; text: string; detail: string | null };

function activityLines(logins: CrmCustomerLogin[], activity: CrmCustomerActivity[]): Line[] {
  return [
    ...logins.map((login) => ({
      id: `login-${login.id}`,
      at: login.created_at,
      text: `Connexion · ${loginMethodLabel(login.method)}`,
      detail: null,
    })),
    ...activity.map((row) => ({
      id: `act-${row.id}`,
      at: row.created_at,
      text: row.summary,
      detail: row.detail,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function ActivityItem({ line }: { line: Line }) {
  const when = formatCustomerLoginAt(line.at);
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <p className="min-w-0 truncate text-[var(--admin-navy)]">
        <span className="font-medium">{line.text}</span>
        {line.detail ? <span className="text-[var(--admin-navy)]/70"> · {line.detail}</span> : null}
      </p>
      <p className="shrink-0 text-xs text-muted first-letter:uppercase">{when}</p>
    </li>
  );
}

export function CustomerLoginLog({
  logins,
  activity = [],
}: {
  logins: CrmCustomerLogin[];
  activity?: CrmCustomerActivity[];
}) {
  const lines = activityLines(logins, activity);
  const recent = lines.slice(0, VISIBLE);
  const older = lines.slice(VISIBLE);
  const latest = lines[0];
  const latestWhen = latest ? formatCustomerLoginAt(latest.at) : "";
  return (
    <details className="admin-af-card group rounded-3xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden [&::marker]:content-none">
        <span className="min-w-0">
          <span className="block font-display text-lg font-bold text-[var(--admin-navy)]">Activité</span>
          {latest ? (
            <span className="mt-0.5 block truncate text-sm text-muted first-letter:uppercase">
              {latest.text}
              {latest.detail ? ` · ${latest.detail}` : ""}
              {latestWhen ? ` · ${latestWhen}` : ""}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-sm text-muted">Aucune activité.</span>
          )}
        </span>
        <Icon name="expand_more" className="h-4 w-4 shrink-0 text-[var(--admin-navy)] transition-transform group-open:rotate-180" />
      </summary>
      {lines.length ? (
        <div className="border-t border-[var(--border)] px-5 pb-3">
          <ol className="divide-y divide-border text-sm">
            {recent.map((line) => (
              <ActivityItem key={line.id} line={line} />
            ))}
          </ol>
          {older.length ? (
            <details className="group/older mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <span>
                  {older.length === 1 ? "1 événement plus ancien" : `${older.length} événements plus anciens`}
                </span>
                <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open/older:rotate-180" />
              </summary>
              <ol className="divide-y divide-border text-sm">
                {older.map((line) => (
                  <ActivityItem key={line.id} line={line} />
                ))}
              </ol>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="border-t border-[var(--border)] px-5 py-4 text-sm text-muted">
          Elle apparaîtra dès que le titulaire ouvrira l’espace ou y fera quelque chose.
        </p>
      )}
    </details>
  );
}
