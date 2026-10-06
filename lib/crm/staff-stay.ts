import { stepChronoKey } from "@/lib/crm/item-order";
import { countsAsCarnetCard, isActiveItem, type BookingStatus } from "@/lib/crm/types";
import { CITY_ALIASES, cityLabel, cityPlaceKey, foldCityName } from "@/lib/crm/city-names";
import {
  flightCities,
  flightIata,
  hotelDisplayName,
  nightsBetween,
  stayHeadline,
} from "@/lib/crm/carnet";
import { formatDateRangeShort } from "@/lib/crm/money";

export type StaffStayVisibility = "preparing" | "shown" | "archived";

const LABELS: Record<StaffStayVisibility, string> = {
  preparing: "En préparation",
  shown: "Montré au client",
  archived: "Archivée",
};

/** Un seul état visible : préparé, montré, ou archivé. Le statut métier reste à part. */
export function staffStayVisibility(booking: {
  archived_at?: string | null;
  visible_to_client?: boolean | null;
}): StaffStayVisibility {
  if (booking.archived_at) return "archived";
  if (booking.visible_to_client) return "shown";
  return "preparing";
}

export function staffStayLabel(booking: {
  archived_at?: string | null;
  visible_to_client?: boolean | null;
}) {
  return LABELS[staffStayVisibility(booking)];
}

export type StaffBlocker = { id: string; label: string };

/** Ce qui empêche de considérer le dossier comme prêt. */
export function staffBlockingChips(input: {
  travelers: { id: string; first_name?: string | null; last_name?: string | null }[];
  missingPassportIds: string[];
  hotelLettersOpen: number;
  amountHidden: boolean;
}): StaffBlocker[] {
  const missing = new Set(input.missingPassportIds);
  const chips: StaffBlocker[] = [];
  for (const traveler of input.travelers) {
    if (!missing.has(traveler.id)) continue;
    const name = (traveler.first_name || traveler.last_name || "voyageur").trim();
    chips.push({ id: `passport-${traveler.id}`, label: `Passeport ${name}` });
  }
  if (input.hotelLettersOpen > 0) {
    chips.push({
      id: "hotel",
      label: input.hotelLettersOpen > 1 ? `${input.hotelLettersOpen} courriers hôtel` : "Courrier hôtel",
    });
  }
  if (input.amountHidden) chips.push({ id: "amount", label: "Montant non montré" });
  return chips;
}

/** Le grand livre suit le geste « montrer », pas le statut seul. */
export function staffLedgerCaption(booking: {
  status: BookingStatus | string;
  visible_to_client?: boolean | null;
  archived_at?: string | null;
  include_in_ledger?: boolean | null;
  client_settles_stay?: boolean | null;
}) {
  if (booking.archived_at) return "Archivé";
  if (booking.client_settles_stay) return "Hors agence";
  if (booking.include_in_ledger === false) return "Hors grand livre";
  if (booking.status === "quoted" || booking.status === "draft" || booking.status === "cancelled") {
    return "Pas de débit";
  }
  if (!booking.visible_to_client) return "Pas encore";
  return "Au grand livre";
}

type Step = {
  id?: string;
  kind?: string | null;
  title?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  sort_order?: number | null;
  details?: Record<string, unknown> | null;
  lifecycle?: string | null;
};

function isoDay(value: string | null | undefined) {
  const raw = (value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function detail(item: Step, key: string) {
  const value = item.details?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function shortStayDay(value: string | null | undefined) {
  const day = isoDay(value);
  if (!day) return "";
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.toLocaleDateString("fr-FR", { month: "short" }).replace(/\./g, "");
  return `${date.getDate()} ${month}`;
}

export function shortStayRange(start: string | null | undefined, end: string | null | undefined) {
  const from = isoDay(start);
  const to = isoDay(end);
  if (from && to && from !== to) {
    const a = shortStayDay(from);
    const b = shortStayDay(to);
    const aMonth = a.split(" ").slice(1).join(" ");
    const bMonth = b.split(" ").slice(1).join(" ");
    if (aMonth && aMonth === bMonth) return `${a.split(" ")[0]}–${b}`;
    return `${a} – ${b}`;
  }
  return shortStayDay(from || to);
}

function pushPlace(found: string[], value: string) {
  const label = cityLabel(value);
  const key = cityPlaceKey(label);
  if (!key || found.some((item) => cityPlaceKey(item) === key)) return;
  found.push(label);
}

function carnetSteps(items: Step[]) {
  return items
    .filter((item) => countsAsCarnetCard(item.kind) && isActiveItem(item))
    .slice()
    .sort((a, b) => {
      const byDate = stepChronoKey(a).localeCompare(stepChronoKey(b));
      if (byDate) return byDate;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
}

/**
 * Titre lu sur les étapes. Un nom choisi (« 40 ans ») reste.
 * Une liste de villes s’allonge quand une étape en ajoute une.
 */
export function stayTitleFromItems(
  title: string | null | undefined,
  destination: string | null | undefined,
  items: Step[],
  fallback = "Séjour"
) {
  return stayHeadline(title, destination, stayCitiesFromSteps(items), fallback);
}

/** Villes dans l’ordre des étapes, Paris compris quand le vol en part. */
export function stayCitiesFromSteps(items: Step[]) {
  const cities: string[] = [];
  for (const item of carnetSteps(items)) {
    if (item.kind === "flight" || item.kind === "rail") {
      pushPlace(cities, detail(item, "city_from") || detail(item, "from"));
      pushPlace(cities, detail(item, "city_to") || detail(item, "to"));
      continue;
    }
    if (item.kind === "hotel") pushPlace(cities, detail(item, "city"));
  }
  return cities;
}

export type StaySegment = {
  id: string;
  place: string;
  when: string;
};

const STAY_NAME_NOISE = new Set(["hotel", "hotels"]);

/** « Four Seasons Hotel Milano » et « Four Seasons Hotel Milan » désignent le même établissement. */
function stayNameKey(value: string) {
  return foldCityName(value)
    .split(" ")
    .map((token) => CITY_ALIASES[token] || token)
    .filter((token) => token && !STAY_NAME_NOISE.has(token))
    .join(" ");
}

function hotelLineKey(item: Step) {
  const name = stayNameKey(hotelDisplayName(item as never));
  if (!name) return "";
  const city = cityPlaceKey(detail(item, "city"));
  return `stay|${name}|${city}|${isoDay(item.start_at)}|${isoDay(item.end_at)}`;
}

function routeEnds(item: Step) {
  let from = cityPlaceKey(detail(item, "city_from") || detail(item, "from"));
  let to = cityPlaceKey(detail(item, "city_to") || detail(item, "to"));
  if (from && to) return { from, to };
  const shown = flightCities(item as never) || flightIata(item as never) || (item.title || "").trim();
  const parts = shown.split("→").map((part) => cityPlaceKey(part));
  if (parts.length >= 2) {
    from = from || parts[0] || "";
    to = to || parts[parts.length - 1] || "";
  }
  return { from, to };
}

/** Même sens, même jour. Paris → Milan n’est pas Milan → Paris. Milano = Milan, Roma = Rome. */
function routeLineKey(item: Step) {
  const { from, to } = routeEnds(item);
  if (!from || !to) return "";
  return `route|${item.kind}|${from}|${to}|${isoDay(item.start_at)}`;
}

function segmentLineKey(item: Step) {
  if (item.kind === "hotel") return hotelLineKey(item);
  if (item.kind === "flight" || item.kind === "rail") return routeLineKey(item);
  return "";
}

function segmentLine(item: Step, index: number): StaySegment {
  const id = item.id || `step-${index}`;
  if (item.kind === "flight" || item.kind === "rail") {
    const route =
      flightCities(item as never) || flightIata(item as never) || (item.title || "").trim() || "Trajet";
    return { id, place: route, when: shortStayDay(item.start_at) };
  }
  if (item.kind === "hotel") {
    const name = hotelDisplayName(item as never);
    const end = isoDay(item.end_at);
    return {
      id,
      place: name,
      when: end ? `jusqu’au ${shortStayDay(end)}` : shortStayDay(item.start_at),
    };
  }
  return {
    id,
    place: (item.title || "").trim() || "Étape",
    when: shortStayRange(item.start_at, item.end_at),
  };
}

/**
 * Une ligne par séjour et par trajet.
 * Le même hôtel aux mêmes dates, ou le même trajet le même jour, n’apparaît qu’une fois.
 */
export function staySegmentsFromSteps(items: Step[]): StaySegment[] {
  const seen = new Set<string>();
  const lines: StaySegment[] = [];
  for (const [index, item] of carnetSteps(items).entries()) {
    const key = segmentLineKey(item);
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    lines.push(segmentLine(item, index));
  }
  return lines;
}

export function staySpanFromSteps(items: Step[]) {
  let start = "";
  let end = "";
  for (const item of carnetSteps(items)) {
    const from = isoDay(item.start_at);
    const to = isoDay(item.end_at) || from;
    if (from && (!start || from < start)) start = from;
    if (to && (!end || to > end)) end = to;
  }
  if (!start && !end) return null;
  return { start: start || end, end: end || start };
}

/** En-tête : dates et villes lues sur les étapes, sinon le dossier. */
export function staffStayFacts(input: {
  items: Step[];
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const cities = stayCitiesFromSteps(input.items);
  const segments = staySegmentsFromSteps(input.items);
  const span = staySpanFromSteps(input.items);
  const start = span?.start || input.startDate || null;
  const end = span?.end || input.endDate || null;
  const dates = start || end ? formatDateRangeShort(start, end) : "";
  const nights = nightsBetween(start, end);
  const placeLine = cities.length ? cities.join(" · ") : (input.destination || "").trim();
  return {
    cities,
    segments,
    dates,
    nights,
    placeLine,
    start,
    end,
    fromSteps: Boolean(span),
  };
}
