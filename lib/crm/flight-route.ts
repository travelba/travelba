import { inferAirlineIata } from "./brand-marks";
import { inferAirportIata } from "./ingest-parse";
import { foldLetters } from "./text";

/**
 * Avertissement posé quand le billet ne porte pas les codes IATA.
 * Retiré dès que les deux codes sont connus, imprimés ou déduits.
 */
export function isMissingIataReason(reason: string) {
  const folded = foldLetters(reason);
  return folded.includes("iata") && folded.includes("imprim");
}

/** Retire l’avertissement IATA quand les deux codes sont là. Les autres doutes restent. */
export function clearPrintedIataDoubt(details: Record<string, unknown>) {
  const from = iataCode(details.from);
  const to = iataCode(details.to);
  if (!from || !to) return false;
  const reason = typeof details.review_reason === "string" ? details.review_reason : "";
  if (!isMissingIataReason(reason)) return false;
  delete details.needs_review;
  delete details.review_reason;
  return true;
}

type RouteItem = {
  kind?: string | null;
  title?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown> | null;
};

/** Compagnie dont l’aéroport parisien ou londonien est unique. */
const AIRLINE_CITY_IATA: { airline: string; city: string; iata: string }[] = [
  { airline: "EK", city: "paris", iata: "CDG" },
  { airline: "EK", city: "londres", iata: "LHR" },
  { airline: "EK", city: "london", iata: "LHR" },
  { airline: "QR", city: "paris", iata: "CDG" },
  { airline: "QR", city: "londres", iata: "LHR" },
  { airline: "QR", city: "london", iata: "LHR" },
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function iataCode(value: unknown) {
  const code = text(value).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function refOf(item: RouteItem) {
  return (item.confirmation_ref || text(item.details?.pnr)).replace(/\s+/g, "").toUpperCase();
}

function fileOf(item: RouteItem) {
  return text(item.details?.source_file_name);
}

function airlineOf(item: RouteItem) {
  const details = item.details || {};
  return inferAirlineIata({
    airline: text(details.airline) || null,
    airline_iata: text(details.airline_iata) || null,
    flight_number: text(details.flight_number) || null,
  });
}

function hubIata(airline: string | null, city: string) {
  if (!airline || !city) return "";
  const key = foldLetters(city);
  return AIRLINE_CITY_IATA.find((row) => row.airline === airline && row.city === key)?.iata || "";
}

function iataForCity(city: string, airline: string | null) {
  if (!city) return "";
  return inferAirportIata(city)?.iata || hubIata(airline, city);
}

function lonePlace(item: RouteItem) {
  const details = item.details || {};
  if (text(details.city_from) || text(details.city_to)) return "";
  const title = text(item.title);
  if (!title || title.includes("→") || title.length > 40 || /\d/.test(title)) return "";
  if (/^(vol|flight|trajet)$/i.test(title)) return "";
  return title;
}

function writeRoute(item: RouteItem, patch: { cityFrom?: string; cityTo?: string; from?: string; to?: string }) {
  const details = { ...(item.details || {}) };
  let changed = false;
  if (patch.cityFrom && !text(details.city_from)) {
    details.city_from = patch.cityFrom;
    changed = true;
  }
  if (patch.cityTo && !text(details.city_to)) {
    details.city_to = patch.cityTo;
    changed = true;
  }
  if (patch.from && !iataCode(details.from)) {
    details.from = patch.from;
    changed = true;
  }
  if (patch.to && !iataCode(details.to)) {
    details.to = patch.to;
    changed = true;
  }
  if (!changed) return false;
  item.details = details;
  return true;
}

/** Villes du titre « A → B », puis code d’une ville sans ambiguïté ou du hub de la compagnie. */
function fillOwn(item: RouteItem) {
  const details = item.details || {};
  let cityFrom = text(details.city_from);
  let cityTo = text(details.city_to);
  const title = text(item.title);
  if ((!cityFrom || !cityTo) && title.includes("→")) {
    const [left, right] = title.split("→").map((part) => part.trim());
    if (!cityFrom && left) cityFrom = left;
    if (!cityTo && right) cityTo = right;
  }
  const airline = airlineOf(item);
  const from = iataCode(details.from) || iataForCity(cityFrom, airline);
  const to = iataCode(details.to) || iataForCity(cityTo, airline);
  return writeRoute(item, {
    cityFrom: cityFrom || undefined,
    cityTo: cityTo || undefined,
    from: from || undefined,
    to: to || undefined,
  });
}

/** L’arrivée d’un segment est le départ du suivant, dans la même réservation. */
function linkLegs(prev: RouteItem, next: RouteItem) {
  const arrivalCity = text(prev.details?.city_to);
  const arrivalIata = iataCode(prev.details?.to);
  const lone = lonePlace(next);
  let changed = false;
  if (lone && arrivalCity && foldLetters(lone) !== foldLetters(arrivalCity)) {
    changed = writeRoute(next, { cityFrom: arrivalCity, cityTo: lone, from: arrivalIata || undefined }) || changed;
  }
  const nextCity = text(next.details?.city_from);
  const sameCity = !nextCity || foldLetters(nextCity) === foldLetters(arrivalCity);
  if (sameCity) {
    changed =
      writeRoute(next, {
        cityFrom: arrivalCity || undefined,
        from: arrivalIata || undefined,
      }) || changed;
  }
  const nextDepartureCity = text(next.details?.city_from);
  const nextDepartureIata = iataCode(next.details?.from);
  const prevCity = text(prev.details?.city_to);
  const prevSame = !prevCity || foldLetters(prevCity) === foldLetters(nextDepartureCity);
  if (prevSame && nextDepartureCity) {
    changed =
      writeRoute(prev, {
        cityTo: nextDepartureCity,
        to: nextDepartureIata || undefined,
      }) || changed;
  }
  return changed;
}

function finish(item: RouteItem) {
  fillOwn(item);
  const cityFrom = text(item.details?.city_from);
  const cityTo = text(item.details?.city_to);
  const title = text(item.title);
  let changed = false;
  if (cityFrom && cityTo && !title.includes("→")) {
    item.title = `${cityFrom} → ${cityTo}`;
    changed = true;
  }
  if (item.details && clearPrintedIataDoubt(item.details)) changed = true;
  return changed;
}

function groupFlights<T extends RouteItem>(flights: { item: T; index: number }[]) {
  const dated = flights.filter((row) => text(row.item.start_at));
  const byRef = new Map<string, { item: T; index: number }[]>();
  const byFile = new Map<string, { item: T; index: number }[]>();
  const fileRefs = new Map<string, Set<string>>();
  for (const row of dated) {
    const ref = refOf(row.item);
    const file = fileOf(row.item);
    if (ref && file) {
      const set = fileRefs.get(file) || new Set<string>();
      set.add(ref);
      fileRefs.set(file, set);
    }
    if (ref) {
      const list = byRef.get(ref) || [];
      list.push(row);
      byRef.set(ref, list);
    }
  }
  for (const row of dated) {
    if (refOf(row.item)) continue;
    const file = fileOf(row.item);
    if (!file) continue;
    const refs = fileRefs.get(file);
    if (refs && refs.size === 1) {
      const ref = [...refs][0];
      const list = byRef.get(ref) || [];
      list.push(row);
      byRef.set(ref, list);
      continue;
    }
    if (!refs || refs.size === 0) {
      const list = byFile.get(file) || [];
      list.push(row);
      byFile.set(file, list);
    }
  }
  const groups = [...byRef.values(), ...byFile.values()];
  for (const group of groups) {
    group.sort((a, b) => text(a.item.start_at).localeCompare(text(b.item.start_at)) || a.index - b.index);
  }
  return groups;
}

/**
 * Complète les vols d’un même billet : ville → code quand c’est sans ambiguïté,
 * puis départ du segment suivant = arrivée du précédent. Un code qui reste inconnu
 * garde l’avertissement. Le titre devient « origine → destination » dès que les deux villes sont là.
 */
export function completeFlightRoutes<T extends RouteItem>(items: T[]): T[] {
  if (!items.some((item) => item.kind === "flight")) return items;
  let changed = false;
  const next = items.map((item) => {
    if (item.kind !== "flight") return item;
    const copy = { ...item, details: { ...(item.details || {}) } };
    if (fillOwn(copy)) changed = true;
    return copy;
  });
  const flights = next.flatMap((item, index) => (item.kind === "flight" ? [{ item, index }] : []));
  for (const group of groupFlights(flights)) {
    for (let i = 0; i < group.length - 1; i += 1) {
      if (linkLegs(group[i].item, group[i + 1].item)) changed = true;
    }
  }
  for (const row of flights) {
    if (finish(row.item)) changed = true;
  }
  return changed ? next : items;
}
