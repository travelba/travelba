import Link from "next/link";
import type { DashboardMail } from "@/lib/crm/dashboard-mails";
import { formatDateTimeFr } from "@/lib/crm/dates";

/** Réponses des hôtels aux courriers envoyés par le CRM. */
export function RecentMails({ mails }: { mails: DashboardMail[] }) {
  return (
    <section aria-labelledby="mails-titre">
      <h2 id="mails-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Derniers mails
      </h2>
      <p className="mt-1 text-sm text-muted">Réponses des hôtels aux courriers envoyés.</p>
      {mails.length ? (
        <ul className="mt-3 divide-y divide-[#e5e0d4] overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
          {mails.map((mail) => (
            <li key={mail.id}>
              <Link href={mail.href} className="block px-4 py-3 transition hover:bg-[#f8f4ed]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-display font-bold text-[var(--admin-navy)]">{mail.title}</p>
                  <p className="shrink-0 text-xs tabular-nums text-muted">{formatDateTimeFr(mail.receivedAt)}</p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-[var(--admin-navy)]">{mail.detail}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--admin-gold-dark)]">{mail.mark}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">Aucune réponse d’hôtel pour le moment.</p>
      )}
    </section>
  );
}
