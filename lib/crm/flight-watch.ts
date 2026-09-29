import { airlineIataFromFlightNumber } from "./brand-marks";

/** 0,005 $ par jeu de résultats (15 vols). 30 appels / jour ≈ 4,50 $ / mois. */
export const AEROAPI_DAILY_CALL_CAP = 30;
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

export type FlightWatch = {
  status: FlightWatchStatus;
  fa_flight_id: string;
  sold_out: string;
  scheduled_out: string;
  estimated_out: string;
  gate: string;
  terminal: string;
  checked_at: string;
  notified_out: string;
  notified_cancel: boolean;
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
  event: "annule" | "horaire" | null;
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
    fa_flight_id: text("fa_flight_id"),
    sold_out: text("sold_out"),
    scheduled_out: text("scheduled_out"),
    estimated_out: text("estimated_out"),
    gate: text("gate"),
    terminal: text("terminal"),
    checked_at: text("checked_at"),
    notified_out: text("notified_out"),
    notified_cancel: watch.notified_cancel === true,
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
  if (watch.status === "landed") return false;
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

export function checkinAttemptDue(item: FlightCard, now: Date) {
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
  if (delayMs >= SHIFT_MS) return "delayed";
  return "scheduled";
}

export function matchAeroFlight(item: FlightCard, flights: AeroFlight[]) {
  const from = detail(item.details, "from").toUpperCase();
  const to = detail(item.details, "to").toUpperCase();
  if (!from || !to) return null;
  const candidates = flights.filter(
    (flight) => flight.originIata.toUpperCase() === from && flight.destinationIata.toUpperCase() === to
  );
  const start = clockMs(item.start_at);
  let best: AeroFlight | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const flight of candidates) {
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
  const status = watchStatus(flight, localOut && item.start_at && shifted(item.start_at, localOut) ? SHIFT_MS : delayMs);
  const sold_out = previous.sold_out || item.start_at || "";
  let start_at = item.start_at;
  let event: FlightPatch["event"] = null;

  if (status === "cancelled") {
    event = previous.notified_cancel ? null : "annule";
  } else if (localOut && shifted(item.start_at, localOut)) {
    start_at = localOut;
    event = previous.notified_out === localOut ? null : "horaire";
  }

  let end_at = item.end_at;
  const arrivalUtc = flight.estimatedIn || flight.scheduledIn;
  const localIn = airportLocalIso(arrivalUtc, flight.destinationTimezone);
  if (localIn && (!end_at || shifted(end_at, localIn))) end_at = localIn;

  const details: Record<string, unknown> = {
    ...item.details,
    flight_watch: {
      ...previous,
      status,
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
    !previous.checked_at;
  return { start_at, end_at, details, event, changed };
}

export function markFlightNotified(
  details: Record<string, unknown>,
  event: "annule" | "horaire" | "enregistrement",
  startAt: string | null,
  now: Date
) {
  const previous = readFlightWatch(details);
  const flight_watch = { ...previous };
  if (event === "annule") flight_watch.notified_cancel = true;
  if (event === "horaire" && startAt) flight_watch.notified_out = startAt;
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

const NOTICE_BUTTON = "https://travelba.fr/e/{{3}}";
const HORAIRE_BUTTON = "https://travelba.fr/e/{{4}}";

function noticeBody(lines: string) {
  return `${lines}\n\nLe Concierge`;
}

function noticeDraft(friendlyName: string, body: string, buttonVariable: string, variables: Record<string, string>) {
  return {
    friendly_name: friendlyName,
    language: "fr",
    variables,
    types: {
      "twilio/call-to-action": {
        body,
        actions: [{ type: "URL", title: "Voir le vol", url: buttonVariable === "4" ? HORAIRE_BUTTON : NOTICE_BUTTON }],
      },
    },
  };
}

/** Modèles Utility. Le SID reste dans l’environnement, jamais ici. */
export function flightNoticeDrafts() {
  return [
    {
      env: "TWILIO_CONTENT_VOL_ANNULE",
      friendlyName: "vol_annule",
      create: noticeDraft(
        "vol_annule",
        noticeBody("Le vol {{1}} {{2}} est annulé. L'agence s'en occupe."),
        "3",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_HORAIRE",
      friendlyName: "vol_horaire",
      create: noticeDraft(
        "vol_horaire",
        noticeBody("Le vol {{1}} {{2}} part désormais à {{3}}."),
        "4",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "11h20", "4": "c/23456789" }
      ),
    },
    {
      env: "TWILIO_CONTENT_VOL_ENREGISTREMENT",
      friendlyName: "vol_enregistrement",
      create: noticeDraft(
        "vol_enregistrement",
        noticeBody("L'enregistrement du vol {{1}} {{2}} est ouvert."),
        "3",
        { "1": "AF 1789", "2": "CDG → RAK", "3": "c/23456789" }
      ),
    },
  ];
}

export function flightNoticeVariables(input: {
  kind: "horaire" | "annule" | "enregistrement";
  flight: string;
  route: string;
  when?: string | null;
  buttonSuffix: string;
}): Record<string, string> | null {
  const suffix = input.buttonSuffix.replace(/[\r\n]+/g, " ").trim();
  const flight = input.flight.replace(/[\r\n]+/g, " ").trim();
  const route = input.route.replace(/[\r\n]+/g, " ").trim();
  const when = (input.when || "").replace(/[\r\n]+/g, " ").trim();
  if (!suffix.startsWith("c/") || suffix.includes("://")) return null;
  if (!flight || !route) return null;
  if (/https?:|travelba\.fr/i.test(`${flight} ${route} ${when}`)) return null;
  if (input.kind === "horaire") {
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
