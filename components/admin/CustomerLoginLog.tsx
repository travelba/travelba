import { formatCustomerLoginAt, loginMethodLabel } from "@/lib/crm/customer-login";
import type { CrmCustomerLogin } from "@/lib/crm/types";

export function CustomerLoginLog({ logins }: { logins: CrmCustomerLogin[] }) {
  return (
    <section className="admin-af-card rounded-3xl p-5">
      <h2 className="font-display text-lg font-bold text-[var(--admin-navy)]">Connexions</h2>
      <p className="mt-1 text-sm text-muted">
        Jour et heure où le titulaire a ouvert l’espace.
      </p>
      {logins.length ? (
        <ol className="mt-4 divide-y divide-border text-sm">
          {logins.map((login) => (
            <li key={login.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 py-3">
              <p className="min-w-0 font-medium text-[var(--admin-navy)] first-letter:uppercase">
                {formatCustomerLoginAt(login.created_at)}
              </p>
              <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                {loginMethodLabel(login.method)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Aucune connexion enregistrée. Elles apparaîtront dès que le titulaire ouvrira l’espace.
        </p>
      )}
    </section>
  );
}
