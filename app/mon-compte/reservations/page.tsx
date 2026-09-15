import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import { BOOKING_STATUS_LABELS, type CrmBooking } from "@/lib/crm/types";
import { formatDateFr, formatMoney, isUpcomingBooking } from "@/lib/crm/money";
import {
  ConciergeBanner,
  EmptyState,
  PageEyebrow,
  PageTitle,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";

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

  const { data } = await supabase
    .from("crm_bookings")
    .select("*")
    .eq("customer_id", customer.id)
    .order("start_date", { ascending: false, nullsFirst: false });

  const all = (data || []) as CrmBooking[];
  const upcoming = all.filter(
    (b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"
  );
  const past = all.filter(
    (b) => !isUpcomingBooking(b.end_date) || b.status === "completed"
  );
  const showPast = tab === "passes";
  const list = showPast ? past : upcoming;

  return (
    <div className="space-y-6">
      <div>
        <PageEyebrow>Espace privilège voyageur</PageEyebrow>
        <PageTitle
          title="Mes réservations"
          subtitle="Consultez vos séjours, confirmations et documents de voyage."
          actions={
            <a
              href="mailto:contact@travelba.fr"
              className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Contacter ma conciergerie
            </a>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/mon-compte/reservations"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            !showPast
              ? "bg-[var(--admin-navy)] text-white"
              : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
          }`}
        >
          À venir ({upcoming.length})
        </Link>
        <Link
          href="/mon-compte/reservations?tab=passes"
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            showPast
              ? "bg-[var(--admin-navy)] text-white"
              : "bg-white text-[var(--admin-navy)] ring-1 ring-[var(--border)]"
          }`}
        >
          Passés ({past.length})
        </Link>
      </div>

      <ul className="space-y-4">
        {list.map((b) => (
          <li key={b.id}>
            <article className="admin-af-card overflow-hidden rounded-2xl">
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={bookingStatusTone(b.status)}>
                      {BOOKING_STATUS_LABELS[b.status]}
                    </StatusChip>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Réf. {b.reference}
                    </span>
                  </div>
                  <h2 className="mt-2 font-display text-xl font-extrabold text-[var(--admin-navy)]">
                    {b.destination || b.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {b.title}
                    {b.destination ? ` · ${b.destination}` : ""}
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--admin-navy)]">
                    {formatDateFr(b.start_date)} → {formatDateFr(b.end_date)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                  <p className="font-display text-lg font-extrabold text-[var(--admin-navy)]">
                    {formatMoney(Number(b.total_amount), b.currency)}
                  </p>
                  <Link
                    href={`/mon-compte/reservations/${b.reference}`}
                    className="admin-af-btn inline-flex justify-center rounded-xl px-4 py-2.5 text-sm"
                  >
                    Voir le dossier →
                  </Link>
                </div>
              </div>
            </article>
          </li>
        ))}
        {!list.length ? (
          <li>
            <EmptyState
              title={
                showPast
                  ? "Aucun voyage passé"
                  : "Aucun voyage à venir"
              }
              description="Votre conciergerie Travelba pourra créer votre prochain dossier dès que vous le souhaitez."
            />
          </li>
        ) : null}
      </ul>

      <ConciergeBanner />
    </div>
  );
}
