import { civilClock, timezoneForIata, zoneOffsetMinutes } from "./airport-time";
import { flightGate, flightTerminal, readFlightWatch } from "./flight-watch";
import type { LiveClock, LiveFlight } from "./next-flight-live";

export type LiveFlightItem = {
  supplier?: string | null;
  start_at: string | null;
  end_at: string | null;
  details: Record<string, unknown> | null;
};

function detail(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** HH:MM locale. Minuit et une date sans heure restent vides : on n’invente pas. */
export function flightHm(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const iso = raw.match(/T(\d{2}):(\d{2})/);
  if (iso) {
    if (iso[1] === "00" && iso[2] === "00") return "";
    return `${iso[1]}:${iso[2]}`;
  }
  const loose = raw.match(/^(\d{1,2})\s*[h:]\s*(\d{2})$/i);
  if (!loose) return "";
  const hour = loose[1].padStart(2, "0");
  if (hour === "00" && loose[2] === "00") return "";
  return `${hour}:${loose[2]}`;
}

function iata(value: string) {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function storedZone(value: unknown) {
  if (typeof value !== "string" || !value.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Instant UTC d’une heure déjà locale. Null si le fuseau de l’aéroport est inconnu. */
export function airportInstant(iso: string | null | undefined, zone: string | null) {
  const clock = civilClock(iso);
  if (!clock || !zone) return null;
  const offset = zoneOffsetMinutes(clock, zone);
  if (offset == null) return null;
  const match = clock.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
  return utc - offset * 60_000;
}

function clockPair(scheduledIso: string, revisedIso: string): LiveClock {
  const scheduled = flightHm(scheduledIso);
  const revised = flightHm(revisedIso);
  if (!revised || revised === scheduled) return { scheduled: scheduled || revised, revised: "" };
  return { scheduled, revised };
}

function boardingHm(details: Record<string, unknown> | null | undefined) {
  for (const key of ["boarding_time", "boarding_at", "embarquement"]) {
    const label = flightHm(detail(details, key));
    if (label) return label;
  }
  return "";
}

function labeled(value: string, word: "Porte" | "Terminal") {
  if (!value) return "";
  return value.toLowerCase().startsWith(word.toLowerCase()) ? value : `${word} ${value}`;
}

export function livePlaceLine(boarding: string, gate: string, terminal: string) {
  return [boarding ? `Embarquement ${boarding}` : "", labeled(gate, "Porte"), labeled(terminal, "Terminal")]
    .filter(Boolean)
    .join(" · ");
}

function operativeIso(scheduledIso: string, revisedIso: string) {
  const scheduled = flightHm(scheduledIso);
  const revised = flightHm(revisedIso);
  if (revised && revised !== scheduled) return revisedIso;
  return scheduledIso || revisedIso;
}

/** Vue de la carte à partir de la carte vol. Aucune heure n’est déduite. */
export function buildLiveFlight(item: LiveFlightItem): LiveFlight {
  const details = item.details || {};
  const watch = readFlightWatch(details);
  const origin = iata(detail(details, "from"));
  const destination = iata(detail(details, "to"));

  const scheduledOut = watch.scheduled_out || watch.sold_out || item.start_at || "";
  let revisedOut = watch.actual_out || "";
  if (!revisedOut && watch.estimated_out && flightHm(watch.estimated_out) !== flightHm(scheduledOut)) {
    revisedOut = watch.estimated_out;
  }
  if (!revisedOut && item.start_at && flightHm(item.start_at) !== flightHm(scheduledOut)) {
    revisedOut = item.start_at;
  }

  let arrival: LiveClock;
  let arrivalIso: string;
  if (!watch.scheduled_in) {
    arrivalIso = watch.actual_in || watch.estimated_in || item.end_at || "";
    arrival = { scheduled: flightHm(arrivalIso), revised: "" };
  } else {
    let revisedIn = watch.actual_in || "";
    if (!revisedIn && watch.estimated_in && flightHm(watch.estimated_in) !== flightHm(watch.scheduled_in)) {
      revisedIn = watch.estimated_in;
    }
    if (!revisedIn && item.end_at && flightHm(item.end_at) !== flightHm(watch.scheduled_in)) {
      revisedIn = item.end_at;
    }
    arrival = clockPair(watch.scheduled_in, revisedIn);
    arrivalIso = operativeIso(watch.scheduled_in, revisedIn);
  }

  const departure = clockPair(scheduledOut, revisedOut);
  const departureIso = operativeIso(scheduledOut, revisedOut);
  const departureZone = storedZone(details.departure_timezone) || timezoneForIata(origin);
  const arrivalZone = storedZone(details.arrival_timezone) || timezoneForIata(destination);
  const gate = flightGate({ start_at: item.start_at, end_at: item.end_at, details });
  const terminal = flightTerminal({ start_at: item.start_at, end_at: item.end_at, details });
  const boarding = boardingHm(details);
  const landedClock = flightHm(watch.actual_in) || arrival.revised || arrival.scheduled;
  const arrivalPrevue = flightHm(watch.estimated_in) || arrival.revised || arrival.scheduled;

  return {
    airline: detail(details, "airline") || (item.supplier || "").trim(),
    number: detail(details, "flight_number").toUpperCase().replace(/\s+/g, ""),
    origin,
    destination,
    departure,
    arrival,
    departureAt: airportInstant(departureIso, departureZone),
    arrivalAt: airportInstant(arrivalIso, arrivalZone),
    status: watch.status === "unknown" ? "" : watch.status,
    place: livePlaceLine(boarding, gate, terminal),
    arrivalPrevue,
    landedClock,
  };
}
