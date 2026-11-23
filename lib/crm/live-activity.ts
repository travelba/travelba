import { isApnsDeviceToken } from "./apns-token";
import { flightGate, flightTerminal, readFlightWatch } from "./flight-watch";
import { buildLiveFlight, type LiveFlightItem } from "./next-flight-model";
import { liveFlightPhase, type LiveFlight } from "./next-flight-live";

/** Ouverture locale et push-to-start : huit heures avant le départ. */
export const LIVE_ACTIVITY_LEAD_MS = 8 * 60 * 60 * 1000;
/** L’activité reste visible un moment après l’arrivée, puis se ferme. */
export const LIVE_ACTIVITY_TAIL_MS = 45 * 60 * 1000;

/** Nom Swift de l’attribut. Le push `attributes-type` doit être exactement celui-ci. */
export const LIVE_ACTIVITY_ATTRIBUTES_TYPE = "FlightActivityAttributes";

export type LiveActivityEvent = "start" | "update" | "end" | "none";

/** Attributs fixes du vol. Les heures sont locales à l’aéroport, déjà sur la carte. */
export type FlightActivityAttributes = {
  flightNumber: string;
  route: string;
  scheduledDeparture: string;
  scheduledArrival: string;
  estimatedDeparture: string;
  estimatedArrival: string;
};

/**
 * État lu par l’île et l’écran verrouillé.
 * `boardingCountdown` vaut -1 quand l’heure d’embarquement n’est pas connue.
 */
export type FlightActivityState = {
  status: string;
  gate: string;
  terminal: string;
  delayMinutes: number;
  boardingCountdown: number;
};

const ACTIVITY_ID = /^[A-Za-z0-9_-]{1,80}$/;
const FLIGHT_NUMBER = /^[A-Z0-9]{2,3}(?:\s\d{1,4}|\d{1,4})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LiveActivityRegistration = {
  deviceToken: string | null;
  pushToStartToken: string | null;
  activity: null | {
    id: string;
    token: string;
    itemId: string | null;
    flightNumber: string | null;
    ended: boolean;
  };
};

function clip(value: string, max = 80) {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function text(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

/** « AF 7308 ». Le compact « AF7308 » reçoit une espace. Le chiffre du vol ne part pas dans le code. */
export function displayFlightNumber(raw: string) {
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  const iata = compact.match(/^([A-Z]\d|[A-Z]{2})(\d{1,4})$/);
  if (iata) return `${iata[1]} ${iata[2]}`;
  const icao = compact.match(/^([A-Z]{3})(\d{1,4})$/);
  if (icao) return `${icao[1]} ${icao[2]}`;
  return clip(raw.toUpperCase().replace(/\s+/g, " "), 16);
}

export function flightActivityRoute(details: Record<string, unknown> | null | undefined) {
  const from = text(details, "from").toUpperCase();
  const to = text(details, "to").toUpperCase();
  const cityFrom = text(details, "city_from");
  const cityTo = text(details, "city_to");
  const codes = from && to ? `${from} → ${to}` : "";
  const cities = cityFrom && cityTo ? `${cityFrom} → ${cityTo}` : "";
  return { route: clip(cities || codes, 80), codes: clip(codes, 16) };
}

export function clockDelayMinutes(scheduled: string, estimated: string) {
  const toMinutes = (value: string) => {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const start = toMinutes(scheduled);
  const revised = toMinutes(estimated);
  if (start == null || revised == null || !estimated) return 0;
  let diff = revised - start;
  if (diff < -12 * 60) diff += 24 * 60;
  if (diff > 12 * 60) diff -= 24 * 60;
  return diff > 0 ? diff : 0;
}

/**
 * Secondes avant l’embarquement. -1 si l’heure n’est pas un instant (pas de fuseau).
 * Une heure locale sans décalage n’est pas convertie : on n’invente pas.
 */
export function boardingCountdownSeconds(details: Record<string, unknown> | null | undefined, nowMs: number) {
  for (const key of ["boarding_at", "boarding_time"]) {
    const raw = text(details, key);
    if (!raw || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    const seconds = Math.round((ms - nowMs) / 1000);
    if (seconds < -2 * 60 * 60) return -1;
    return Math.max(0, seconds);
  }
  return -1;
}

export function liveActivityTopic(bundleId: string) {
  const id = bundleId.trim() || "fr.travelba.client";
  return `${id}.push-type.liveactivity`;
}

/** Vrai pendant la fenêtre, y compris juste après l’arrivée ou une annulation. */
export function liveActivityOpen(flight: LiveFlight, nowMs: number) {
  if (flight.departureAt == null) return false;
  const phase = liveFlightPhase(flight, nowMs);
  const end = (flight.arrivalAt ?? flight.departureAt) + LIVE_ACTIVITY_TAIL_MS;
  if (phase === "cancelled") {
    return (
      nowMs >= flight.departureAt - LIVE_ACTIVITY_LEAD_MS &&
      nowMs <= flight.departureAt + LIVE_ACTIVITY_TAIL_MS
    );
  }
  if (phase === "landed") return nowMs <= end;
  const start = flight.departureAt - LIVE_ACTIVITY_LEAD_MS;
  return nowMs >= start && nowMs <= end;
}

/** `update` dans la fenêtre, `end` une fois le vol passé, `none` trop tôt ou sans instant. */
export function liveActivityEvent(flight: LiveFlight, nowMs: number): LiveActivityEvent {
  if (flight.departureAt == null) return "none";
  const phase = liveFlightPhase(flight, nowMs);
  if (liveActivityOpen(flight, nowMs)) {
    if (phase === "landed" || phase === "cancelled") return "end";
    return "update";
  }
  if (nowMs > flight.departureAt) return "end";
  return "none";
}

function activityStatus(flight: LiveFlight, nowMs: number, boardingCountdown: number) {
  const phase = liveFlightPhase(flight, nowMs);
  if (phase === "cancelled") return "cancelled";
  if (phase === "diverted") return "diverted";
  if (phase === "landed") return "landed";
  if (phase === "airborne") return "en_route";
  if (boardingCountdown >= 0 && boardingCountdown <= 45 * 60) return "boarding";
  if (flight.status === "delayed") return "delayed";
  if (flight.status === "scheduled") return "scheduled";
  return "unknown";
}

export type FlightActivityModel = {
  event: Exclude<LiveActivityEvent, "none"> | "none";
  attributes: FlightActivityAttributes;
  state: FlightActivityState;
  staleDate: number;
};

/** Modèle partagé par le widget et le push. Null sans numéro de vol. */
export function flightActivityModel(item: LiveFlightItem, nowMs: number): FlightActivityModel | null {
  const flight = buildLiveFlight(item);
  if (!flight.number) return null;
  const details = item.details || {};
  const route = flightActivityRoute(details);
  const watch = readFlightWatch(details);
  const gate = clip(watch.gate_origin || watch.gate || flightGate({ start_at: item.start_at, end_at: item.end_at, details }), 12);
  const terminal = clip(
    watch.terminal_origin || watch.terminal || flightTerminal({ start_at: item.start_at, end_at: item.end_at, details }),
    12
  );
  const boarding = boardingCountdownSeconds(details, nowMs);
  const delayed = watch.status === "delayed" || flight.departure.revised !== "";
  const delayMinutes = delayed ? clockDelayMinutes(flight.departure.scheduled, flight.departure.revised) : 0;
  const endMs = (flight.arrivalAt ?? flight.departureAt ?? nowMs) + 2 * 60 * 60 * 1000;
  return {
    event: liveActivityEvent(flight, nowMs),
    attributes: {
      flightNumber: displayFlightNumber(flight.number),
      route: route.route,
      scheduledDeparture: flight.departure.scheduled,
      scheduledArrival: flight.arrival.scheduled,
      estimatedDeparture: flight.departure.revised,
      estimatedArrival: flight.arrival.revised,
    },
    state: {
      status: activityStatus(flight, nowMs, boarding),
      gate,
      terminal,
      delayMinutes,
      boardingCountdown: boarding,
    },
    staleDate: Math.floor(endMs / 1000),
  };
}

export function liveActivityAlert(
  event: "start" | "end",
  attributes: FlightActivityAttributes,
  state: FlightActivityState
) {
  const title = clip(attributes.flightNumber, 40) || "Vol";
  if (event === "start") {
    const route = clip(attributes.route, 80);
    return {
      title,
      body: route ? `${route}. Le suivi est ouvert.` : "Le suivi de votre vol est ouvert.",
    };
  }
  if (state.status === "cancelled") return { title: "Vol annulé", body: "L’agence s’en occupe." };
  if (state.status === "landed") {
    const route = clip(attributes.route, 80);
    return { title: "Arrivé", body: route || "Votre vol est arrivé." };
  }
  return null;
}

/** Charge utile APNs `liveactivity`. Null si un démarrage n’a pas ses attributs. */
export function buildLiveActivityPayload(input: {
  event: "start" | "update" | "end";
  attributes?: FlightActivityAttributes;
  state: FlightActivityState;
  timestamp: number;
  staleDate?: number | null;
  dismissalDate?: number | null;
  alert?: { title: string; body: string } | null;
}) {
  if (!Number.isFinite(input.timestamp) || input.timestamp <= 0) return null;
  if (input.event === "start" && !input.attributes?.flightNumber) return null;
  const aps: Record<string, unknown> = {
    timestamp: Math.floor(input.timestamp),
    event: input.event,
    "content-state": {
      status: input.state.status,
      gate: input.state.gate,
      terminal: input.state.terminal,
      delayMinutes: input.state.delayMinutes,
      boardingCountdown: input.state.boardingCountdown,
    },
  };
  if (input.staleDate && input.staleDate > 0) aps["stale-date"] = Math.floor(input.staleDate);
  if (input.event === "start" && input.attributes) {
    aps["attributes-type"] = LIVE_ACTIVITY_ATTRIBUTES_TYPE;
    aps.attributes = input.attributes;
  }
  if (input.event === "end" && input.dismissalDate && input.dismissalDate > input.timestamp) {
    aps["dismissal-date"] = Math.floor(input.dismissalDate);
  }
  if (input.alert?.title && input.alert.body) {
    aps.alert = { title: clip(input.alert.title, 40), body: clip(input.alert.body, 120) };
  }
  return { aps };
}

export function parseLiveActivityRegistration(
  body: unknown
): { ok: true; value: LiveActivityRegistration } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Corps invalide." };
  const raw = body as Record<string, unknown>;
  const deviceToken = typeof raw.deviceToken === "string" ? raw.deviceToken.replace(/\s+/g, "") : "";
  const pushToStartToken = typeof raw.pushToStartToken === "string" ? raw.pushToStartToken.replace(/\s+/g, "") : "";
  if (deviceToken && !isApnsDeviceToken(deviceToken)) return { ok: false, error: "Jeton d’appareil invalide." };
  if (pushToStartToken && !isApnsDeviceToken(pushToStartToken)) return { ok: false, error: "Jeton d’activité invalide." };
  if (pushToStartToken && !deviceToken) return { ok: false, error: "Jeton d’appareil invalide." };

  let activity: LiveActivityRegistration["activity"] = null;
  if (raw.activity && typeof raw.activity === "object") {
    const row = raw.activity as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const token = typeof row.token === "string" ? row.token.replace(/\s+/g, "") : "";
    const itemId = typeof row.itemId === "string" ? row.itemId.trim() : "";
    const flightNumber =
      typeof row.flightNumber === "string" ? row.flightNumber.toUpperCase().replace(/\s+/g, " ").trim() : "";
    if (!ACTIVITY_ID.test(id) || !isApnsDeviceToken(token)) return { ok: false, error: "Jeton d’activité invalide." };
    if (itemId && !UUID.test(itemId)) return { ok: false, error: "Vol introuvable." };
    if (flightNumber && !FLIGHT_NUMBER.test(flightNumber)) return { ok: false, error: "Vol introuvable." };
    if (!itemId && !flightNumber) return { ok: false, error: "Vol introuvable." };
    activity = {
      id,
      token,
      itemId: itemId || null,
      flightNumber: flightNumber ? displayFlightNumber(flightNumber) : null,
      ended: row.ended === true,
    };
  }
  if (!pushToStartToken && !activity) return { ok: false, error: "Jeton d’activité invalide." };
  return {
    ok: true,
    value: {
      deviceToken: deviceToken || null,
      pushToStartToken: pushToStartToken || null,
      activity,
    },
  };
}

export function parseLiveActivityEnd(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const id = (body as { activityId?: unknown }).activityId;
  if (typeof id !== "string" || !ACTIVITY_ID.test(id.trim())) return null;
  return { activityId: id.trim() };
}
