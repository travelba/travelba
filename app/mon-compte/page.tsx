import { Suspense } from "react";
import { toPublicBooking } from "@/lib/crm/public-booking";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import type { CrmBalance, CrmCustomer } from "@/lib/crm/types";
import { isClientUpcomingStay } from "@/lib/crm/client-stays";
import { encoursCaption, formatDateRangeShort, formatMoney, jMinusLabel } from "@/lib/crm/money";
import { isCompanyMember } from "@/lib/crm/company-role";
import { clientTripOwnerIds } from "@/lib/crm/company-peers";
import { listStayDestination, listStayTitle, tripPlaceLine } from "@/lib/crm/carnet";
import { loadStayMaps, loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { stayTransitionName } from "@/lib/crm/account-motion";
import { BookingHero } from "@/components/crm/BookingHero";
import { AccountPage } from "@/components/account/AccountPage";
import { hotelBookingEnabled, showHotelButton } from "@/lib/crm/hotel-access";
import { readHotelButtonVisibility } from "@/lib/crm/hotel-access-run";
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
  const { user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  const hotels = showHotelButton({
    enabled: hotelBookingEnabled(customer),
    visibility: await readHotelButtonVisibility(),
  });

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

        {hotels ? (
          <Link
            href="/mon-compte/hotels"
            className="account-press flex items-center justify-between bg-[#f4efe6] px-4 py-4 text-[#1a1a1a]"
          >
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c7352]">Hôtels</span>
              <span className="text-[15px] font-semibold">Réserver un séjour</span>
            </span>
            <Icon name="arrow_forward" className="h-4 w-4 text-[#8c7352]" />
          </Link>
        ) : null}

        <Suspense fallback={<HomeEncoursSkeleton />}>
          <HomeEncours customer={customer} />
        </Suspense>

        <Suspense fallback={<HomeTripSkeleton />}>
          <HomeNextStay customer={customer} />
        </Suspense>
      </div>
    </AccountPage>
  );
}

function HomeEncoursSkeleton() {
  return <div className="h-11 animate-pulse rounded-2xl bg-[#0B192C]/10" aria-hidden />;
}

function HomeTripSkeleton() {
  return <div className="h-[22rem] animate-pulse rounded-2xl bg-[#0B192C]/10" aria-hidden />;
}

async function HomeEncours({ customer }: { customer: CrmCustomer }) {
  const { supabase } = await getSessionUser();
  const member = isCompanyMember(customer);
  const { data: balances } = member
    ? { data: [] as CrmBalance[] }
    : await supabase.from("crm_customer_balances").select("*").eq("customer_id", customer.id);

  const balanceRows = ((balances || []) as CrmBalance[]).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shownBalances = balanceRows.length ? balanceRows : [{ currency: "EUR", value: 0 }];
  const owing = shownBalances.filter((row) => row.value < 0);

  if (member) {
    return (
      <Link
        href="/mon-compte/transactions"
        transitionTypes={["nav-forward"]}
        className="account-press flex h-11 items-center justify-between rounded-2xl border border-[var(--admin-gold)]/55 bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] shadow-sm"
      >
        Voir les frais de vos voyages
        <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
      </Link>
    );
  }
  if (owing.length) {
    return (
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
    );
  }
  return (
    <Link
      href="/mon-compte/transactions"
      transitionTypes={["nav-forward"]}
      className="account-press inline-flex items-center gap-1 text-sm font-semibold text-[var(--admin-navy)]"
    >
      Voir les transactions
      <Icon name="arrow_forward" className="h-3.5 w-3.5 text-[var(--admin-gold-dark)]" />
    </Link>
  );
}

async function HomeNextStay({ customer }: { customer: CrmCustomer }) {
  const { supabase } = await getSessionUser();
  const ownerIds = await clientTripOwnerIds(customer);
  const bookings = await loadVisibleCarnets(supabase, customer.id, ownerIds);
  const nextTrip =
    sortBookingsByStart(
      bookings.filter((b) => isClientUpcomingStay(b)),
      "asc"
    )[0] || null;
  const places = nextTrip ? await loadStayMaps(supabase, [nextTrip.id]) : null;

  if (!nextTrip) {
    return (
      <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun voyage planifié</h2>
        <p className="mt-1 text-sm text-muted">L’agence publiera le carnet ici dès que le dossier sera prêt.</p>
      </article>
    );
  }

  const countdown = jMinusLabel(nextTrip.start_date);
  const tripHref = `/mon-compte/reservations/${nextTrip.reference}`;
  const arrival = places?.arrival[nextTrip.id];
  const route = places?.route[nextTrip.id];
  const layovers = places?.layovers[nextTrip.id];
  const tripName = listStayTitle(
    nextTrip.title,
    nextTrip.destination,
    arrival,
    route,
    layovers,
    "Prochain séjour",
    customer.city
  );
  const tripPlace = tripPlaceLine(
    tripName,
    listStayDestination(nextTrip.destination, arrival, route, layovers, customer.city)
  );

  return (
    <>
      <article className="account-press overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-xl">
        <BookingHero
          booking={toPublicBooking(nextTrip)}
          places={places?.arrival[nextTrip.id]}
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
      <Suspense fallback={<BoardingPassSkeleton />}>
        <HomeBoardingPass booking={nextTrip} />
      </Suspense>
    </>
  );
}
