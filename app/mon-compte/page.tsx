import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import {
  BOOKING_STATUS_LABELS,
  customerFullName,
  type CrmBalance,
  type CrmBooking,
} from "@/lib/crm/types";
import { formatDateFr, formatMoney, isUpcomingBooking } from "@/lib/crm/money";
import {
  ConciergeBanner,
  PageEyebrow,
  StatusChip,
  bookingStatusTone,
} from "@/components/crm/ui";

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const [{ data: bookings }, { data: balances }] = await Promise.all([
    supabase
      .from("crm_bookings")
      .select("*")
      .eq("customer_id", customer.id)
      .neq("status", "cancelled")
      .order("start_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("crm_customer_balances")
      .select("*")
      .eq("customer_id", customer.id),
  ]);

  const nextTrip = ((bookings || []) as CrmBooking[]).find((b) =>
    isUpcomingBooking(b.end_date)
  );
  const encours = (balances || []) as CrmBalance[];
  const primaryBalance = encours[0];
  const balanceValue = primaryBalance ? Number(primaryBalance.balance) : 0;
  const currency = primaryBalance?.currency || "EUR";
  const firstName = customer.first_name || customerFullName(customer).split(" ")[0];

  return (
    <div className="space-y-8">
      <header>
        <PageEyebrow>Espace privilège voyageur</PageEyebrow>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-[var(--admin-navy)] sm:text-4xl">
          Bonjour, {firstName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">
          Heureux de vous retrouver dans votre espace personnel Travelba. Voici
          le résumé de vos séjours et de votre compte.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <article className="admin-af-card overflow-hidden rounded-2xl">
          <div className="border-b border-[var(--border)] px-6 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
              Votre prochaine destination
            </p>
            {nextTrip ? (
              <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-extrabold text-[var(--admin-navy)]">
                    {nextTrip.destination || nextTrip.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{nextTrip.title}</p>
                </div>
                <StatusChip tone={bookingStatusTone(nextTrip.status)}>
                  {BOOKING_STATUS_LABELS[nextTrip.status]}
                </StatusChip>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                Aucun voyage à venir pour le moment.
              </p>
            )}
          </div>
          {nextTrip ? (
            <div className="space-y-4 px-6 py-5">
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Dates
                  </p>
                  <p className="mt-0.5 font-semibold text-[var(--admin-navy)]">
                    {formatDateFr(nextTrip.start_date)} →{" "}
                    {formatDateFr(nextTrip.end_date)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Référence
                  </p>
                  <p className="mt-0.5 font-semibold text-[var(--admin-navy)]">
                    {nextTrip.reference}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Montant
                  </p>
                  <p className="mt-0.5 font-semibold text-[var(--admin-navy)]">
                    {formatMoney(Number(nextTrip.total_amount), nextTrip.currency)}
                  </p>
                </div>
              </div>
              <Link
                href={`/mon-compte/reservations/${nextTrip.reference}`}
                className="admin-af-btn inline-flex rounded-xl px-5 py-2.5 text-sm"
              >
                Voir le dossier →
              </Link>
            </div>
          ) : (
            <div className="px-6 py-5">
              <Link
                href="/mon-compte/reservations"
                className="text-sm font-semibold text-[var(--admin-navy)]"
              >
                Voir mes réservations →
              </Link>
            </div>
          )}
        </article>

        <article className="admin-af-card rounded-2xl p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Situation du compte
          </p>
          <p className="mt-3 font-display text-4xl font-extrabold tracking-tight text-[var(--admin-navy)]">
            {formatMoney(balanceValue, currency)}
          </p>
          <p className="mt-1 text-sm font-semibold text-muted">
            {balanceValue > 0
              ? "Avoir disponible"
              : balanceValue < 0
                ? "Reste à payer"
                : "Solde à jour"}
          </p>
          <div className="mt-5 space-y-2">
            <Link
              href="/mon-compte/transactions"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--admin-navy)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--admin-navy-deep)]"
            >
              Consulter les transactions
            </Link>
            <Link
              href="/mon-compte/profil/paiement"
              className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Moyens de paiement
            </Link>
          </div>
        </article>
      </div>

      <ConciergeBanner />
    </div>
  );
}
