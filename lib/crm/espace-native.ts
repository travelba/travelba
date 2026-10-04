import { flightCities, flightIata, hotelDisplayName, itemClock } from "./carnet";
import { itemHasCalendarDate } from "./calendar-ics";
import { jMinusLabel } from "./money";
import type { CrmBooking, CrmBookingItem } from "./types";
import { isLedgerExpenseKind } from "./types";
import { serializeFlightPass } from "./espace-payload";
import { nextTimelineFlight, clientVisibleItems, stayHeadline } from "./carnet";

export type EspaceCalendarEvent = {
  id: string;
  title: string;
  notes: string;
  start: string;
  end: string | null;
  allDay: boolean;
};

export function espaceCalendarEvents(booking: CrmBooking, items: CrmBookingItem[]): EspaceCalendarEvent[] {
  const events: EspaceCalendarEvent[] = [];
  const stayStart = (booking.start_date || "").slice(0, 10);
  const stayEnd = (booking.end_date || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stayStart)) {
    events.push({
      id: `stay-${booking.id}`,
      title: `Séjour · ${booking.title || booking.reference}`,
      notes: [booking.reference, booking.destination].filter(Boolean).join(" · "),
      start: `${stayStart}T00:00:00`,
      end: /^\d{4}-\d{2}-\d{2}$/.test(stayEnd) ? `${stayEnd}T00:00:00` : null,
      allDay: true,
    });
  }
  for (const item of items) {
    if (!itemHasCalendarDate(item)) continue;
    const start = (item.start_at || "").slice(0, 10);
    const timed = Boolean(itemClock(item.start_at));
    const title =
      item.kind === "flight"
        ? `Vol ${flightIata(item) || item.title}`.trim()
        : item.kind === "hotel"
          ? `Hôtel · ${hotelDisplayName(item)}`
          : item.title;
    events.push({
      id: item.id,
      title,
      notes: [booking.reference, item.kind === "flight" ? flightCities(item) : "", item.confirmation_ref]
        .filter(Boolean)
        .join("\n"),
      start: timed ? item.start_at! : `${start}T00:00:00`,
      end: item.end_at || null,
      allDay: item.kind === "hotel" || !timed,
    });
  }
  return events;
}

export type EspaceWalletPass = {
  itemId: string;
  style: "boardingPass";
  organizationName: "Travel Business Agency";
  description: string;
  logoText: "TBA";
  header: string;
  primary: { label: string; value: string };
  secondary: { label: string; value: string }[];
  auxiliary: { label: string; value: string }[];
  back: { label: string; value: string }[];
};

export function espaceWalletPass(booking: CrmBooking, item: CrmBookingItem): EspaceWalletPass | null {
  if (item.kind !== "flight" || item.visible_to_client === false) return null;
  const route = flightIata(item) || item.title;
  const cities = flightCities(item);
  const clock = itemClock(item.start_at);
  return {
    itemId: item.id,
    style: "boardingPass",
    organizationName: "Travel Business Agency",
    description: `Vol ${route}`.trim(),
    logoText: "TBA",
    header: booking.reference,
    primary: { label: "Vol", value: route },
    secondary: [
      { label: "Compagnie", value: String(item.details?.airline || item.supplier || "TBA") },
      { label: "Heure", value: clock || "" },
    ].filter((row) => row.value),
    auxiliary: cities ? [{ label: "Trajet", value: cities }] : [],
    back: [
      { label: "Séjour", value: booking.title || booking.destination || booking.reference },
      { label: "Référence", value: item.confirmation_ref || booking.reference },
    ],
  };
}

export type EspacePushKind = "carnet" | "piece" | "formality" | "reminder";

export type EspacePushPayload = {
  title: string;
  body: string;
  data: { kind: EspacePushKind; path: string; reference?: string };
};

export function espacePushPayload(
  kind: EspacePushKind,
  input: { reference?: string; place?: string; label?: string }
): EspacePushPayload {
  const reference = input.reference || "";
  const path = reference ? `/mon-compte/reservations/${reference}` : "/mon-compte";
  if (kind === "carnet") {
    return {
      title: "Votre séjour est prêt",
      body: input.place ? `Le carnet ${input.place} est dans votre espace.` : "Le carnet est dans votre espace.",
      data: { kind, path, reference },
    };
  }
  if (kind === "piece") {
    return {
      title: "Une pièce vous attend",
      body: input.label || "L’agence a déposé un document.",
      data: { kind, path, reference },
    };
  }
  if (kind === "formality") {
    return {
      title: "Formalité",
      body: input.label || "Une étape de formalité a avancé.",
      data: { kind, path, reference },
    };
  }
  return {
    title: "Rappel de départ",
    body: input.place ? `${input.place} approche.` : "Votre départ approche.",
    data: { kind, path, reference },
  };
}

export type EspaceWidgetSnapshot = {
  greeting: string;
  countdown: string | null;
  title: string;
  place: string | null;
  flight: ReturnType<typeof serializeFlightPass>;
  path: string;
};

export function espaceWidgetSnapshot(input: {
  firstName: string;
  booking: CrmBooking | null;
  items: CrmBookingItem[];
}): EspaceWidgetSnapshot {
  if (!input.booking) {
    return {
      greeting: input.firstName,
      countdown: null,
      title: "Aucun voyage planifié",
      place: null,
      flight: null,
      path: "/mon-compte",
    };
  }
  return {
    greeting: input.firstName,
    countdown: jMinusLabel(input.booking.start_date),
    title: stayHeadline(input.booking.title, input.booking.destination, undefined, "Prochain séjour"),
    place: input.booking.destination,
    flight: serializeFlightPass(nextTimelineFlight(clientVisibleItems(input.items))),
    path: `/mon-compte/reservations/${input.booking.reference}`,
  };
}

export function espaceLiveActivity(input: { booking: CrmBooking; items: CrmBookingItem[] }) {
  const flight = nextTimelineFlight(clientVisibleItems(input.items));
  if (!flight) return null;
  return {
    kind: "flight" as const,
    reference: input.booking.reference,
    route: flight.airports || `${flight.airline} ${flight.number}`.trim(),
    time: flight.time,
    title: stayHeadline(input.booking.title, input.booking.destination, undefined, "Séjour"),
  };
}

export function espaceOfflineKeys(customerId: string) {
  return {
    session: `tb.espace.session.${customerId}`,
    home: `tb.espace.home.${customerId}`,
    bookings: `tb.espace.bookings.${customerId}`,
    profile: `tb.espace.profile.${customerId}`,
    widget: `tb.espace.widget.${customerId}`,
  };
}

export function isCacheableCarnet(booking: Pick<CrmBooking, "visible_to_client" | "status">) {
  return booking.visible_to_client === true && booking.status !== "cancelled";
}
