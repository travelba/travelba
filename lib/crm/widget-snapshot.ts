import { isActiveItem } from "./types";
import { formatDateRangeShort } from "./money";
import { buildLiveFlight } from "./next-flight-model";
import { liveFlightPhase } from "./next-flight-live";
import {
  flightActivityModel,
  flightActivityRoute,
  liveActivityOpen,
  type FlightActivityAttributes,
  type FlightActivityState,
} from "./live-activity";

export type WidgetWeather = {
  place: string;
  tempC: number;
  label: string;
  icon: string;
};

export type WidgetTrip = {
  title: string;
  when: string;
  href: string;
  countdown: string;
  departureAt: number | null;
};

export type WidgetFlight = {
  number: string;
  route: string;
  codes: string;
  time: string;
  scheduled: string;
  estimated: string;
  gate: string;
  terminal: string;
  status: string;
  place: string;
};

export type WidgetLive = {
  itemId: string;
  ending: boolean;
  attributes: FlightActivityAttributes;
  state: FlightActivityState;
};

/** Contrat JSON lu par l’extension WidgetKit. Pas de prix, pas de pièce, pas de contact. */
export type WidgetSnapshot = {
  updatedAt: string;
  trip: WidgetTrip | null;
  flight: WidgetFlight | null;
  weather: WidgetWeather | null;
  live: WidgetLive | null;
};

export type WidgetItem = {
  id: string;
  kind?: string | null;
  supplier?: string | null;
  start_at: string | null;
  end_at: string | null;
  details: Record<string, unknown> | null;
  visible_to_client?: boolean | null;
  lifecycle?: string | null;
};

const STATUS_FR: Record<string, string> = {
  scheduled: "À l’heure",
  delayed: "Retard",
  cancelled: "Annulé",
  diverted: "Dérouté",
  en_route: "En vol",
  landed: "Arrivé",
  boarding: "Embarquement",
  unknown: "Prévu",
};

function clip(value: string, max: number) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** « J - 12 », « Aujourd’hui », ou vide si le départ est passé. Le jour est celui de Paris. */
export function stayCountdownLabel(startDate: string | null | undefined, today: string) {
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return "";
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const day = Date.parse(`${today}T12:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(day)) return "";
  const count = Math.round((start - day) / 86400000);
  if (count < 0) return "";
  if (count === 0) return "Aujourd’hui";
  return `J - ${count}`;
}

export function tripWidgetHref(reference: string) {
  if (!/^[A-Za-z0-9-]{4,40}$/.test(reference)) return "/mon-compte";
  return `/mon-compte/reservations/${reference}`;
}

function labeled(value: string, word: "Porte" | "Terminal") {
  if (!value) return "";
  return value.toLowerCase().startsWith(word.toLowerCase()) ? value : `${word} ${value}`;
}

function relevantFlight(items: WidgetItem[], now: number, today: string) {
  const flights = items
    .filter(
      (item) =>
        item.kind === "flight" &&
        item.visible_to_client !== false &&
        isActiveItem(item) &&
        Boolean(item.id)
    )
    .slice()
    .sort((a, b) => (a.start_at || "").localeCompare(b.start_at || ""));
  return (
    flights.find((item) => {
      const live = buildLiveFlight(item);
      if (!live.number) return false;
      const phase = liveFlightPhase(live, now);
      const open = liveActivityOpen(live, now);
      if ((phase === "landed" || phase === "cancelled") && !open) return false;
      if (phase === "landed" || phase === "cancelled" || phase === "airborne" || open) return true;
      const day = (item.start_at || "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= today;
    }) || null
  );
}

export function emptyWidgetSnapshot(now = new Date()): WidgetSnapshot {
  return {
    updatedAt: now.toISOString(),
    trip: null,
    flight: null,
    weather: null,
    live: null,
  };
}

export function buildWidgetSnapshot(input: {
  now: Date;
  today: string;
  stay: null | {
    title: string;
    startDate: string | null;
    endDate: string | null;
    href: string;
    items: WidgetItem[];
  };
  weather: WidgetWeather | null;
}): WidgetSnapshot {
  const nowMs = input.now.getTime();
  const base = emptyWidgetSnapshot(input.now);
  const weather =
    input.weather && input.weather.place && input.weather.place !== "voyage"
      ? {
          place: clip(input.weather.place, 40),
          tempC: Math.round(input.weather.tempC),
          label: clip(input.weather.label, 24),
          icon: clip(input.weather.icon, 24),
        }
      : null;
  if (!input.stay) return { ...base, weather };

  const flightItem = relevantFlight(input.stay.items, nowMs, input.today);
  const model = flightItem ? flightActivityModel(flightItem, nowMs) : null;
  const liveFlight = flightItem ? buildLiveFlight(flightItem) : null;
  const countdown = stayCountdownLabel(input.stay.startDate, input.today);
  const trip: WidgetTrip = {
    title: clip(input.stay.title, 80) || "Prochain séjour",
    when: clip(formatDateRangeShort(input.stay.startDate, input.stay.endDate), 48),
    href: input.stay.href.startsWith("/mon-compte") ? input.stay.href.slice(0, 180) : "/mon-compte",
    countdown: countdown || (input.stay.startDate && input.stay.startDate < input.today ? "En voyage" : ""),
    departureAt: liveFlight?.departureAt ?? null,
  };

  let flight: WidgetFlight | null = null;
  if (flightItem && model && liveFlight) {
    const details = flightItem.details || {};
    const route = flightActivityRoute(details);
    const gate = model.state.gate;
    const terminal = model.state.terminal;
    const place = [labeled(terminal, "Terminal"), labeled(gate, "Porte")].filter(Boolean).join(" · ");
    flight = {
      number: model.attributes.flightNumber,
      route: route.route,
      codes: route.codes,
      time: model.attributes.estimatedDeparture || model.attributes.scheduledDeparture,
      scheduled: model.attributes.scheduledDeparture,
      estimated: model.attributes.estimatedDeparture,
      gate,
      terminal,
      status: STATUS_FR[model.state.status] || "Prévu",
      place,
    };
  }

  const live: WidgetLive | null =
    flightItem && model && model.event !== "none"
      ? {
          itemId: flightItem.id,
          ending: model.event === "end",
          attributes: model.attributes,
          state: model.state,
        }
      : null;

  return {
    updatedAt: input.now.toISOString(),
    trip,
    flight,
    weather,
    live,
  };
}

/** Les champs lus par Swift. Un prix ou une pièce ne doit pas s’y glisser. */
export const WIDGET_FLIGHT_KEYS = [
  "number",
  "route",
  "codes",
  "time",
  "scheduled",
  "estimated",
  "gate",
  "terminal",
  "status",
  "place",
] as const;

export const WIDGET_LIVE_STATE_KEYS = ["status", "gate", "terminal", "delayMinutes", "boardingCountdown"] as const;
