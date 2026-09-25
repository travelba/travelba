import Link from "next/link";
import { BookingHero } from "@/components/crm/BookingHero";
import { Icon } from "@/components/crm/icons";
import { ConciergeBanner } from "@/components/crm/ui";
import { tripHeadline, tripPlaceLine } from "@/lib/crm/carnet";
import { destinationWeather } from "@/lib/crm/destination-weather";
import { EXAMPLE_BASE } from "@/lib/crm/example-session";
import { readExample } from "@/lib/crm/example-store";

export const dynamic = "force-dynamic";
import { greetingGivenName } from "@/lib/crm/identity";
import { encoursCaption, formatDateRangeShort, formatMoney, jMinusLabel } from "@/lib/crm/money";

export default async function ExampleHomePage() {
  const session = readExample();
  const nextTrip = session.booking;
  const balance = session.ledger.balanceValue;
  const firstName = greetingGivenName(session.customer.first_name) || "Camille";
  const countdown = jMinusLabel(nextTrip.start_date);
  const tripName = tripHeadline(nextTrip.title, nextTrip.destination, "Prochain séjour");
  const tripPlace = tripPlaceLine(nextTrip.title, nextTrip.destination);
  const tripHref = `${EXAMPLE_BASE}/reservations/${nextTrip.reference}`;
  const weather = await destinationWeather(nextTrip.destination, nextTrip.title);

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

      <Link
        href={`${EXAMPLE_BASE}/transactions`}
        className="block rounded-2xl border border-[var(--admin-gold)] bg-[#f8f3eb] p-4 shadow-sm transition hover:border-[var(--admin-gold)]"
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9e7e51]">Encours</p>
        <p className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--admin-navy)]">
          {formatMoney(balance, "EUR")}
        </p>
        <p className="text-xs text-muted">{encoursCaption(balance)}</p>
        <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-navy)]">
          Voir les transactions
          <Icon name="arrow_forward" className="h-3.5 w-3.5 text-[var(--admin-gold-dark)]" />
        </p>
      </Link>

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

      <ConciergeBanner />
    </div>
  );
}
