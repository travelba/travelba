import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { BOOKING_STATUS_LABELS } from "@/lib/crm/types";
import { formatDateFr, formatMoney, isUpcomingBooking } from "@/lib/crm/money";
import {
  ConciergeBanner,
  EmptyState,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";
import { bookingCoverUrl } from "@/lib/crm/covers";
import { loadVisibleCarnets } from "@/lib/crm/carnet-query";
import { siteConfig } from "@/lib/site";

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((start.getTime() - today.getTime()) / 86_400_000);
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const all = await loadVisibleCarnets(supabase, customer.id);
  const upcoming = all.filter(
    (b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"
  );
  const past = all.filter(
    (b) =>
      !isUpcomingBooking(b.end_date) ||
      b.status === "completed" ||
      b.status === "cancelled"
  );
  const showPast = tab === "passes";
  const list = showPast ? past : upcoming;
  const whatsappHref = `https://wa.me/${siteConfig.whatsappNumber}`;

  return (
    <div className="space-y-5">
      <aside className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e3dc] bg-white p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[var(--admin-gold)]">
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--admin-navy)]">
              Conciergerie {siteConfig.shortName}
            </p>
            <p className="truncate text-[11px] text-muted">
              Votre travel designer dédié (24/7)
            </p>
          </div>
        </div>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center rounded-full bg-[var(--admin-navy)] px-3.5 py-2 text-xs font-bold text-white"
        >
          Contacter
        </a>
      </aside>

      <div className="flex rounded-full bg-[var(--surface-2)] p-1">
        <Link
          href="/mon-compte/reservations"
          className={`flex-1 rounded-full px-3 py-2.5 text-center text-sm font-bold transition ${
            !showPast
              ? "bg-white text-[var(--admin-navy)] shadow-sm"
              : "text-slate-600"
          }`}
        >
          À venir ({upcoming.length})
        </Link>
        <Link
          href="/mon-compte/reservations?tab=passes"
          className={`flex-1 rounded-full px-3 py-2.5 text-center text-sm font-bold transition ${
            showPast
              ? "bg-white text-[var(--admin-navy)] shadow-sm"
              : "text-slate-600"
          }`}
        >
          Passées ({past.length})
        </Link>
      </div>

      <ul className="space-y-4">
        {list.map((b) => {
          const jMinus = daysUntil(b.start_date);
          const img = bookingCoverUrl(b, 1200);
          return (
            <li key={b.id}>
              <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] bg-white shadow-[0_4px_20px_-2px_rgba(11,25,44,0.04)]">
                <div className="relative h-40 overflow-hidden">
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${img})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                  <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                    <StatusChip tone={bookingStatusTone(b.status)}>
                      {BOOKING_STATUS_LABELS[b.status]}
                    </StatusChip>
                  </div>
                  {!showPast && jMinus != null && jMinus >= 0 ? (
                    <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[var(--admin-navy)]">
                      Dans {jMinus} j
                    </span>
                  ) : null}
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="font-display text-lg font-extrabold text-white">
                      {b.destination || b.title}
                    </p>
                    <p className="text-xs text-white/80">
                      {formatDateFr(b.start_date)} — {formatDateFr(b.end_date)}
                    </p>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                        Réf. {b.reference}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-[var(--admin-navy)]">
                        {b.title}
                      </p>
                    </div>
                    <p className="font-display text-base font-extrabold text-[var(--admin-navy)]">
                      {formatMoney(Number(b.total_amount), b.currency)}
                    </p>
                  </div>
                  <Link
                    href={`/mon-compte/reservations/${b.reference}`}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--admin-navy)] px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    {showPast ? "Revoir le carnet" : "Ouvrir le carnet"}
                  </Link>
                </div>
              </article>
            </li>
          );
        })}
        {!list.length ? (
          <li>
            <EmptyState
              title={showPast ? "Aucun voyage passé" : "Aucun voyage à venir"}
              description="Votre conciergerie publiera le carnet dès que le dossier sera prêt."
            />
          </li>
        ) : null}
      </ul>

      <ConciergeBanner />
    </div>
  );
}
