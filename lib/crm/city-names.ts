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
  singapour: "singapore",
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
  singapore: "Singapour",
  prague: "Prague",
  moscow: "Moscou",
  beijing: "Pékin",
  "new york": "New York",
  paris: "Paris",
};

/** Aéroports du domicile : la même ville que Paris. */
const AIRPORT_CITY: Record<string, string> = {
  cdg: "paris",
  ory: "paris",
  lbg: "paris",
  bva: "paris",
};

/** Hubs de départ FR. La photo les ignore dès qu’une autre ville de séjour existe. Un aller simple vers Paris les garde. */
const ORIGIN_HUBS = /^(paris|cdg|ory|lbg|bva|france|ile-de-france|île-de-france)$/i;

export function isOriginHub(value: string) {
  return ORIGIN_HUBS.test((value || "").trim());
}

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
  const named = CITY_ALIASES[folded] || folded;
  return AIRPORT_CITY[named] || named;
}

/** Nom affiché. Une graphie connue prend le libellé français. */
export function cityLabel(value: string) {
  const token = (value.split(",")[0] || "").trim();
  if (!token) return "";
  const key = cityPlaceKey(token);
  return CITY_LABELS[key] || token;
}
