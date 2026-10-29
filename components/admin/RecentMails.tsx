import { Icon } from "@/components/crm/icons";
import { DASHBOARD_MAIL_PREVIEW, type DashboardCourrier } from "@/lib/crm/hotel-courrier-board";
import { formatDateTimeFr } from "@/lib/crm/dates";
import Link from "next/link";

const replyClass = {
  treat:
    "inline-block max-w-full break-words rounded-full bg-[var(--admin-peach)] px-2.5 py-1 text-xs font-semibold leading-snug text-[var(--admin-navy)]",
  waiting:
    "inline-block max-w-full break-words rounded-full bg-[#f8f4ed] px-2.5 py-1 text-xs font-semibold leading-snug text-[#9e7e51] ring-1 ring-[var(--admin-gold)]/40",
  silent:
    "inline-block max-w-full break-words rounded-full bg-[#0B192C] px-2.5 py-1 text-xs font-semibold leading-snug text-[#C5A880]",
} as const;

const paymentClass = {
  paid: "inline-block max-w-full break-words rounded-full bg-[var(--admin-navy)] px-2.5 py-1 text-xs font-semibold leading-snug text-white",
  unpaid:
    "inline-block max-w-full break-words rounded-full bg-white px-2.5 py-1 text-xs font-semibold leading-snug text-muted ring-1 ring-[#e5e0d4]",
} as const;

function MailRow({ mail }: { mail: DashboardCourrier }) {
  const when = formatDateTimeFr(mail.receivedAt);
  return (
    <li>
      <Link href={mail.href} className="block px-4 py-3 transition hover:bg-[#f8f4ed]">
        <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-3">
          <p className="min-w-0 font-display font-bold break-words text-[var(--admin-navy)] lg:flex-1">{mail.title}</p>
          <p className="shrink-0 text-xs tabular-nums text-muted">
            {when}
            {when ? ` · ${mail.lastWriter}` : mail.lastWriter}
          </p>
        </div>
        {mail.excerpt ? (
          <>
            {mail.reference ? <p className="mt-1 break-words text-sm text-muted">{mail.reference}</p> : null}
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#e5e0d4] border-l-4 border-l-[#C5A880] bg-[#faf9f6] px-3 py-2 text-sm leading-relaxed text-[var(--admin-navy)]">
              {mail.excerpt}
            </p>
          </>
        ) : mail.reference ? (
          <p className="mt-1 break-words text-sm text-[var(--admin-navy)]">{mail.reference}</p>
        ) : null}
        <div className="mt-2 flex flex-col items-start gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--admin-gold-dark)]">{mail.mark}</p>
          <span className={replyClass[mail.replyState]}>{mail.replyLabel}</span>
          {mail.followUpLabel ? <span className="text-xs font-medium text-[#3d4654]">{mail.followUpLabel}</span> : null}
          {mail.paymentLabel && mail.paymentState !== "hidden" ? (
            <span className={paymentClass[mail.paymentState === "paid" ? "paid" : "unpaid"]}>{mail.paymentLabel}</span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/** Courriers hôtel : trois plus récents, le reste se déplie. */
export function RecentMails({ mails }: { mails: DashboardCourrier[] }) {
  const preview = mails.slice(0, DASHBOARD_MAIL_PREVIEW);
  const rest = mails.slice(DASHBOARD_MAIL_PREVIEW);
  return (
    <section aria-labelledby="mails-titre">
      <h2 id="mails-titre" className="font-display text-lg font-bold text-[var(--admin-navy)]">
        Réponses d’hôtel
      </h2>
      <p className="mt-1 text-sm text-muted">Courriers envoyés aux hôtels, et leur réponse.</p>
      {mails.length ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-[#e5e0d4] bg-white">
          <ul className="divide-y divide-[#e5e0d4]">
            {preview.map((mail) => (
              <MailRow key={mail.id} mail={mail} />
            ))}
          </ul>
          {rest.length ? (
            <details className="group/more border-t border-[#e5e0d4]">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--admin-navy)] [&::-webkit-details-marker]:hidden [&::marker]:content-none">
                <span className="group-open/more:hidden">Voir plus</span>
                <span className="hidden group-open/more:inline">Voir moins</span>
                <Icon name="expand_more" className="h-4 w-4 shrink-0 transition-transform group-open/more:rotate-180" />
              </summary>
              <ul className="divide-y divide-[#e5e0d4] border-t border-[#e5e0d4]">
                {rest.map((mail) => (
                  <MailRow key={mail.id} mail={mail} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Rien à traiter pour le moment.</p>
      )}
    </section>
  );
}
