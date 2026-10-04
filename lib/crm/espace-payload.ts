import type { FlightPass } from "./carnet";
import {
  clientBookingStatusLabel,
  clientVisibleItems,
  flightCities,
  flightIata,
  hotelCityLine,
  hotelDisplayName,
  itemClock,
  nextTimelineFlight,
  stayHeadline,
  tripPlaceLine,
} from "./carnet";
import { bookingCoverUrl } from "./covers";
import { isCompanyMember } from "./company-role";
import {
  encoursCaption,
  formatDateRangeShort,
  formatMoney,
  isUpcomingBooking,
  jMinusLabel,
} from "./money";
import { siteConfig } from "../site";
import type { CrmBalance, CrmBooking, CrmBookingItem, CrmCustomer } from "./types";
import { isLedgerExpenseKind } from "./types";

export type EspaceBalanceRow = {
  currency: string;
  value: number;
  label: string;
  caption: string;
};

export type EspaceTripCard = {
  id: string;
  reference: string;
  title: string;
  place: string | null;
  dates: string;
  countdown: string | null;
  status: string;
  cover: string | null;
  href: string;
};

export function espaceFileUrl(path: string | null | undefined) {
  const clean = (path || "").trim();
  if (!clean) return null;
  if (clean.startsWith("/api/") || clean.startsWith("https://")) return clean;
  return `/api/files?path=${encodeURIComponent(clean)}`;
}

export function espaceBalances(rows: CrmBalance[] | null | undefined, member: boolean): EspaceBalanceRow[] {
  if (member) return [];
  const list = (rows || []).map((row) => ({
    currency: row.currency || "EUR",
    value: Number(row.balance),
  }));
  const shown = list.length ? list : [{ currency: "EUR", value: 0 }];
  return shown.map((row) => ({
    currency: row.currency,
    value: row.value,
    label: formatMoney(row.value, row.currency),
    caption: encoursCaption(row.value),
  }));
}

export function espaceTripCard(
  booking: CrmBooking,
  places?: string[]
): EspaceTripCard {
  return {
    id: booking.id,
    reference: booking.reference,
    title: stayHeadline(booking.title, booking.destination, places, "Séjour"),
    place: tripPlaceLine(booking.title, booking.destination),
    dates: formatDateRangeShort(booking.start_date, booking.end_date),
    countdown: jMinusLabel(booking.start_date),
    status: clientBookingStatusLabel(booking.status),
    cover: espaceFileUrl(bookingCoverUrl(booking, 960, { places })) || bookingCoverUrl(booking, 960, { places }),
    href: `/mon-compte/reservations/${booking.reference}`,
  };
}

export function splitEspaceBookings(bookings: CrmBooking[]) {
  const upcoming = bookings.filter((b) => isUpcomingBooking(b.end_date) && b.status !== "cancelled");
  const past = bookings.filter(
    (b) => !isUpcomingBooking(b.end_date) || b.status === "completed" || b.status === "cancelled"
  );
  return { upcoming, past };
}

export function espaceHomeFlight(items: CrmBookingItem[]) {
  return nextTimelineFlight(clientVisibleItems(items));
}

export type EspaceTimelineCard = {
  id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  clock: string | null;
  day: string;
  amount: number | null;
  confirmation_ref: string | null;
};

export function espaceTimelineCards(items: CrmBookingItem[]): EspaceTimelineCard[] {
  return clientVisibleItems(items)
    .filter((item) => item.kind !== "fee" && !isLedgerExpenseKind(item.kind))
    .map((item) => {
      const day = (item.start_at || "").slice(0, 10);
      if (item.kind === "flight") {
        return {
          id: item.id,
          kind: item.kind,
          title: flightIata(item) || item.title,
          subtitle: flightCities(item) || null,
          clock: itemClock(item.start_at) || null,
          day,
          amount: item.amount,
          confirmation_ref: item.confirmation_ref,
        };
      }
      if (item.kind === "hotel") {
        return {
          id: item.id,
          kind: item.kind,
          title: hotelDisplayName(item),
          subtitle: hotelCityLine(item) || null,
          clock: null,
          day,
          amount: item.amount,
          confirmation_ref: item.confirmation_ref,
        };
      }
      return {
        id: item.id,
        kind: item.kind,
        title: item.title,
        subtitle: null,
        clock: itemClock(item.start_at) || null,
        day,
        amount: item.amount,
        confirmation_ref: item.confirmation_ref,
      };
    });
}

export function espaceWhatsappHref(text?: string) {
  const base = `https://wa.me/${siteConfig.whatsappNumber}`;
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function espaceMemberFlag(customer: Pick<CrmCustomer, "company_role">) {
  return isCompanyMember(customer);
}

export async function resolveEspaceMedia(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("/api/covers") || url.startsWith("https://")) return url;
  if (url.startsWith("/api/files")) {
    const path = new URL(url, "https://travelba.fr").searchParams.get("path");
    if (!path) return url;
    try {
      const { signedCrmUrl } = await import("./files");
      return await signedCrmUrl(path);
    } catch {
      return url;
    }
  }
  return url;
}

export function serializeFlightPass(pass: FlightPass | null) {
  if (!pass) return null;
  return {
    itemId: pass.itemId,
    airline: pass.airline,
    number: pass.number,
    time: pass.time,
    airports: pass.airports,
  };
}
