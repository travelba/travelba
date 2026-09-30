import {
  extraAgencyStatus,
  extraMomentOf,
  extraPlaceOf,
  extraServiceLeg,
  itineraryOffers,
  type ExtraKind,
} from "./extras";
import { checkinOpensAt } from "./flight-watch";

export type ServiceDeskItem = {
  id: string;
  booking_id: string;
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

export type ServiceDeskBooking = {
  id: string;
  reference: string;
  status: string;
  customer_id: string;
};

export type ServiceDeskLine = {
  itemId: string;
  bookingId: string;
  holderName: string;
  reference: string;
  kindLabel: string;
  detail: string;
  /** Enregistrement dont la fenêtre n’est pas encore ouverte. */
  later: boolean;
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    day: Number(get("day")),
    month: MONTHS[Number(get("month")) - 1] || "",
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Heure d’ouverture à Paris. Compagnie hors table : pas d’heure. */
export function checkinDeskNote(
  flights: { details?: Record<string, unknown> | null; start_at?: string | null }[],
  now: Date
) {
  const openings = flights
    .map((flight) => checkinOpensAt(flight.details, flight.start_at || null))
    .filter((opens): opens is Date => Boolean(opens))
    .sort((a, b) => a.getTime() - b.getTime());
  const earliest = openings[0];
  if (!earliest) return null;
  if (earliest.getTime() <= now.getTime()) return "ouvert";
  const clock = parisParts(earliest);
  return `dès le ${clock.day} ${clock.month} à ${clock.hour}h${clock.minute}`;
}

function joinDetail(parts: (string | null | undefined)[]) {
  return parts.map((part) => (part || "").trim()).filter(Boolean).join(" · ");
}

function headLine(details: Record<string, unknown> | null | undefined) {
  const adults = Number(details?.adults);
  const children = Number(details?.children);
  const parts: string[] = [];
  if (Number.isFinite(adults) && adults > 0) parts.push(`${adults} adulte${adults > 1 ? "s" : ""}`);
  if (Number.isFinite(children) && children > 0) parts.push(`${children} enfant${children > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function kindLabel(kind: string) {
  if (kind === "chauffeur") return "Transfert";
  if (kind === "greeter") return "VIP Airport";
  return "Enregistrement";
}

function openService(item: ServiceDeskItem) {
  if (item.kind === "chauffeur" || item.kind === "greeter" || item.kind === "checkin") {
    return extraAgencyStatus(item) !== "confirmed";
  }
  return false;
}

function lineDetail(item: ServiceDeskItem, siblings: ServiceDeskItem[], now: Date) {
  if (item.kind === "checkin") {
    const flights = siblings.filter((row) => row.kind === "flight");
    return { detail: checkinDeskNote(flights, now) || "", later: false, sortAt: item.start_at || "" };
  }
  const offers = itineraryOffers(siblings);
  const leg = extraServiceLeg(item);
  const place = item.kind === "chauffeur" ? extraPlaceOf(item) : null;
  const moment = item.kind === "greeter" ? extraMomentOf(item) : null;
  const offer = offers.find(
    (row) =>
      row.kind === (item.kind as ExtraKind) &&
      row.leg === leg &&
      (row.place || null) === place &&
      (row.moment || null) === moment
  );
  if (item.kind === "chauffeur") {
    const text = (key: string) => {
      const value = item.details?.[key];
      return typeof value === "string" && value.trim() ? value.trim() : "";
    };
    const pickup = text("pickup") || offer?.address || "";
    const dropAtHome = place === "home" && leg === "arrival";
    const depart = text("depart_address") || (dropAtHome ? offer?.airport || "" : pickup);
    const arrive = text("arrive_address") || (dropAtHome ? pickup : offer?.airport || "");
    return {
      detail: joinDetail([
        offer?.route || item.title,
        depart ? `Départ ${depart}` : null,
        arrive ? `Arrivée ${arrive}` : null,
        offer?.flightLine,
      ]),
      later: false,
      sortAt: item.start_at || offer?.whenIso || "",
    };
  }
  const momentLabel = moment === "arrive" ? "arrivée" : "départ";
  const flightLine = offer?.flightLine || "";
  return {
    detail: joinDetail([
      offer?.route,
      flightLine.includes(momentLabel) ? null : momentLabel,
      flightLine,
      headLine(item.details),
    ]),
    later: false,
    sortAt: item.start_at || offer?.whenIso || "",
  };
}

function checkinLater(item: ServiceDeskItem, siblings: ServiceDeskItem[], now: Date) {
  if (item.kind !== "checkin") return { later: false, sortAt: "" };
  const flights = siblings.filter((row) => row.kind === "flight");
  const openings = flights
    .map((flight) => checkinOpensAt(flight.details, flight.start_at || null))
    .filter((opens): opens is Date => Boolean(opens))
    .sort((a, b) => a.getTime() - b.getTime());
  const earliest = openings[0];
  if (!earliest || earliest.getTime() <= now.getTime()) return { later: false, sortAt: earliest?.toISOString() || "" };
  return { later: true, sortAt: earliest.toISOString() };
}

/** Demandes client encore ouvertes. Un service déjà confirmé par l’agence n’y figure pas. */
export function serviceDeskLines(input: {
  bookings: ServiceDeskBooking[];
  names: Record<string, string>;
  items: ServiceDeskItem[];
  now: Date;
}): ServiceDeskLine[] {
  const openBookings = input.bookings.filter((booking) => booking.status !== "cancelled");
  const byBooking = new Map<string, ServiceDeskItem[]>();
  for (const item of input.items) {
    const list = byBooking.get(item.booking_id) || [];
    list.push(item);
    byBooking.set(item.booking_id, list);
  }
  const lines: (ServiceDeskLine & { sortAt: string })[] = [];
  for (const booking of openBookings) {
    const siblings = byBooking.get(booking.id) || [];
    for (const item of siblings) {
      if (!openService(item)) continue;
      const described = lineDetail(item, siblings, input.now);
      const timing = item.kind === "checkin" ? checkinLater(item, siblings, input.now) : { later: false, sortAt: described.sortAt };
      lines.push({
        itemId: item.id,
        bookingId: booking.id,
        holderName: input.names[booking.customer_id] || "Client",
        reference: booking.reference,
        kindLabel: kindLabel(item.kind || ""),
        detail: described.detail,
        later: timing.later,
        sortAt: timing.sortAt || described.sortAt,
      });
    }
  }
  return lines
    .sort((a, b) => {
      if (a.later !== b.later) return a.later ? 1 : -1;
      return a.sortAt.localeCompare(b.sortAt) || a.reference.localeCompare(b.reference);
    })
    .map(({ sortAt: _sortAt, ...line }) => line);
}
