import Link from "next/link";
import { formatDateTimeFr } from "@/lib/crm/dates";
import { loginMethodLabel } from "@/lib/crm/customer-login";
import type { ConnectionSessionView } from "@/lib/crm/connection-journal";

function gestureLabel(count: number) {
  if (count === 0) return "Aucun geste";
  if (count === 1) return "1 geste";
  return `${count} gestes`;
}

export function ConnectionJournal({ sessions }: { sessions: ConnectionSessionView[] }) {
  return (
    <section aria-labelledby="connexions-titre">
      <h2 id="connexions-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Connexions
      </h2>
      <p className="mt-1 text-sm text-muted">Dernières ouvertures de l’espace. Un clic montre ce que le client a fait.</p>
      {sessions.length ? (
        <ul className="mt-3 divide-y divide-[#e5e0d4] overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
          {sessions.map((session) => (
            <li key={session.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 hover:bg-[#f8f4ed] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                  <span className="min-w-0">
                    <span className="block truncate font-display font-bold text-[var(--admin-navy)]">{session.name}</span>
                    <span className="mt-0.5 block text-xs font-semibold uppercase tracking-wide text-[var(--admin-gold-dark)]">
                      {loginMethodLabel(session.method)} · {gestureLabel(session.actions.length)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">{formatDateTimeFr(session.at)}</span>
                </summary>
                <div className="border-t border-[#e5e0d4] bg-[#faf9f6] px-4 py-3">
                  {session.actions.length ? (
                    <ol className="space-y-2 text-sm text-[var(--admin-navy)]">
                      {session.actions.map((action) => (
                        <li key={action.id} className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0">
                            <span className="font-medium">{action.summary}</span>
                            {action.detail ? <span className="text-[var(--admin-navy)]/70"> · {action.detail}</span> : null}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{formatDateTimeFr(action.at)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted">Rien après cette connexion.</p>
                  )}
                  <Link
                    href={`/admin/clients/${session.customerId}`}
                    className="mt-3 inline-flex text-sm font-semibold text-[var(--admin-navy)] underline"
                  >
                    Ouvrir la fiche
                  </Link>
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucune connexion pour le moment.</p>
      )}
    </section>
  );
}
