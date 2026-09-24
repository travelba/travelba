import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureCustomerForUser, getSessionUser } from "@/lib/crm/auth";
import type { CrmBalance } from "@/lib/crm/types";
import { encoursCaption, formatDateRangeShort, formatMoney, isUpcomingBooking, jMinusLabel } from "@/lib/crm/money";
import { isCompanyMember } from "@/lib/crm/company-role";
import { loadVisibleCarnets, sortBookingsByStart } from "@/lib/crm/carnet-query";
import { tripHeadline, tripPlaceLine } from "@/lib/crm/carnet";
import { BookingHero } from "@/components/crm/BookingHero";
import { Icon } from "@/components/crm/icons";
import { ConciergeBanner } from "@/components/crm/ui";
import { greetingGivenName } from "@/lib/crm/identity";
import { destinationWeather } from "@/lib/crm/destination-weather";

export default async function AccountHomePage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/connexion");
  const customer = await ensureCustomerForUser(user);
  if (!customer) redirect("/connexion");

  const member = isCompanyMember(customer);
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

  const balanceRows = ((balances || []) as CrmBalance[]).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shownBalances = balanceRows.length ? balanceRows : [{ currency: "EUR", value: 0 }];
  const owes = shownBalances.some((row) => row.value < 0);
  const firstName = greetingGivenName(customer.first_name) || customer.email.split("@")[0];
  const countdown = nextTrip ? jMinusLabel(nextTrip.start_date) : null;
  const tripName = nextTrip
    ? tripHeadline(nextTrip.title, nextTrip.destination, "Prochain séjour")
    : "";
  const tripPlace = nextTrip ? tripPlaceLine(nextTrip.title, nextTrip.destination) : null;
  const tripHref = nextTrip ? `/mon-compte/reservations/${nextTrip.reference}` : "/mon-compte/reservations";
  const weather = nextTrip
    ? await destinationWeather(nextTrip.destination, nextTrip.title)
    : null;

  return (
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
          className="flex h-11 items-center justify-between rounded-2xl border border-[var(--admin-gold)]/55 bg-white px-4 text-sm font-semibold text-[var(--admin-navy)] shadow-sm"
        >
          Voir les frais de vos voyages
          <Icon name="arrow_forward" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        </Link>
      ) : (
        <Link
          href="/mon-compte/transactions"
          className={`block rounded-2xl border p-4 shadow-sm ${
            owes ? "border-[var(--admin-gold)] bg-[#f8f3eb]" : "border-[#e5e3dc] bg-white"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Encours</p>
          <ul className="mt-2 space-y-2">
            {shownBalances.map((row) => (
              <li key={row.currency}>
                <p className="font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
                  {formatMoney(row.value, row.currency)}
                </p>
                <p className="text-xs text-muted">
                  {row.value > 0 ? "Crédit disponible · frais d’agence 10 % déduits" : encoursCaption(row.value)}
                </p>
              </li>
            ))}
          </ul>
        </Link>
      )}

      {nextTrip ? (
        <article className="overflow-hidden rounded-2xl border border-[#e5e3dc] shadow-xl">
          <BookingHero booking={nextTrip} priority frameClassName="relative h-[22rem] w-full">
            {countdown ? (
              <p className="absolute left-5 top-5 z-10 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--admin-gold)]/30 bg-white/95 px-3 py-1 text-[12px] font-semibold text-[var(--admin-navy)] shadow-sm">
                <Icon name="timer" className="h-[15px] w-[15px] text-[var(--admin-gold)]" />
                <span className="font-bold">{countdown}</span>
                {countdown.startsWith("J") ? <span className="font-normal text-[#5a5c60]">avant l’envol</span> : null}
              </p>
            ) : null}
            {weather ? (
              <p className="absolute right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/90 px-3 py-1 text-[12px] font-semibold text-[var(--admin-navy)] shadow-sm">
                <Icon name={weather.icon} className="h-[15px] w-[15px] text-[var(--admin-gold)]" />
                <span className="font-bold">{weather.tempC}°</span>
                <span className="font-normal text-[#5a5c60]">{weather.label}</span>
              </p>
            ) : null}
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-gold)]">
                  <Icon name="flight_takeoff" className="h-3.5 w-3.5" />
                  {formatDateRangeShort(nextTrip.start_date, nextTrip.end_date)}
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-white">{tripName}</h2>
                {tripPlace ? <p className="line-clamp-2 text-[13px] text-white/80">{tripPlace}</p> : null}
              </div>
              <Link
                href={tripHref}
                className="ml-auto flex h-12 w-fit items-center gap-3 rounded-full bg-white px-5 text-sm font-semibold text-[var(--admin-navy)] shadow-md"
              >
                Accéder à ma réservation
                <Icon name="arrow_forward" className="h-5 w-5 text-[var(--admin-gold)]" />
              </Link>
            </div>
          </BookingHero>
        </article>
      ) : (
        <article className="rounded-2xl border border-[#e5e3dc] bg-white p-5 shadow-sm">
          <h2 className="font-display text-xl font-bold text-[var(--admin-navy)]">Aucun voyage planifié</h2>
          <p className="mt-1 text-sm text-muted">L’agence publiera le carnet ici dès que le dossier sera prêt.</p>
        </article>
      )}

      <ConciergeBanner />
    </div>
  );
}
