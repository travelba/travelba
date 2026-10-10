import { Suspense } from "react";
import { toPublicBooking } from "@/lib/crm/public-booking";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import type { CrmBalance } from "@/lib/crm/types";
import { isClientUpcomingStay } from "@/lib/crm/client-stays";
import { encoursCaption, formatDateRangeShort, formatMoney, jMinusLabel } from "@/lib/crm/money";
import { isCompanyMember } from "@/lib/crm/company-role";
import { clientTripOwnerIds } from "@/lib/crm/company-peers";
import { loadStayArrivalPlaces, loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { tripPlaceLine } from "@/lib/crm/carnet";
import { stayTitleFromItems } from "@/lib/crm/staff-stay";
import { stayTransitionName } from "@/lib/crm/account-motion";
import { BookingHero } from "@/components/crm/BookingHero";
import { AccountPage } from "@/components/account/AccountPage";
import {
  BoardingPassSkeleton,
  HomeBoardingPass,
  HomeDepartureWord,
  HomeTripHeading,
  HomeWeatherChip,
  WeatherChipSkeleton,
} from "@/components/account/HomeTripExtras";
import { Icon } from "@/components/crm/icons";
import { greetingGivenName } from "@/lib/crm/identity";

export default async function AccountHomePage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const member = isCompanyMember(customer);
  const ownerIds = await clientTripOwnerIds(customer);
  const [{ data: balances }, bookings] = await Promise.all([
    member
      ? Promise.resolve({ data: [] as CrmBalance[] })
      : supabase
          .from("crm_customer_balances")
          .select("*")
          .eq("customer_id", customer.id),
    loadVisibleCarnets(supabase, customer.id, ownerIds),
  ]);

  const nextTrip =
    sortBookingsByStart(
      bookings.filter((b) => isClientUpcomingStay(b)),
      "asc"
    )[0] || null;
  const places = nextTrip ? await loadStayArrivalPlaces(supabase, [nextTrip.id]) : {};

  const balanceRows = ((balances || []) as CrmBalance[]).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shownBalances = balanceRows.length ? balanceRows : [{ currency: "EUR", value: 0 }];
  const owing = shownBalances.filter((row) => row.value < 0);
  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  const countdown = nextTrip ? jMinusLabel(nextTrip.start_date) : null;
  const tripHref = nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations";
  const tripName = nextTrip
    ? stayTitleFromItems(nextTrip.title, nextTrip.destination, [], "Prochain séjour")
    : "";
  const tripPlace = nextTrip ? tripPlaceLine(tripName, nextTrip.destination) : null;

  return (
    <AccountPage>
    <div className="space-y-3">
      <section className="flex flex-col gap-1 pt-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9e7e51]">
          Travel Business Agency · Espace membre
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          Bonjour {firstName}
        </h1>
      </section>

      {member ? (
        <Link
          href="/mon-compte/transactions"
          transitionTypes={["nav-forward"]}
          className="account-press flex h-11 items-center justify-between rounded-2xl border border-[var(--admin-gold)]/55 bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] shadow-sm"
        >
          Voir les frais de vos voyages
          <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        </Link>
      ) : owing.length ? (
        <Link
          href="/mon-compte/transactions"
          transitionTypes={["nav-forward"]}
          className="account-press block rounded-2xl border border-[var(--admin-gold)] bg-[#f8f3eb] p-4 shadow-sm hover:border-[var(--admin-gold)]"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Encours</p>
          <ul className="mt-2 space-y-2">
            {owing.map((row) => (
              <li key={row.currency}>
                <p className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
                  {formatMoney(row.value, row.currency)}
                </p>
                <p className="text-xs text-muted">{encoursCaption(row.value)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-navy)]">
            Voir les transactions
            <Icon name="arrow_forward" className="h-3.5 w-3.5 text-[var(--admin-gold-dark)]" />
          </p>
        </Link>
      ) : (
        <Link
          href="/mon-compte/transactions"
          transitionTypes={["nav-forward"]}
          className="account-press inline-flex items-center gap-1 text-sm font-semibold text-[var(--admin-navy)]"
        >
          Voir les transactions
          <Icon name="arrow_forward" className="h-3.5 w-3.5 text-[var(--admin-gold-dark)]" />
        </Link>
      )}

      {nextTrip ? (
        <article className="account-press overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-xl">
          <BookingHero
            booking={toPublicBooking(nextTrip)}
            places={places[nextTrip.id]}
            priority
            frameClassName="relative h-[22rem] w-full"
            transitionName={stayTransitionName(nextTrip.reference)}
          >
            <div className="flex h-full min-w-0 flex-col justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                {countdown ? (
                  <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-white/95 px-3 py-1 text-[12px] font-semibold text-[var(--admin-navy)] shadow-sm">
                    <Icon name="timer" className="h-[15px] w-[15px] shrink-0 text-[var(--admin-gold)]" />
                    <span className="font-bold">{countdown}</span>
                    {countdown.startsWith("J") ? (
                      <Suspense fallback={<span className="font-normal text-[#5a5c60]">avant le départ</span>}>
                        <HomeDepartureWord bookingId={nextTrip.id} />
                      </Suspense>
                    ) : null}
                  </p>
                ) : null}
                <Suspense fallback={<WeatherChipSkeleton />}>
                  <HomeWeatherChip destination={nextTrip.destination} title={nextTrip.title} />
                </Suspense>
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
                    <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
                    {formatDateRangeShort(nextTrip.start_date, nextTrip.end_date)}
                  </p>
                  <Suspense
                    fallback={
                      <>
                        <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-white">{tripName}</h2>
                        {tripPlace ? <p className="line-clamp-2 text-[13px] text-white/80">{tripPlace}</p> : null}
                      </>
                    }
                  >
                    <HomeTripHeading
                      bookingId={nextTrip.id}
                      title={nextTrip.title}
                      destination={nextTrip.destination}
                    />
                  </Suspense>
                </div>
                <Link
                  href={tripHref}
                  transitionTypes={["nav-forward"]}
                  className="account-press flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-semibold text-[var(--admin-navy)] shadow-md"
                >
                  Accéder à ma réservation
                  <Icon name="arrow_forward" className="h-5 w-5 text-[var(--admin-gold)]" />
                </Link>
              </div>
            </div>
          </BookingHero>
        </article>
      ) : (
        <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5 shadow-sm">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun voyage planifié</h2>
          <p className="mt-1 text-sm text-muted">L’agence publiera le carnet ici dès que le dossier sera prêt.</p>
        </article>
      )}

      {nextTrip ? (
        <Suspense fallback={<BoardingPassSkeleton />}>
          <HomeBoardingPass booking={nextTrip} />
        </Suspense>
      ) : null}
    </div>
    </AccountPage>
  );
}
