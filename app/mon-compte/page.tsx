import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureCustomerForUser } from "@/lib/crm/auth";
import type { CrmBalance, CrmBookingTraveler, CrmTravelDocument } from "@/lib/crm/types";
import { encoursCaption, formatDateRangeShort, formatMoney, isUpcomingBooking, jMinusLabel } from "@/lib/crm/money";
import { isCompanyMember } from "@/lib/crm/company-role";
import { loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { reconcileCustomerParty } from "@/lib/crm/reconcile-party";
import { tripDocCoverage } from "@/lib/crm/trip-documents";
import { BookingHero } from "@/components/crm/BookingHero";
import { Icon } from "@/components/crm/icons";
import { ConciergeBanner } from "@/components/crm/ui";
import { greetingGivenName } from "@/lib/crm/identity";

export default async function AccountHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const member = isCompanyMember(customer);
  await reconcileCustomerParty(customer.id);
  const [{ data: balances }, bookings] = await Promise.all([
    member
      ? Promise.resolve({ data: [] as CrmBalance[] })
      : supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id),
    loadVisibleCarnets(supabase, customer.id),
  ]);

  const nextTrip =
    sortBookingsByStart(
      bookings.filter((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled"),
      "asc"
    )[0] || null;

  let missingPassports = 0;
  if (nextTrip) {
    const [{ data: travelers }, { data: identityDocs }] = await Promise.all([
      supabase.from("crm_booking_travelers").select("*").eq("booking_id", nextTrip.id),
      supabase.from("crm_travel_documents").select("*").eq("customer_id", customer.id),
    ]);
    const coverage = tripDocCoverage(
      (travelers || []) as CrmBookingTraveler[],
      (identityDocs || []) as CrmTravelDocument[]
    );
    if (coverage.total > coverage.ready) missingPassports = coverage.total - coverage.ready;
  }

  const balanceRows = ((balances || []) as CrmBalance[]).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shownBalances = balanceRows.length ? balanceRows : [{ currency: "EUR", value: 0 }];
  const owes = shownBalances.some((row) => row.value < 0);
  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  const countdown = nextTrip ? jMinusLabel(nextTrip.start_date) : null;
  const tripHref = nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations";

  return (
    <div className="space-y-4">
      <h1 className="font-display text-[1.5rem] font-bold tracking-tight text-[var(--admin-navy)]">
        Bonjour {firstName}
      </h1>

      {nextTrip ? (
        <BookingHero booking={nextTrip} priority className="min-h-[220px] rounded-2xl shadow-xl">
          <div className="flex min-h-[220px] flex-col justify-end gap-3 p-4">
            {countdown ? (
              <p className="w-fit rounded-full bg-white/95 px-3 py-1 text-[12px] font-bold text-[var(--admin-navy)]">
                {countdown}
                {countdown.startsWith("J") ? " avant l’envol" : ""}
              </p>
            ) : null}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
                {formatDateRangeShort(nextTrip.start_date, nextTrip.end_date)}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold leading-tight">
                {nextTrip.destination || nextTrip.title || "Prochain séjour"}
              </h2>
            </div>
            {missingPassports ? (
              <Link
                href={`${tripHref}#passeport`}
                className="rounded-xl bg-[var(--admin-peach)] px-3 py-2 text-sm font-semibold text-[var(--admin-navy)]"
              >
                Pièce manquante pour {missingPassports} voyageur{missingPassports > 1 ? "s" : ""}.
              </Link>
            ) : null}
            <Link
              href={tripHref}
              className="flex h-11 items-center justify-between rounded-full bg-white px-4 text-sm font-semibold text-[var(--admin-navy)]"
            >
              Accéder à ma réservation
              <Icon name="arrow_forward" className="h-5 w-5 text-[var(--admin-gold)]" />
            </Link>
          </div>
        </BookingHero>
      ) : (
        <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun voyage planifié</h2>
          <p className="mt-1 text-sm text-muted">L’agence publiera le carnet ici dès que le dossier sera prêt.</p>
        </article>
      )}

      <Link
        href="/mon-compte/reservations"
        className="flex h-11 items-center justify-between rounded-2xl border border-[#e5e3dc] bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] shadow-sm"
      >
        Mes réservations
        <Icon name="luggage" className="h-5 w-5 text-[var(--admin-gold)]" />
      </Link>

      {member ? (
        <Link
          href="/mon-compte/transactions"
          className="block rounded-2xl border border-[#e5e3dc] bg-white p-4 text-sm font-semibold text-[var(--admin-navy)] shadow-sm"
        >
          Voir les frais de vos voyages
        </Link>
      ) : (
        <Link
          href="/mon-compte/transactions"
          className={`block rounded-2xl border p-4 shadow-sm ${
            owes
              ? "border-[var(--admin-gold)]/50 bg-[var(--admin-peach)]"
              : "border-[#e5e3dc] bg-white"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9c7c4e]">Encours</p>
          <ul className="mt-2 space-y-3">
            {shownBalances.map((row, index) => (
              <li key={row.currency}>
                <p
                  className={`font-display font-bold tracking-tight text-[var(--admin-navy)] ${
                    index === 0 ? "text-[1.75rem] leading-none" : "text-xl"
                  }`}
                >
                  {formatMoney(row.value, row.currency)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {row.value > 0 ? "Crédit disponible · frais d’agence 10 % déduits" : encoursCaption(row.value)}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center justify-between text-sm font-semibold text-[var(--admin-navy)]">
            Voir les mouvements
            <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold)]" />
          </p>
        </Link>
      )}

      <ConciergeBanner />
    </div>
  );
}
