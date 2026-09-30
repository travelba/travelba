import { airlineIataFromFlightNumber } from "./brand-marks";

/** 0,005 $ par jeu de résultats. 200 appels couvrent la journée, soit 1 $. */
export const AEROAPI_DAILY_CALL_CAP = 200;
export const AEROAPI_RESULT_USD = 0.005;
const SHIFT_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const AEROAPI_ORIGIN = "https://aeroapi.flightaware.com/aeroapi";

/**
 * Ouverture de l’enregistrement en ligne, en heures avant le départ.
 * Seulement les compagnies dont la fenêtre est publique et stable.
 * Les autres ne déclenchent pas de message.
 */
const CHECKIN_LEAD_HOURS: Record<string, number> = {
  AF: 30,
  KL: 30,
  DL: 24,
  BA: 24,
  EK: 48,
  QR: 48,
  TO: 30,
  HV: 30,
  FR: 24,
  U2: 30 * 24,
};

export type FlightWatchStatus =
  | "scheduled"
  | "delayed"
  | "cancelled"
  | "diverted"
  | "en_route"
  | "landed"
  | "unknown";

export type FlightNoticeKind =
  | "horaire"
  | "annule"
  | "enregistrement"
  | "retard"
  | "deroute"
  | "envol"
  | "arrivee";

export type FlightWatch = {
  status: FlightWatchStatus;
  /** Phrase AeroAPI, telle quelle. */
  phrase: string;
  fa_flight_id: string;
  sold_out: string;
  scheduled_out: string;
  estimated_out: string;
  gate: string;
  terminal: string;
  checked_at: string;
  notified_out: string;
  notified_cancel: boolean;
  notified_divert: boolean;
  notified_airborne: boolean;
  notified_arrival: boolean;
  checkin_notified_at: string;
  checkin_attempt_at: string;
};

export type AeroFlight = {
  ident: string;
  faFlightId: string;
  cancelled: boolean;
  diverted: boolean;
  status: string;
  scheduledOut: string | null;
  estimatedOut: string | null;
  actualOut: string | null;
  scheduledIn: string | null;
  estimatedIn: string | null;
  departureDelay: number | null;
  originIata: string;
  destinationIata: string;
  originTimezone: string;
  destinationTimezone: string;
  gateOrigin: string;
  terminalOrigin: string;
};

export type FlightCard = {
  id?: string;
  kind?: string;
  start_at: string | null;
  end_at: string | null;
  details: Record<string, unknown>;
};

export type FlightPatch = {
  start_at: string | null;
  end_at: string | null;
  details: Record<string, unknown>;
  event: FlightNoticeKind | null;
  changed: boolean;
};

type BudgetExtra = { day?: string; calls?: number };

function detail(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function flightIdent(details: Record<string, unknown> | null | undefined) {
  const raw = detail(details, "flight_number").toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{2}\d{1,4}$/.test(raw)) return null;
  return raw;
}

export function airlineForCheckin(details: Record<string, unknown> | null | undefined) {
  const stored = detail(details, "airline_iata").toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(stored)) return stored;
  return airlineIataFromFlightNumber(detail(details, "flight_number"));
}

export function readFlightWatch(details: Record<string, unknown> | null | undefined): FlightWatch {
  const raw = details?.flight_watch;
  const watch = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = (key: string) => (typeof watch[key] === "string" ? String(watch[key]) : "");
  return {
    status: (text("status") || "unknown") as FlightWatchStatus,
    phrase: text("phrase"),
    fa_flight_id: text("fa_flight_id"),
    sold_out: text("sold_out"),
    scheduled_out: text("scheduled_out"),
    estimated_out: text("estimated_out"),
    gate: text("gate"),
    terminal: text("terminal"),
    checked_at: text("checked_at"),
    notified_out: text("notified_out"),
    notified_cancel: watch.notified_cancel === true,
    notified_divert: watch.notified_divert === true,
    notified_airborne: watch.notified_airborne === true,
    notified_arrival: watch.notified_arrival === true,
    checkin_notified_at: text("checkin_notified_at"),
    checkin_attempt_at: text("checkin_attempt_at"),
  };
}

export function parisDay(now: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function reserveAeroBudget(extra: BudgetExtra | null | undefined, now: Date, cap = AEROAPI_DAILY_CALL_CAP) {
  const day = parisDay(now);
  const calls = extra?.day === day ? Number(extra.calls) || 0 : 0;
  if (calls >= cap) return { ok: false as const, extra: { day, calls } };
  return { ok: true as const, extra: { day, calls: calls + 1 } };
}

export function clockMs(value: string | null | undefined) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

export function shifted(left: string | null | undefined, right: string | null | undefined) {
  const a = clockMs(left);
  const b = clockMs(right);
  if (a == null || b == null) return false;
  return Math.abs(a - b) >= SHIFT_MS;
}

/** Heure locale de l’aéroport, sans suffixe, comme les horaires déjà saisis sur la carte. */
export function airportLocalIso(utcIso: string | null | undefined, timeZone: string | null | undefined) {
  if (!utcIso || !timeZone) return null;
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    return null;
  }
  const pick = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  const hour = pick("hour");
  const minute = pick("minute");
  if (!year || !month || !day || !hour || !minute) return null;
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

export function pollIntervalMs(startAt: string | null, now: Date) {
  const start = startAt ? Date.parse(startAt) : Number.NaN;
  if (!Number.isFinite(start)) return 12 * HOUR_MS;
  const hours = (start - now.getTime()) / HOUR_MS;
  if (hours <= 3) return HOUR_MS;
  if (hours <= 12) return 4 * HOUR_MS;
  return 12 * HOUR_MS;
}

export function inAeroWindow(startAt: string | null, now: Date) {
  const start = startAt ? Date.parse(startAt) : Number.NaN;
  if (!Number.isFinite(start)) return false;
  const delta = start - now.getTime();
  return delta >= -18 * HOUR_MS && delta <= 48 * HOUR_MS;
}

export function pollDue(item: FlightCard, now: Date) {
  if (!inAeroWindow(item.start_at, now)) return false;
  const watch = readFlightWatch(item.details);
  if (watch.status === "landed" && watch.notified_arrival) return false;
  if (watch.status === "cancelled" && watch.notified_cancel) return false;
  if (!watch.checked_at) return true;
  const checked = Date.parse(watch.checked_at);
  if (!Number.isFinite(checked)) return true;
  return now.getTime() - checked >= pollIntervalMs(item.start_at, now);
}

export function checkinOpensAt(details: Record<string, unknown> | null | undefined, startAt: string | null) {
  const lead = CHECKIN_LEAD_HOURS[airlineForCheckin(details) || ""];
  const start = startAt ? Date.parse(startAt) : Number.NaN;
  if (!lead || !Number.isFinite(start)) return null;
  return new Date(start - lead * HOUR_MS);
}

export function checkinOpen(item: FlightCard, now: Date) {
  if (readFlightWatch(item.details).status === "cancelled") return false;
  const opens = checkinOpensAt(item.details, item.start_at);
  if (!opens) return false;
  return opens.getTime() <= now.getTime();
}

export function checkinAttemptDue(item: FlightCard, now: Date, agencyCheckin = false) {
  if (agencyCheckin) return false;
  if (!checkinOpen(item, now)) return false;
  const watch = readFlightWatch(item.details);
  if (watch.checkin_notified_at) return false;
  if (!watch.checkin_attempt_at) return true;
  const attempt = Date.parse(watch.checkin_attempt_at);
  if (!Number.isFinite(attempt)) return true;
  return now.getTime() - attempt >= 24 * HOUR_MS;
}

export function flightWatchBadge(item: FlightCard, now: Date) {
  if (item.kind && item.kind !== "flight") return "";
  const watch = readFlightWatch(item.details);
  if (watch.status === "cancelled") return "Annulé";
  if (watch.status === "diverted") return "Dérouté";
  if (watch.status === "landed") return "Arrivé";
  if (watch.status === "en_route") return "En vol";
  if (watch.status === "delayed") return "Retard";
  if (watch.sold_out && shifted(watch.sold_out, item.start_at)) return "Horaire modifié";
  if (checkinOpen(item, now)) return "Enregistrement ouvert";
  return "";
}

export function flightGate(item: FlightCard) {
  return detail(item.details, "gate") || readFlightWatch(item.details).gate;
}

export function flightTerminal(item: FlightCard) {
  return detail(item.details, "terminal") || readFlightWatch(item.details).terminal;
}

function watchStatus(flight: AeroFlight, delayMs: number): FlightWatchStatus {
  const status = flight.status.toLowerCase();
  if (status.includes("cancel")) return "cancelled";
  if (flight.diverted || status.includes("divert")) return "diverted";
  if (status.includes("land") || status.includes("arriv")) return "landed";
  if (status.includes("en route") || status.includes("enroute")) return "en_route";
  if (delayMs >= SHIFT_MS || status.includes("delay")) return "delayed";
  if (status.includes("schedul") || status.includes("on time")) return "scheduled";
  return "unknown";
}

function closestFlight(flights: AeroFlight[], start: number | null) {
  let best: AeroFlight | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const flight of flights) {
    const local = airportLocalIso(flight.scheduledOut || flight.estimatedOut, flight.originTimezone);
    const localMs = clockMs(local);
    if (start == null || localMs == null) continue;
    const delta = Math.abs(localMs - start);
    if (delta < bestDelta) {
      best = flight;
      bestDelta = delta;
    }
  }
  if (!best || bestDelta > 18 * HOUR_MS) return null;
  return best;
}

export function matchAeroFlight(item: FlightCard, flights: AeroFlight[]) {
  const known = readFlightWatch(item.details).fa_flight_id;
  if (known) {
    const same = flights.find((flight) => flight.faFlightId === known);
    if (same) return same;
  }
  const from = detail(item.details, "from").toUpperCase();
  const to = detail(item.details, "to").toUpperCase();
  if (!from || !to) return null;
  const start = clockMs(item.start_at);
  const routed = closestFlight(
    flights.filter(
      (flight) => flight.originIata.toUpperCase() === from && flight.destinationIata.toUpperCase() === to
    ),
    start
  );
  if (routed) return routed;
  return closestFlight(
    flights.filter((flight) => flight.diverted && flight.originIata.toUpperCase() === from),
    start
  );
}

export function applyAeroFlight(item: FlightCard, flight: AeroFlight | null, now: Date): FlightPatch {
  const previous = readFlightWatch(item.details);
  const checked_at = now.toISOString();
  if (!flight) {
    const details = {
      ...item.details,
      flight_watch: { ...previous, checked_at },
    };
    return { start_at: item.start_at, end_at: item.end_at, details, event: null, changed: true };
  }

  const departureUtc = flight.estimatedOut || flight.scheduledOut;
  const localOut = airportLocalIso(departureUtc, flight.originTimezone);
  const scheduledLocal = airportLocalIso(flight.scheduledOut, flight.originTimezone);
  const delayMs = Math.max(0, (flight.departureDelay || 0) * 1000);
  const status = watchStatus(flight, delayMs);
  const sold_out = previous.sold_out || item.start_at || "";
  let start_at = item.start_at;
  if (status !== "cancelled" && localOut && shifted(item.start_at, localOut)) start_at = localOut;

  let end_at = item.end_at;
  const arrivalUtc = flight.estimatedIn || flight.scheduledIn;
  const localIn = airportLocalIso(arrivalUtc, flight.destinationTimezone);
  if (localIn && (!end_at || shifted(end_at, localIn))) end_at = localIn;

  const details: Record<string, unknown> = {
    ...item.details,
    flight_watch: {
      ...previous,
      status,
      phrase: flight.status,
      fa_flight_id: flight.faFlightId,
      sold_out,
      scheduled_out: scheduledLocal || previous.scheduled_out,
      estimated_out: localOut || "",
      gate: flight.gateOrigin || previous.gate,
      terminal: flight.terminalOrigin || previous.terminal,
      checked_at,
    },
  };
  if (!detail(item.details, "gate") && flight.gateOrigin) details.gate = flight.gateOrigin;
  if (!detail(item.details, "terminal") && flight.terminalOrigin) details.terminal = flight.terminalOrigin;

  const changed =
    start_at !== item.start_at ||
    end_at !== item.end_at ||
    status !== previous.status ||
    (flight.gateOrigin && flight.gateOrigin !== previous.gate) ||
    !previous.checked_at ||
    flight.status !== previous.phrase;
  const event = pendingFlightNotices({ ...item, start_at, end_at, details })[0] ?? null;
  return { start_at, end_at, details, event, changed };
}

export function pendingFlightNotices(item: FlightCard): FlightNoticeKind[] {
  const watch = readFlightWatch(item.details);
  if (watch.status === "cancelled") return watch.notified_cancel ? [] : ["annule"];
  const events: FlightNoticeKind[] = [];
  if (watch.status === "diverted" && !watch.notified_divert) events.push("deroute");
  const departure = watch.estimated_out || item.start_at;
  if (watch.status === "delayed" && departure && watch.notified_out !== departure && flightClockLabel(departure)) {
    events.push("retard");
  } else if (
    watch.status !== "delayed" &&
    watch.status !== "diverted" &&
    watch.status !== "en_route" &&
    watch.status !== "landed" &&
    watch.sold_out &&
    shifted(watch.sold_out, item.start_at) &&
    item.start_at &&
    watch.notified_out !== item.start_at &&
    flightClockLabel(item.start_at)
  ) {
    events.push("horaire");
  }
  if (watch.status === "en_route" && !watch.notified_airborne) events.push("envol");
  if (watch.status === "landed" && !watch.notified_arrival) events.push("arrivee");
  return events;
}

export function markFlightNotified(
  details: Record<string, unknown>,
  event: FlightNoticeKind,
  startAt: string | null,
  now: Date
) {
  const previous = readFlightWatch(details);
  const flight_watch = { ...previous };
  if (event === "annule") flight_watch.notified_cancel = true;
  if ((event === "horaire" || event === "retard") && startAt) flight_watch.notified_out = startAt;
  if (event === "deroute") flight_watch.notified_divert = true;
  if (event === "envol") flight_watch.notified_airborne = true;
  if (event === "arrivee") flight_watch.notified_arrival = true;
  if (event === "enregistrement") flight_watch.checkin_notified_at = now.toISOString();
  flight_watch.checkin_attempt_at =
    event === "enregistrement" ? now.toISOString() : previous.checkin_attempt_at;
  return { ...details, flight_watch };
}

export function markCheckinAttempt(details: Record<string, unknown>, now: Date) {
  const previous = readFlightWatch(details);
  return { ...details, flight_watch: { ...previous, checkin_attempt_at: now.toISOString() } };
}

export function aeroFlightUrl(ident: string, now: Date) {
  const url = new URL(`${AEROAPI_ORIGIN}/flights/${encodeURIComponent(ident)}`);
  url.searchParams.set("start", new Date(now.getTime() - 12 * HOUR_MS).toISOString());
  url.searchParams.set("end", new Date(now.getTime() + 47 * HOUR_MS).toISOString());
  url.searchParams.set("max_pages", "1");
  return url;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function airport(value: unknown, field: "code_iata" | "timezone") {
  if (!value || typeof value !== "object") return "";
  return text((value as Record<string, unknown>)[field]);
}

export function parseAeroFlights(payload: unknown): AeroFlight[] {
  const rows = payload && typeof payload === "object" ? (payload as { flights?: unknown }).flights : null;
  if (!Array.isArray(rows)) return [];
  const flights: AeroFlight[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const flight = row as Record<string, unknown>;
    flights.push({
      ident: text(flight.ident_iata) || text(flight.ident),
      faFlightId: text(flight.fa_flight_id),
      cancelled: flight.cancelled === true,
      diverted: flight.diverted === true,
      status: text(flight.status),
      scheduledOut: text(flight.scheduled_out) || null,
      estimatedOut: text(flight.estimated_out) || null,
      actualOut: text(flight.actual_out) || null,
      scheduledIn: text(flight.scheduled_in) || null,
      estimatedIn: text(flight.estimated_in) || null,
      departureDelay: typeof flight.departure_delay === "number" ? flight.departure_delay : null,
      originIata: airport(flight.origin, "code_iata"),
      destinationIata: airport(flight.destination, "code_iata"),
      originTimezone: airport(flight.origin, "timezone"),
      destinationTimezone: airport(flight.destination, "timezone"),
      gateOrigin: text(flight.gate_origin),
      terminalOrigin: text(flight.terminal_origin),
    });
  }
  return flights;
}

export type AeroFetchResult = {
  ok: boolean;
  stop: boolean;
  status: number;
  flights: AeroFlight[];
};

const BUTTON_URL: Record<string, string> = {
  "2": "https://travelba.fr/e/{{2}}",
  "3": "https://travelba.fr/e/{{3}}",
  "4": "https://travelba.fr/e/{{4}}",
};

function noticeBody(lines: string) {
  return `${lines}\n\nLe Concierge`;
}

function noticeDraft(
  friendlyName: string,
  body: string,
  buttonVariable: string,
  variables: Record<string, string>,
  button = "Voir le séjour"
) {
  return {
    friendly_name: friendlyName,
    language: "fr",
    variables,
    types: {
      "twilio/call-to-action": {
        body,
        actions: [{ type: "URL", title: button, url: BUTTON_URL[buttonVariable] }],
      },
    },
  };
}

const MASCULINE_E = new Set(["mexique", "cambodge", "mozambique", "zimbabwe", "belize", "suriname"]);
const AT_COUNTRY = new Set([
  "cuba",
  "madagascar",
  "malte",
  "chypre",
  "sri lanka",
  "singapour",
  "monaco",
  "haïti",
  "haiti",
  "maurice",
  "bahreïn",
  "bahrein",
  "djibouti",
]);
const PLURAL_COUNTRY = new Set([
  "états-unis",
  "etats-unis",
  "pays-bas",
  "philippines",
  "émirats arabes unis",
  "emirats arabes unis",
  "bahamas",
  "seychelles",
  "maldives",
  "comores",
]);

function countryKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** « à Marrakech », « au Maroc », « en France », « aux États-Unis ». */
export function welcomePlace(input: { city?: string | null; country?: string | null }) {
  const city = (input.city || "").replace(/[\r\n]+/g, " ").trim();
  if (city) {
    if (/^le\s+/i.test(city)) return `au ${city.replace(/^le\s+/i, "")}`;
    if (/^les\s+/i.test(city)) return `aux ${city.replace(/^les\s+/i, "")}`;
    return `à ${city}`;
  }
  const country = (input.country || "").replace(/[\r\n]+/g, " ").trim();
  if (!country) return null;
  const key = countryKey(country);
  if (PLURAL_COUNTRY.has(key)) return `aux ${country}`;
  if (AT_COUNTRY.has(key)) return `à ${country}`;
  if (MASCULINE_E.has(key)) return `au ${country}`;
  if (/[eé]$/i.test(country)) return `en ${country}`;
  if (/^[aeiouhéèêëh]/i.test(country)) return `en ${country}`;
  return `au ${country}`;
}

/** Modèles Utility. Le SID reste dans l’environnement, jamais ici. */
export function flightNoticeDrafts() {
  return [
    {
      env: "TWILIO_CONTENT_VOL_ANNULE",
      friendlyName: "vol_annule_voix",
      create: noticeDraft(
        "vol_annule_voix",
        noticeBody("Votre vol {{1}} {{2}} ne partira pas. Je m’en occupe, et je transmets à l’agence."),
        "3",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_HORAIRE",
      friendlyName: "vol_horaire_voix",
      create: noticeDraft(
        "vol_horaire_voix",
        noticeBody("Je vous préviens : votre vol {{1}} {{2}} part désormais à {{3}}."),
        "4",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "11h20", "4": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_ENREGISTREMENT",
      friendlyName: "vol_enregistrement_voix",
      create: noticeDraft(
        "vol_enregistrement_voix",
        noticeBody("L’enregistrement de votre vol {{1}} {{2}} est ouvert. Vous pouvez vous présenter."),
        "3",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_RETARD",
      friendlyName: "vol_retard_voix",
      create: noticeDraft(
        "vol_retard_voix",
        noticeBody("Votre vol {{1}} {{2}} prend du retard. Je le vois partir à {{3}}."),
        "4",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "14h40", "4": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_DEROUTE",
      friendlyName: "vol_deroute_voix",
      create: noticeDraft(
        "vol_deroute_voix",
        noticeBody("Votre vol {{1}} {{2}} change de destination. Je suis l’affaire et je transmets à l’agence."),
        "3",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_ENVOL",
      friendlyName: "vol_envol_voix",
      create: noticeDraft(
        "vol_envol_voix",
        noticeBody("Votre vol {{1}} {{2}} a décollé. Je vous souhaite un bon vol."),
        "3",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_ARRIVEE",
      friendlyName: "vol_arrivee_voix",
      create: noticeDraft(
        "vol_arrivee_voix",
        noticeBody("Vous voici {{1}}. Bienvenue. Votre séjour vous attend dans votre espace."),
        "2",
        { "1": "à Marrakech", "2": "c/23456789" }
      ),
    },
  ];
}

export function flightNoticeVariables(input: {
  kind: FlightNoticeKind;
  flight: string;
  route: string;
  when?: string | null;
  place?: string | null;
  buttonSuffix: string;
}): Record<string, string> | null {
  const suffix = input.buttonSuffix.replace(/[\r\n]+/g, " ").trim();
  const flight = input.flight.replace(/[\r\n]+/g, " ").trim();
  const route = input.route.replace(/[\r\n]+/g, " ").trim();
  const when = (input.when || "").replace(/[\r\n]+/g, " ").trim();
  const place = (input.place || "").replace(/[\r\n]+/g, " ").trim();
  if (!suffix.startsWith("c/") || suffix.includes("://")) return null;
  if (/https?:|travelba\.fr/i.test(`${flight} ${route} ${when} ${place}`)) return null;
  if (input.kind === "arrivee") {
    if (!/^(à|au|aux|en) /u.test(place)) return null;
    return { "1": place, "2": suffix };
  }
  if (!flight || !route) return null;
  if (input.kind === "horaire" || input.kind === "retard") {
    if (!/^\d{2}h\d{2}$/.test(when)) return null;
    return { "1": flight, "2": route, "3": when, "4": suffix };
  }
  return { "1": flight, "2": route, "3": suffix };
}

export function flightClockLabel(iso: string | null | undefined) {
  const match = String(iso || "").match(/T(\d{2}):(\d{2})/);
  if (!match || (match[1] === "00" && match[2] === "00")) return "";
  return `${match[1]}h${match[2]}`;
}

export function flightRouteLabel(details: Record<string, unknown> | null | undefined) {
  const from = detail(details, "from").toUpperCase();
  const to = detail(details, "to").toUpperCase();
  if (from && to) return `${from} → ${to}`;
  const cities = [detail(details, "city_from"), detail(details, "city_to")].filter(Boolean);
  return cities.join(" → ");
}

export function flightNumberLabel(details: Record<string, unknown> | null | undefined) {
  return detail(details, "flight_number").toUpperCase().replace(/\s+/g, " ").trim();
}
