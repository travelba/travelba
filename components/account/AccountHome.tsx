import Link from "next/link";
import type { CrmBooking } from "@/lib/crm/types";
import type { HomeDossierRow, HomeHighlight } from "@/lib/crm/account-home";
import { BookingHero } from "@/components/crm/BookingHero";
import { Icon } from "@/components/crm/icons";
import { BookingStatusBadge, ConciergeBanner } from "@/components/crm/ui";
import { siteConfig } from "@/lib/site";

export type HomeOtherTrip = {
  href: string;
  dates: string;
  name: string;
  place: string | null;
};

export function AccountHome({
  firstName,
  trip,
  dossier,
  others,
}: {
  firstName: string;
  trip: {
    booking: CrmBooking;
    href: string;
    name: string;
    place: string | null;
    dates: string;
    timing: string | null;
    statusLabel: string;
    reference: string;
    notes: string | null;
    highlights: HomeHighlight[];
  } | null;
  dossier: HomeDossierRow[];
  others: HomeOtherTrip[];
}) {
  return (
    <div className="space-y-5">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9c7c4e]">
          {trip ? "Votre prochain séjour" : "Espace client"}
        </p>
        <h1 className="mt-1 font-display text-[1.75rem] font-bold leading-tight tracking-tight text-[var(--admin-navy)]">
          Bonjour {firstName}
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          {trip
            ? "Le séjour publié par l’agence, les pièces du dossier et le compte."
            : "L’agence publiera le carnet ici dès que le dossier sera prêt."}
        </p>
      </header>

      {trip ? (
        <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-[0_12px_32px_-16px_rgba(11,25,44,0.45)]">
          <BookingHero booking={trip.booking} priority className="min-h-[248px]">
            <div className="flex min-h-[248px] flex-col justify-between p-4">
              <div className="flex items-start justify-between gap-2">
                {trip.timing ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/35 bg-[#faf9f6]/95 px-2.5 py-1 text-[11px] font-semibold text-[var(--admin-navy)] shadow-sm">
                    <Icon name="timer" className="h-3.5 w-3.5 text-[#9c7c4e]" />
                    {trip.timing}
                  </span>
                ) : (
                  <span />
                )}
                <BookingStatusBadge label={trip.statusLabel} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-gold)]">
                  {trip.dates}
                </p>
                <h2 className="mt-1 font-display text-[1.7rem] font-bold leading-[1.15] tracking-tight">
                  {trip.name}
                </h2>
                {trip.place ? <p className="mt-0.5 text-sm text-white/80">{trip.place}</p> : null}
              </div>
            </div>
          </BookingHero>

          <div className="space-y-3 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5a5c60]">
                  Référence
                </p>
                <p className="font-display text-base font-bold tracking-tight text-[var(--admin-navy)]">
                  {trip.reference}
                </p>
              </div>
            </div>

            {trip.highlights.length ? (
              <ul className="space-y-2">
                {trip.highlights.map((row) => (
                  <li
                    key={`${row.label}-${row.title}`}
                    className="flex items-start gap-3 rounded-xl border border-[#e5e3dc] bg-[#f4f3f0] px-3 py-2.5"
                  >
                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[var(--admin-navy)]">
                      <Icon name={row.icon} className="h-4 w-4 text-[#9c7c4e]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9c7c4e]">
                        {row.label}
                      </span>
                      <span className="block truncate text-sm font-semibold text-[var(--admin-navy)]">
                        {row.title}
                      </span>
                      {row.detail ? (
                        <span className="block truncate text-xs text-muted">{row.detail}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {trip.notes ? (
              <div className="rounded-xl bg-[var(--admin-peach)] px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9c7c4e]">
                  Note de l’agence
                </p>
                <p className="mt-1 line-clamp-4 text-sm leading-relaxed text-[var(--admin-navy)]">
                  {trip.notes}
                </p>
              </div>
            ) : null}

            <Link
              href={trip.href}
              className="flex h-11 items-center justify-between rounded-full bg-[var(--admin-navy)] px-4 text-sm font-semibold text-white"
            >
              <span className="inline-flex items-center gap-2">
                <Icon name="menu_book" className="h-4 w-4 text-[var(--admin-gold)]" />
                Voir le carnet
              </span>
              <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold)]" />
            </Link>
          </div>
        </article>
      ) : (
        <article className="overflow-hidden rounded-2xl bg-[var(--admin-navy)] text-white shadow-[0_12px_32px_-16px_rgba(11,25,44,0.55)]">
          <div className="px-5 py-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-gold)]">
              Prochain séjour
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">Aucun voyage planifié</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
              Dès que le dossier est publié, le carnet, les dates et les pièces apparaissent ici.
            </p>
            <a
              href={`https://wa.me/${siteConfig.whatsappNumber}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[var(--admin-gold)] px-5 text-sm font-semibold text-[var(--admin-navy)]"
            >
              <Icon name="chat" className="h-4 w-4" />
              Écrire à l’agence
            </a>
          </div>
        </article>
      )}

      {dossier.length ? (
        <section className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#e5e3dc] px-4 py-3">
            <Icon name="task_alt" className="h-4 w-4 text-[#9c7c4e]" />
            <h2 className="font-display text-[15px] font-semibold text-[var(--admin-navy)]">Le dossier</h2>
          </div>
          <ul className="divide-y divide-[#efece6]">
            {dossier.map((row) => (
              <li key={row.href + row.label}>
                <Link href={row.href} className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      row.attention
                        ? "bg-[var(--admin-peach)] text-[var(--admin-navy)] ring-1 ring-[var(--admin-gold)]/50"
                        : "bg-[#f4f3f0] text-[var(--admin-navy)]"
                    }`}
                  >
                    <Icon name={row.icon} className="h-[18px] w-[18px] text-[#9c7c4e]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9c7c4e]">
                      {row.label}
                    </span>
                    <span className="block truncate text-sm font-semibold text-[var(--admin-navy)]">
                      {row.title}
                    </span>
                    {row.detail ? (
                      <span className="block truncate text-xs text-muted">{row.detail}</span>
                    ) : null}
                  </span>
                  <Icon name="arrow_forward" className="h-4 w-4 shrink-0 text-[var(--admin-gold)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length ? (
        <section className="space-y-2">
          <h2 className="px-1 font-display text-[15px] font-semibold text-[var(--admin-navy)]">
            Autres séjours
          </h2>
          <ul className="space-y-2">
            {others.map((row) => (
              <li key={row.href}>
                <Link
                  href={row.href}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] bg-white px-4 py-3 shadow-sm"
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9c7c4e]">
                      {row.dates}
                    </span>
                    <span className="block truncate font-display text-base font-bold text-[var(--admin-navy)]">
                      {row.name}
                    </span>
                    {row.place ? (
                      <span className="block truncate text-xs text-muted">{row.place}</span>
                    ) : null}
                  </span>
                  <Icon name="arrow_forward" className="h-4 w-4 shrink-0 text-[var(--admin-gold)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConciergeBanner />
    </div>
  );
}
