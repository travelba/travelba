import { cityLabel, cityPlaceKey, foldCityName, isOriginHub } from "./city-names";
import { countryCodeForPlace, isCountryName } from "./cover-catalog";
import { tripCityPlan, type TripStep } from "./layover";

/**
 * Villes où l’on séjourne. Le domicile et les escales n’y entrent pas.
 */
export function stayDestinationNames(input: {
  title?: string | null;
  destination?: string | null;
  items?: TripStep[] | null;
}) {
  if (input.items?.length) {
    const found = tripCityPlan(input.items).destinations;
    if (found.length) return found;
  }
  const fromDestination = namesFromLabel(input.destination);
  if (fromDestination.length) return fromDestination;
  return namesFromLabel(input.title);
}

/** « Tel Aviv · Seychelles ». */
export function stayDestinationLine(input: Parameters<typeof stayDestinationNames>[0]) {
  return stayDestinationNames(input).join(" · ");
}

/** « à Tel Aviv et aux Seychelles ». */
export function stayDestinationPhrase(input: Parameters<typeof stayDestinationNames>[0]) {
  return stayAtPhrase(stayDestinationNames(input)) || null;
}

/** Deux lieux : « et ». Trois et plus : virgules, « et » devant le dernier. */
export function stayAtPhrase(names: string[]) {
  const phrases = names.map((name) => placeWithPreposition(name)).filter(Boolean);
  if (phrases.length <= 1) return phrases[0] || "";
  if (phrases.length === 2) return `${phrases[0]} et ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")} et ${phrases[phrases.length - 1]}`;
}

/** Une ville : « à ». Un pays : « aux », « en » ou « au ». */
export function placeWithPreposition(name: string, kind: "auto" | "city" | "country" = "auto") {
  const raw = name.replace(/[\r\n]+/g, " ").trim();
  if (!raw) return "";
  const key = foldCityName(raw);
  const asCountry = kind === "country" || (kind === "auto" && isCountryName(key));
  if (!asCountry) {
    if (/^le\s+/i.test(raw)) return `au ${raw.replace(/^le\s+/i, "")}`;
    if (/^les\s+/i.test(raw)) return `aux ${raw.replace(/^les\s+/i, "")}`;
    return `à ${raw}`;
  }
  return countryPreposition(raw, key);
}

/** Phrase déjà formée, ou liste « Paris · Tel Aviv · Seychelles ». Un hub seul ne reste pas. */
export function stayPhrase(value: string) {
  const raw = value.replace(/[\r\n]+/g, " ").trim();
  if (!raw) return "";
  if (/^(?:à|au|aux|en)\s+/i.test(raw)) return raw;
  const parts = raw
    .split(/\s*(?:·|\||\/|→|->|—|–|\s+-\s+)\s*/)
    .map((part) => part.split(",")[0]?.trim() || "")
    .filter(Boolean);
  if (parts.length > 1) {
    const stayed = parts.filter((part) => !isOriginHub(part));
    if (!stayed.length) return "";
    return stayAtPhrase(stayed);
  }
  if (isOriginHub(raw)) return "";
  return placeWithPreposition(raw);
}

const AUX_CODES = new Set(["sc", "mv", "us", "nl", "ph", "ae", "bs", "km", "fj", "sb"]);
const AT_CODES = new Set(["cu", "mg", "mt", "cy", "lk", "sg", "mc", "ht", "mu", "bh", "dj"]);
const AU_E_CODES = new Set(["mx", "mz", "kh", "bz", "zw", "sr"]);

function countryPreposition(name: string, key: string) {
  const code = countryCodeForPlace(key);
  if (code && AUX_CODES.has(code)) return `aux ${name}`;
  if (code && AT_CODES.has(code)) return `à ${name}`;
  if (code && AU_E_CODES.has(code)) return `au ${name}`;
  if (/[eé]$/i.test(name) || /^[aeiouhéèêëh]/i.test(name)) return `en ${name}`;
  return `au ${name}`;
}

function namesFromLabel(value: string | null | undefined) {
  const found: string[] = [];
  for (const token of (value || "").split(/\s*(?:·|\||\/|→|->|—|–|\s+-\s+)\s*/)) {
    const head = token.split(",")[0]?.trim() || "";
    if (head) pushName(found, head);
  }
  return found;
}

function pushName(found: string[], value: string) {
  const label = cityLabel(value);
  const key = cityPlaceKey(label);
  if (!label || !key || isOriginHub(label)) return;
  if (found.some((item) => cityPlaceKey(item) === key)) return;
  found.push(label);
}
