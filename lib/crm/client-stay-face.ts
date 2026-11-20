import { cityPlaceKey } from "@/lib/crm/city-names";
import { clientVisibleItems, stayArrivalPlaces, tripHeadline } from "@/lib/crm/carnet";
import { countryCodeForPlace, isCountryName } from "@/lib/crm/cover-catalog";
import { splitPlaceLabel, tripCityPlan, type TripStep } from "@/lib/crm/layover";
import { isAutoCityList, nextStayLabels, staySpanFromSteps, stayTitleFromItems } from "@/lib/crm/staff-stay";
import { countsAsCarnetCard, isActiveItem } from "@/lib/crm/types";

/** Carte du séjour, avec le drapeau que l’agence pose en cachant. */
export type StayFaceItem = TripStep & { visible_to_client?: boolean | null };

export type ClientStayFace = {
  title: string;
  destination: string;
  start: string | null;
  end: string | null;
  /** Villes de la photo et de la météo. */
  places: string[];
  items: StayFaceItem[];
  /** Vrai quand au moins une carte visible a servi. Sinon, les champs saisis. */
  fromCards: boolean;
};

function knownPlace(part: string) {
  const key = cityPlaceKey(part);
  if (!key) return false;
  return Boolean(countryCodeForPlace(key) || isCountryName(key));
}

/**
 * Une liste de villes posée par les cartes, pas un nom choisi (« 40 ans »).
 * Une ville du libellé absente des cartes fournies vient d’une carte qui n’est pas dans ce lot
 * (souvent une carte cachée déjà retirée de la liste).
 */
function labelIsAuto(value: string | null | undefined, items: StayFaceItem[], homeCity?: string | null) {
  const text = (value || "").trim();
  if (!text) return true;
  if (isAutoCityList(text, items, homeCity)) return true;
  const parts = splitPlaceLabel(text);
  if (parts.length < 2 || !parts.every((part) => knownPlace(part))) return false;
  const plan = tripCityPlan(items, undefined, homeCity);
  const keys = new Set(
    [...plan.cities, ...plan.destinations, ...plan.layovers, ...plan.origins]
      .map((city) => cityPlaceKey(city))
      .filter(Boolean)
  );
  return parts.some((part) => !keys.has(cityPlaceKey(part)));
}

/**
 * Destination lue par le client.
 * Le titre saisi est la source du nom. Une colonne destination qui ne nomme pas
 * les villes du séjour (ville de départ, premier segment d’un ancien titre) ne reste pas.
 */
export function clientFacingDestination(input: {
  stored?: string | null;
  suggested?: string | null;
  auto?: boolean;
  resolved?: string | null;
}) {
  const stored = (input.stored || "").trim();
  const suggested = (input.suggested || "").trim();
  const resolved = (input.resolved || "").trim();
  if (!suggested) return input.auto ? stored : resolved;
  if (!stored || input.auto) return suggested;
  const stayKeys = new Set(splitPlaceLabel(suggested).map((part) => cityPlaceKey(part)).filter(Boolean));
  const parts = splitPlaceLabel(stored);
  const kept = parts.filter((part) => stayKeys.has(cityPlaceKey(part)));
  if (kept.length !== parts.length) return suggested;
  return resolved || suggested;
}

/** Destination affichée. Avec des cartes, la colonne stockée ne revient pas si le visage l’a écartée. */
export function shownStayDestination(
  face: Pick<ClientStayFace, "destination" | "fromCards">,
  stored?: string | null
) {
  const fromFace = (face.destination || "").trim();
  if (fromFace) return fromFace;
  if (face.fromCards) return "";
  return (stored || "").trim();
}

function stayedCities(items: StayFaceItem[], homeCity?: string | null) {
  const plan = tripCityPlan(items, undefined, homeCity);
  if (plan.destinations.length) return plan.destinations;
  return plan.cities.filter((city) => !plan.origins.some((origin) => cityPlaceKey(origin) === cityPlaceKey(city)));
}

/**
 * Ce que le client lit du dossier : titre, villes, dates, photo et météo.
 * Seulement les cartes visibles. Sans carte visible, les champs saisis du dossier.
 * Un nom choisi reste. Une liste de villes générée depuis les cartes est recalculée.
 * Le titre stocké pour l’agence ne change pas.
 */
export function clientStayFace(input: {
  title?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  items?: StayFaceItem[] | null;
  homeCity?: string | null;
  fallback?: string;
}): ClientStayFace {
  const fallback = input.fallback ?? "Séjour";
  const all = input.items || [];
  const visible = clientVisibleItems(all).filter((item) => countsAsCarnetCard(item.kind) && isActiveItem(item));
  const storedTitle = (input.title || "").trim();
  const storedDest = (input.destination || "").trim();
  if (!visible.length) {
    const title = tripHeadline(storedTitle, storedDest, fallback);
    return {
      title,
      destination: storedDest,
      start: input.startDate || null,
      end: input.endDate || null,
      places: stayArrivalPlaces(storedDest, storedTitle),
      items: [],
      fromCards: false,
    };
  }

  const stayed = stayedCities(visible, input.homeCity);
  const suggested = stayed.join(" · ");
  const autoTitle = labelIsAuto(storedTitle, all, input.homeCity);
  const autoDest = labelIsAuto(storedDest, all, input.homeCity);
  const title = storedTitle
    ? autoTitle
      ? suggested || storedTitle
      : stayTitleFromItems(storedTitle, autoDest ? suggested : storedDest, visible, fallback, input.homeCity)
    : suggested || fallback;
  const labels = nextStayLabels(
    autoTitle ? suggested || storedTitle : storedTitle,
    autoDest ? suggested || storedDest : storedDest,
    visible,
    fallback,
    input.homeCity
  );
  const destination = clientFacingDestination({
    stored: storedDest,
    suggested,
    auto: autoDest,
    resolved: autoDest ? suggested || storedDest : labels.destination,
  });
  const span = staySpanFromSteps(visible);
  const places = stayArrivalPlaces(null, null, visible);
  return {
    title: title || fallback,
    destination,
    start: span?.start || input.startDate || null,
    end: span?.end || input.endDate || null,
    places: places.length ? places : stayArrivalPlaces(destination, title),
    items: visible,
    fromCards: true,
  };
}

/** Nom du dossier sur un document. Le titre saisi gagne. Vide : les villes du séjour, jamais une destination stockée à part. */
export function dossierShownName(input: {
  title?: string | null;
  items?: StayFaceItem[] | null;
  homeCity?: string | null;
  fallback?: string | null;
}) {
  const face = clientStayFace({
    title: input.title,
    destination: "",
    items: input.items,
    homeCity: input.homeCity,
    fallback: "",
  });
  return (face.title || "").trim() || (input.fallback || "").trim();
}

/** Recopie le dossier avec le visage client. Le reste de la ligne (montant, statut) ne change pas. */
export function applyClientStayFace<
  T extends {
    title?: string | null;
    destination?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  },
>(booking: T, face: ClientStayFace): T {
  return {
    ...booking,
    title: face.title,
    destination: face.destination,
    start_date: face.start,
    end_date: face.end,
  };
}
