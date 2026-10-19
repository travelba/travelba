import { cache } from "react";
import { headers } from "next/headers";
import { BoardingPass } from "@/components/account/BoardingPass";
import { Icon } from "@/components/crm/icons";
import { chosenCalendarHref, googleCalendarHref, itemCalendarHref } from "@/lib/crm/calendar-ics";
import { clientVisibleItems, nextTimelineFlight, tripPlaceLine } from "@/lib/crm/carnet";
import { destinationWeather } from "@/lib/crm/destination-weather";
import { nextStayLabels } from "@/lib/crm/staff-stay";
import { getSessionUser } from "@/lib/crm/auth";
import type { CrmBooking, CrmBookingItem } from "@/lib/crm/types";

const homeTripItems = cache(async (bookingId: string) => {
  const { supabase } = await getSessionUser();
  const { data } = await supabase
    .from("crm_booking_items")
    .select("*")
    .eq("booking_id", bookingId)
    .order("sort_order");
  return clientVisibleItems((data || []) as CrmBookingItem[]);
});

export function WeatherChipSkeleton() {
  return <span className="inline-flex h-7 w-32 animate-pulse rounded-full bg-white/70" aria-hidden />;
}

export function BoardingPassSkeleton() {
  return <div className="h-[148px] animate-pulse rounded-2xl bg-[#0B192C]/10" aria-hidden />;
}

export async function HomeWeatherChip({
  destination,
  title,
}: {
  destination: string | null;
  title: string | null;
}) {
  const weather = await destinationWeather(destination, title);
  if (!weather) return null;
  return (
    <p className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/40 bg-white/90 px-3 py-1 text-[12px] font-semibold text-[var(--admin-navy)] shadow-sm">
      <Icon name={weather.icon} className="h-[15px] w-[15px] shrink-0 text-[var(--admin-gold)]" />
      <span className="font-bold">{weather.tempC}°</span>
      <span className="font-normal text-[#5a5c60]">{weather.label}</span>
    </p>
  );
}

export async function HomeDepartureWord({ bookingId }: { bookingId: string }) {
  const rows = await homeTripItems(bookingId);
  const flight = nextTimelineFlight(rows);
  return (
    <span className="font-normal text-[#5a5c60]">{flight ? "avant l’envol" : "avant le départ"}</span>
  );
}

export async function HomeTripHeading({
  bookingId,
  title,
  destination,
}: {
  bookingId: string;
  title: string | null;
  destination: string | null;
}) {
  const rows = await homeTripItems(bookingId);
  const labels = nextStayLabels(title, destination, rows, "Prochain séjour");
  const tripName = labels.title || "Prochain séjour";
  const tripPlace = tripPlaceLine(tripName, labels.destination);
  return (
    <>
      <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-white">{tripName}</h2>
      {tripPlace ? <p className="line-clamp-2 text-[13px] text-white/80">{tripPlace}</p> : null}
    </>
  );
}

export async function HomeBoardingPass({ booking }: { booking: CrmBooking }) {
  const rows = await homeTripItems(booking.id);
  const homeFlight = nextTimelineFlight(rows);
  if (!homeFlight) return null;
  const flightItem = rows.find((row) => row.id === homeFlight.itemId) || null;
  const headerList = await headers();
  const phone = flightItem ? { google: googleCalendarHref(flightItem, booking) } : null;
  const calendarHref = chosenCalendarHref(
    itemCalendarHref(`/mon-compte/reservations/${booking.reference}/agenda.ics`, homeFlight.itemId),
    phone,
    headerList.get("user-agent") || ""
  );
  return <BoardingPass pass={homeFlight} calendarHref={calendarHref} googleHref={phone?.google} />;
}
