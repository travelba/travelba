import { cityLabel, cityPlaceKey } from "./city-names";
import { stepChronoKey } from "./item-order";
import { countsAsCarnetCard, isActiveItem } from "./types";

/** Une escale pure : arrivée et nouveau départ en avion avant cette durée. */
export const DEFAULT_LAYOVER_MAX_HOURS = 24;

export type TripStep = {
  id?: string;
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  sort_order?: number | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

export type TripCityPlan = {
  /** Villes du trajet, domicile compris, escales pures exclues. */
  cities: string[];
  /** Villes où l’on séjourne : ni domicile, ni escale pure. */
  destinations: string[];
  /** Escales pures, dans l’ordre où on les voit. */
  layovers: string[];
  /** Domicile à retirer du titre, de la destination et de la photo. */
  origins: string[];
  /** Ville de départ quand un vol y revient. */
  homeKey: string;
};

type Wall = { day: string; ms: number; clock: boolean };

type Place = { key: string; label: string };

type AirLeg = {
  from: Place;
  to: Place;
  depart: Wall | null;
  arrive: Wall | null;
};

const ANCHOR_KINDS = new Set([
  "hotel",
  "transfer",
  "activity",
  "rail",
  "car",
  "cruise",
  "chauffeur",
  "greeter",
]);

const PLACE_SPLIT = /\s*(?:·|\||\/|→|->|—|–| - )\s*/;

/** Fenêtre d’escale. `TRAVELBA_LAYOVER_MAX_HOURS` la remplace, un argument aussi. */
export function layoverMaxHours(override?: number) {
  if (override != null && Number.isFinite(override) && override > 0) return override;
  const fromEnv = Number(process.env.TRAVELBA_LAYOVER_MAX_HOURS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_LAYOVER_MAX_HOURS;
}

export function splitPlaceLabel(value: string | null | undefined) {
  return (value || "")
    .split(PLACE_SPLIT)
    .map((part) => (part.split(",")[0] || "").trim())
    .filter(Boolean);
}

export function labelIncludesCity(value: string | null | undefined, city: string) {
  const key = cityPlaceKey(city);
  if (!key) return false;
  return splitPlaceLabel(value).some((part) => cityPlaceKey(part) === key);
}

function textOf(details: Record<string, unknown> | null | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function wall(value: string | null | undefined): Wall | null {
  const match = (value || "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!match) return null;
  const day = match[1];
  const hour = match[2];
  const minute = match[3];
  const clock = Boolean(hour && !(hour === "00" && minute === "00"));
  const ms = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    clock ? Number(hour) : 0,
    clock ? Number(minute) : 0
  );
  return { day, ms, clock };
}

function dayGap(from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((end - start) / 86_400_000);
}

/** Heure locale posée sur la carte. Minuit sans horloge n’est pas une heure. */
function withinWindow(arrive: Wall | null, depart: Wall | null, maxHours: number) {
  if (!arrive || !depart) return false;
  if (arrive.clock && depart.clock) {
    const hours = (depart.ms - arrive.ms) / 3_600_000;
    return hours >= 0 && hours < maxHours;
  }
  if (!arrive.day || !depart.day) return false;
  const gap = dayGap(arrive.day, depart.day);
  if (gap == null || gap < 0) return false;
  if (gap === 0) return true;
  return gap === 1 && maxHours >= 24;
}

function namedPlace(raw: string): Place | null {
  const label = cityLabel(raw);
  const key = cityPlaceKey(label);
  if (!label || !key) return null;
  return { key, label };
}

function titleEnds(title: string | null | undefined) {
  const match = (title || "").trim().match(/^(.+?)\s*(?:→|->|—|–| à )\s*(.+)$/i);
  if (!match) return null;
  return { from: match[1].trim(), to: match[2].trim() };
}

function rememberAlias(alias: Map<string, Place>, code: string, city: string) {
  if (!/^[A-Z]{3}$/.test(code) || !city) return;
  const place = namedPlace(city);
  if (place) alias.set(code, place);
}

function resolvePlace(raw: string, alias: Map<string, Place>): Place | null {
  const token = raw.trim();
  if (!token) return null;
  const code = token.toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    const known = alias.get(code);
    if (known) return known;
  }
  return namedPlace(token);
}

function samePlace(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  return left.startsWith(`${right} `) || right.startsWith(`${left} `);
}

function servicePlaces(item: TripStep, alias: Map<string, Place>) {
  const places: Place[] = [];
  for (const key of ["city", "city_from", "city_to", "pickup", "dropoff", "meeting_point"]) {
    const place = resolvePlace(textOf(item.details, key), alias);
    if (place && !places.some((row) => row.key === place.key)) places.push(place);
  }
  return places;
}

function legEnds(item: TripStep, alias: Map<string, Place>) {
  let from = resolvePlace(textOf(item.details, "city_from") || textOf(item.details, "from"), alias);
  let to = resolvePlace(textOf(item.details, "city_to") || textOf(item.details, "to"), alias);
  if (!from || !to) {
    const titled = titleEnds(item.title);
    if (titled) {
      from = from || resolvePlace(titled.from, alias);
      to = to || resolvePlace(titled.to, alias);
    }
  }
  if (!from && !to) return null;
  if (from && to && from.key === to.key) return { from, to: null };
  return { from, to };
}

function orderedCards(items: TripStep[]) {
  return items
    .filter((item) => countsAsCarnetCard(item.kind) && isActiveItem(item))
    .slice()
    .sort((a, b) => {
      const byDate = stepChronoKey(a).localeCompare(stepChronoKey(b));
      if (byDate) return byDate;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
}

function airLegs(items: TripStep[], alias: Map<string, Place>) {
  const legs: AirLeg[] = [];
  const seen = new Set<string>();
  for (const item of orderedCards(items)) {
    if (item.kind !== "flight" && item.kind !== "rail") continue;
    const ends = legEnds(item, alias);
    if (!ends?.from || !ends.to) continue;
    const depart = wall(item.start_at);
    const arriveClock = wall(item.end_at);
    const arrive = arriveClock || (depart ? { ...depart, clock: false } : null);
    const stamp = `${ends.from.key}|${ends.to.key}|${depart?.ms ?? depart?.day ?? ""}|${arrive?.ms ?? ""}`;
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    legs.push({ from: ends.from, to: ends.to, depart, arrive });
  }
  return legs;
}

type Visit = { arrive: Wall | null; depart: Wall | null };

function visitsAt(legs: AirLeg[], key: string): Visit[] {
  const events: { type: "arrive" | "depart"; wall: Wall }[] = [];
  for (const leg of legs) {
    if (leg.to.key === key && leg.arrive) events.push({ type: "arrive", wall: leg.arrive });
    if (leg.from.key === key && leg.depart) events.push({ type: "depart", wall: leg.depart });
  }
  events.sort((a, b) => a.wall.ms - b.wall.ms || (a.type === "arrive" ? -1 : 1));
  const visits: Visit[] = [];
  let open: Visit | null = null;
  for (const event of events) {
    if (event.type === "arrive") {
      if (open?.arrive && !open.depart && Math.abs(event.wall.ms - open.arrive.ms) < 60_000) continue;
      if (open?.arrive && !open.depart) visits.push(open);
      open = { arrive: event.wall, depart: null };
      continue;
    }
    if (open?.arrive && !open.depart) {
      open.depart = event.wall;
      visits.push(open);
      open = null;
    }
  }
  if (open?.arrive) visits.push(open);
  return visits;
}

function serviceCovers(item: TripStep, arrive: Wall, depart: Wall | null) {
  const start = wall(item.start_at);
  if (!start) return false;
  const end = wall(item.end_at) || start;
  if (arrive.clock && depart?.clock && (start.clock || item.kind === "hotel")) {
    return start.ms < depart.ms && end.ms > arrive.ms;
  }
  if (item.kind === "hotel") {
    const leave = depart?.day || arrive.day;
    return arrive.day < end.day && leave >= start.day;
  }
  const leave = depart?.day || arrive.day;
  return leave >= start.day && arrive.day <= end.day;
}

function anchored(item: TripStep, key: string, visit: Visit, alias: Map<string, Place>) {
  if (!visit.arrive) return false;
  if (!servicePlaces(item, alias).some((place) => samePlace(place.key, key))) return false;
  return serviceCovers(item, visit.arrive, visit.depart);
}

function pushCity(found: string[], place: Place | null, skip: Set<string>) {
  if (!place || skip.has(place.key)) return;
  if (found.some((item) => cityPlaceKey(item) === place.key)) return;
  found.push(place.label);
}

function homeKeyOf(legs: AirLeg[]) {
  const start = legs[0]?.from.key || "";
  if (!start) return "";
  return legs.some((leg) => leg.to.key === start) ? start : "";
}

function labelForKey(legs: AirLeg[], key: string) {
  for (const leg of legs) {
    if (leg.from.key === key) return leg.from.label;
    if (leg.to.key === key) return leg.to.label;
  }
  return "";
}

/** Domicile : on en part et, à l’aller-retour, on y revient. Une ville où l’on séjourne reste. */
function originLabels(legs: AirLeg[], homeKey: string, destinations: string[]) {
  const stayed = new Set(destinations.map((city) => cityPlaceKey(city)));
  const found: string[] = [];
  const push = (label: string) => {
    const key = cityPlaceKey(label);
    if (!label || !key || stayed.has(key)) return;
    if (found.some((item) => cityPlaceKey(item) === key)) return;
    found.push(label);
  };
  if (homeKey) push(labelForKey(legs, homeKey));
  else push(legs[0]?.from.label || "");
  return found;
}

/**
 * Villes du voyage. Une ville est une escale quand on y arrive et qu’on en repart
 * en avion dans la fenêtre, sans hôtel ni autre service sur place pendant ce passage.
 * Tous les passages doivent être des escales : une nuit d’hôtel, ou un arrêt plus long, la garde.
 */
export function tripCityPlan(
  items: TripStep[],
  maxHours = layoverMaxHours(),
  homeCity?: string | null
): TripCityPlan {
  const active = items.filter((item) => isActiveItem(item));
  const alias = new Map<string, Place>();
  for (const item of active) {
    if (item.kind !== "flight") continue;
    rememberAlias(alias, textOf(item.details, "from").toUpperCase(), textOf(item.details, "city_from"));
    rememberAlias(alias, textOf(item.details, "to").toUpperCase(), textOf(item.details, "city_to"));
  }
  const cards = orderedCards(active);
  const legs = airLegs(active, alias);
  const anchors = active.filter((item) => ANCHOR_KINDS.has(item.kind || ""));
  const labels = new Map<string, string>();
  for (const leg of legs) {
    labels.set(leg.from.key, leg.from.label);
    labels.set(leg.to.key, leg.to.label);
  }
  const layoverKeys = new Set<string>();
  const layovers: string[] = [];
  for (const [key, label] of labels) {
    const visits = visitsAt(legs, key).filter((visit) => visit.arrive);
    if (!visits.length) continue;
    const pure = visits.every(
      (visit) =>
        visit.depart &&
        withinWindow(visit.arrive, visit.depart, maxHours) &&
        !anchors.some((item) => anchored(item, key, visit, alias))
    );
    if (!pure) continue;
    layoverKeys.add(key);
    layovers.push(label);
  }
  const homeKey = homeKeyOf(legs);
  const skipRoute = layoverKeys;
  const cities: string[] = [];
  for (const item of cards) {
    if (item.kind === "flight" || item.kind === "rail") {
      const ends = legEnds(item, alias);
      pushCity(cities, ends?.from || null, skipRoute);
      pushCity(cities, ends?.to || null, skipRoute);
      continue;
    }
    if (item.kind === "hotel") {
      pushCity(cities, resolvePlace(textOf(item.details, "city"), alias), skipRoute);
    }
  }
  const skipDest = new Set(layoverKeys);
  if (homeKey) skipDest.add(homeKey);
  const hotels: string[] = [];
  const arrivals: string[] = [];
  for (const item of cards) {
    if (item.kind === "hotel") {
      pushCity(hotels, resolvePlace(textOf(item.details, "city"), alias), skipDest);
    }
    if (item.kind === "flight" || item.kind === "rail") {
      pushCity(arrivals, legEnds(item, alias)?.to || null, skipDest);
    }
  }
  let destinations = hotels.length ? hotels : arrivals;
  const firstKey = legs[0]?.from.key || "";
  if (firstKey && destinations.some((city) => cityPlaceKey(city) !== firstKey)) {
    destinations = destinations.filter((city) => cityPlaceKey(city) !== firstKey);
  }
  const origins = originLabels(legs, homeKey, destinations);
  const home = namedPlace(homeCity || "");
  if (home && destinations.length && !destinations.some((city) => cityPlaceKey(city) === home.key)) {
    if (!origins.some((city) => cityPlaceKey(city) === home.key)) origins.push(home.label);
  }
  return {
    cities,
    destinations,
    layovers,
    origins,
    homeKey,
  };
}
