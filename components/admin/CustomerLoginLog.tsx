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
  return (
    <li className="py-3">
      <p className="font-medium text-[var(--admin-navy)]">{line.text}</p>
      {line.detail ? <p className="mt-1 text-sm text-[var(--admin-navy)]/80">{line.detail}</p> : null}
      <p className="mt-0.5 text-xs text-muted first-letter:uppercase">{formatCustomerLoginAt(line.at)}</p>
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
  return (
    <section className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Activité</h2>
      <p className="mt-1 text-sm text-muted">
        Connexions, pages ouvertes et gestes du titulaire dans l’espace.
      </p>
      {lines.length ? (
        <div className="mt-2">
          <ol className="divide-y divide-border text-sm">
            {recent.map((line) => (
              <ActivityItem key={line.id} line={line} />
            ))}
          </ol>
          {older.length ? (
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <span>
                  {older.length === 1 ? "1 événement plus ancien" : `${older.length} événements plus anciens`}
                </span>
                <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
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
        <p className="mt-4 text-sm text-muted">
          Aucune activité. Elle apparaîtra dès que le titulaire ouvrira l’espace ou y fera quelque chose.
        </p>
      )}
    </section>
  );
}
