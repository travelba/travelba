import { greetingGivenName } from "@/lib/crm/identity";
import { stepChronoKey } from "@/lib/crm/item-order";
import { countsAsCarnetCard, isActiveItem, type BookingStatus } from "@/lib/crm/types";
import { CITY_ALIASES, cityPlaceKey, foldCityName } from "@/lib/crm/city-names";
import {
  flightCities,
  flightIata,
  hotelDisplayName,
  nightsBetween,
  stayHeadline,
} from "@/lib/crm/carnet";
import { labelIncludesCity, splitPlaceLabel, tripCityPlan, type TripStep } from "@/lib/crm/layover";
import { formatDateRangeShort } from "@/lib/crm/money";

export type StaffStayVisibility = "preparing" | "shown" | "archived";

const LABELS: Record<StaffStayVisibility, string> = {
  preparing: "En préparation",
  shown: "Visible",
  archived: "Archivée",
};

/** Un seul état : en préparation, visible, ou archivée. */
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

/** Onglet que la pastille ouvre : À faire par défaut, Règlement pour l’argent. */
export type StaffBlocker = { id: string; label: string; tab?: "todo" | "argent" };

/** Ce qui empêche de considérer le dossier comme prêt. */
export function staffBlockingChips(input: {
  travelers: { id: string; first_name?: string | null; last_name?: string | null }[];
  missingPassportIds: string[];
  hotelLettersOpen: number;
  amountHidden: boolean;
  /** Sorties proposées et coûts sans vente qui attendent dans Coûts du voyage. */
  costsToPoint?: number;
  /** Facture imprimée dont la marge a changé. */
  marginStale?: boolean;
  /** Cartes hôtel dont Pliant a refusé l’émission, une fois pour toutes. */
  cardAlerts?: number;
}): StaffBlocker[] {
  const missing = new Set(input.missingPassportIds);
  const chips: StaffBlocker[] = [];
  for (const traveler of input.travelers) {
    if (!missing.has(traveler.id)) continue;
    const name = greetingGivenName(traveler.first_name) || (traveler.last_name || "").trim() || "voyageur";
    chips.push({ id: `passport-${traveler.id}`, label: `Passeport ${name}` });
  }
  if (input.hotelLettersOpen > 0) {
    chips.push({
      id: "hotel",
      label: input.hotelLettersOpen > 1 ? `${input.hotelLettersOpen} courriers hôtel` : "Courrier hôtel",
    });
  }
  if (input.amountHidden) chips.push({ id: "amount", label: "Montant non montré" });
  const costs = input.costsToPoint ?? 0;
  if (costs > 0) {
    chips.push({ id: "costs", label: costs > 1 ? `${costs} coûts à pointer` : "Coût à pointer", tab: "argent" });
  }
  if (input.marginStale) chips.push({ id: "margin", label: "Marge à corriger", tab: "argent" });
  const cardAlerts = input.cardAlerts || 0;
  if (cardAlerts > 0) {
    chips.push({
      id: "pliant-card",
      label: cardAlerts > 1 ? `${cardAlerts} cartes hôtel refusées` : "Carte hôtel refusée",
    });
  }
  return chips;
}

/** Le grand livre suit la visibilité. Une annulation retire le débit. */
export function staffLedgerCaption(booking: {
  status?: BookingStatus | string | null;
  visible_to_client?: boolean | null;
  archived_at?: string | null;
  include_in_ledger?: boolean | null;
  client_settles_stay?: boolean | null;
}) {
  if (booking.archived_at) return "Archivée";
  if (booking.client_settles_stay) return "Hors agence";
  if (booking.include_in_ledger === false) return "Hors grand livre";
  if (booking.status === "cancelled") return "Pas de débit";
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

/** Liste de villes déjà posée par l’agence, pas un nom choisi (« 40 ans »). */
export function isAutoCityList(
  value: string | null | undefined,
  items: Step[],
  homeCity?: string | null
) {
  const parts = splitPlaceLabel(value);
  if (!parts.length) return false;
  const plan = tripCityPlan(items, undefined, homeCity);
  const keys = new Set(
    [...plan.cities, ...plan.destinations, ...plan.layovers, ...plan.origins]
      .map((city) => cityPlaceKey(city))
      .filter(Boolean)
  );
  if (!keys.size) return false;
  return parts.every((part) => keys.has(cityPlaceKey(part)));
}

/** Retire le domicile d’une liste de villes. Une ville seule reste : ce peut être l’arrivée. */
export function withoutHomeCity(value: string | null | undefined, homeCity: string | null | undefined) {
  const home = cityPlaceKey(homeCity || "");
  const raw = (value || "").trim();
  if (!home || !raw) return raw;
  const parts = splitPlaceLabel(raw);
  if (parts.length < 2) return raw;
  const kept = parts.filter((part) => cityPlaceKey(part) !== home);
  if (!kept.length || kept.length === parts.length) return raw;
  return kept.join(" · ");
}

/**
 * Titre et destination lus sur les étapes.
 * Une escale pure sort du titre et, si la destination n’est qu’une liste de villes, de la destination.
 * Un nom choisi (« 40 ans ») reste.
 */
export function nextStayLabels(
  title: string | null | undefined,
  destination: string | null | undefined,
  items: Step[],
  fallback = "Séjour",
  homeCity?: string | null
) {
  const plan = tripCityPlan(items as TripStep[], undefined, homeCity);
  const stayed = plan.destinations.length
    ? plan.destinations
    : plan.cities.filter((city) => !plan.origins.some((origin) => cityPlaceKey(origin) === cityPlaceKey(city)));
  const nextTitle = stayHeadline(title, destination, stayed, fallback, [...plan.layovers, ...plan.origins]).trim();
  const currentDest = (destination || "").trim();
  const suggested = stayed.join(" · ");
  const destHasLayover = plan.layovers.some((city) => labelIncludesCity(currentDest, city));
  const destHasOrigin = plan.origins.some((city) => labelIncludesCity(currentDest, city));
  const destinationChanged = Boolean(
    (destHasLayover || destHasOrigin) &&
      isAutoCityList(currentDest, items, homeCity) &&
      suggested &&
      suggested !== currentDest
  );
  return {
    title: nextTitle,
    destination: destinationChanged ? suggested : currentDest,
    suggestedDestination: suggested,
    destinationChanged,
    plan,
  };
}

/**
 * Titre lu sur les étapes. Un nom choisi (« 40 ans ») reste.
 * Une liste de villes s’allonge quand une étape en ajoute une.
 * Une escale pure n’y entre pas.
 */
export function stayTitleFromItems(
  title: string | null | undefined,
  destination: string | null | undefined,
  items: Step[],
  fallback = "Séjour",
  homeCity?: string | null
) {
  return nextStayLabels(title, destination, items, fallback, homeCity).title || fallback;
}

/** Villes dans l’ordre des étapes, Paris compris quand le vol en part. Les escales pures n’y sont pas. */
export function stayCitiesFromSteps(items: Step[]) {
  return tripCityPlan(items).cities;
}

export type LayoverFieldChange = { from: string; to: string };

export type LayoverDossierDiff = {
  layovers: string[];
  title: LayoverFieldChange | null;
  destination: LayoverFieldChange | null;
  customTitle: boolean;
  customDestination: boolean;
};

/**
 * Ce que le rattrapage écrirait. Rien si le titre et la destination ne citent pas une escale pure.
 * Un nom choisi qui cite l’escale est signalé et laissé.
 */
export function layoverDossierDiff(
  title: string | null | undefined,
  destination: string | null | undefined,
  items: Step[]
): LayoverDossierDiff | null {
  const plan = tripCityPlan(items);
  const currentTitle = (title || "").trim();
  const currentDest = (destination || "").trim();
  const titleHas = plan.layovers.some((city) => labelIncludesCity(currentTitle, city));
  const destHas = plan.layovers.some((city) => labelIncludesCity(currentDest, city));
  if (!titleHas && !destHas) return null;
  const next = nextStayLabels(currentTitle, currentDest, items, currentTitle || "Séjour");
  const titleAuto = titleHas && isAutoCityList(currentTitle, items);
  const destAuto = destHas && isAutoCityList(currentDest, items);
  const nextTitle = titleAuto ? next.title : currentTitle;
  const nextDest = destAuto && next.destinationChanged ? next.destination : currentDest;
  return {
    layovers: plan.layovers,
    title: titleAuto && nextTitle !== currentTitle ? { from: currentTitle, to: nextTitle } : null,
    destination: destAuto && nextDest !== currentDest ? { from: currentDest, to: nextDest } : null,
    customTitle: titleHas && !titleAuto,
    customDestination: destHas && !destAuto,
  };
}

export type OriginDossierDiff = {
  origins: string[];
  title: LayoverFieldChange | null;
  destination: LayoverFieldChange | null;
  customTitle: boolean;
  customDestination: boolean;
};

/**
 * Ce que le rattrapage écrirait. Rien si le titre et la destination ne citent pas le domicile.
 * Un nom choisi qui cite le domicile est signalé et laissé.
 */
export function originDossierDiff(
  title: string | null | undefined,
  destination: string | null | undefined,
  items: Step[],
  homeCity?: string | null
): OriginDossierDiff | null {
  const plan = tripCityPlan(items, undefined, homeCity);
  const currentTitle = (title || "").trim();
  const currentDest = (destination || "").trim();
  const hit = (value: string) => plan.origins.some((city) => labelIncludesCity(value, city));
  if (!hit(currentTitle) && !hit(currentDest)) return null;
  const next = nextStayLabels(currentTitle, currentDest, items, currentTitle || "Séjour", homeCity);
  const titleAuto = hit(currentTitle) && isAutoCityList(currentTitle, items, homeCity);
  const destAuto = hit(currentDest) && isAutoCityList(currentDest, items, homeCity);
  const nextTitle = titleAuto ? next.title : currentTitle;
  const nextDest = destAuto && next.destinationChanged ? next.destination : currentDest;
  return {
    origins: plan.origins,
    title: titleAuto && nextTitle !== currentTitle ? { from: currentTitle, to: nextTitle } : null,
    destination: destAuto && nextDest !== currentDest ? { from: currentDest, to: nextDest } : null,
    customTitle: hit(currentTitle) && !titleAuto,
    customDestination: hit(currentDest) && !destAuto,
  };
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
