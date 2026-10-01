/** Graphies ramenées à une même ville. La clé est déjà pliée. */
export const CITY_ALIASES: Record<string, string> = {
  londres: "london",
  geneve: "geneva",
  venise: "venice",
  venezia: "venice",
  roma: "rome",
  milano: "milan",
  firenze: "florence",
  munchen: "munich",
  muenchen: "munich",
  wien: "vienna",
  bruxelles: "brussels",
  lisboa: "lisbon",
  lisbonne: "lisbon",
  praha: "prague",
  moscou: "moscow",
  pekin: "beijing",
  nyc: "new york",
};

/** Libellé français quand plusieurs graphies désignent la même ville. */
const CITY_LABELS: Record<string, string> = {
  milan: "Milan",
  rome: "Rome",
  london: "Londres",
  geneva: "Genève",
  venice: "Venise",
  florence: "Florence",
  munich: "Munich",
  vienna: "Vienne",
  brussels: "Bruxelles",
  lisbon: "Lisbonne",
  prague: "Prague",
  moscow: "Moscou",
  beijing: "Pékin",
  "new york": "New York",
};

export function foldCityName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Même ville : Milano = Milan, Roma = Rome. */
export function cityPlaceKey(value: string) {
  const token = (value.split(",")[0] || "").trim();
  const folded = foldCityName(token);
  if (!folded) return "";
  return CITY_ALIASES[folded] || folded;
}

/** Nom affiché. Une graphie connue prend le libellé français. */
export function cityLabel(value: string) {
  const token = (value.split(",")[0] || "").trim();
  if (!token) return "";
  const key = cityPlaceKey(token);
  return CITY_LABELS[key] || token;
}
