export type VisaCorridor = "IL" | "US" | "GB";

/** Frais d’État publiés. Le plafond carte est leur couverture en euros, pas un forfait. */
export const VISA_OFFICIAL = {
  IL: { amount: 25, currency: "ILS" as const, taxLabel: "Taxe ETA-IL", countryName: "Israël" },
  US: { amount: 40.27, currency: "USD" as const, taxLabel: "Taxe ESTA", countryName: "États-Unis" },
  GB: { amount: 20, currency: "GBP" as const, taxLabel: "Taxe ETA Royaume-Uni", countryName: "Royaume-Uni" },
};

/** Unités de devise étrangère pour 1 euro (cours BCE). */
export type EurFx = { USD: number; GBP: number; ILS: number };

/** Le plafond carte est toujours 30 % au-dessus de la dépense prévue. */
export const FX_COVER = 1.3;

/** Dernier cours lu (24 septembre 2026) si le flux BCE est injoignable. */
export const ECB_SNAPSHOT: { date: string; rates: EurFx } = {
  date: "2026-09-24",
  rates: { USD: 1.1367, GBP: 0.85986, ILS: 3.4649 },
};

export function parseEcbRates(xml: string): { date: string; rates: EurFx } | null {
  const date = xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1];
  const usd = Number(xml.match(/currency='USD' rate='([0-9.]+)'/)?.[1]);
  const gbp = Number(xml.match(/currency='GBP' rate='([0-9.]+)'/)?.[1]);
  const ils = Number(xml.match(/currency='ILS' rate='([0-9.]+)'/)?.[1]);
  if (!date || !(usd > 0) || !(gbp > 0) || !(ils > 0)) return null;
  return { date, rates: { USD: usd, GBP: gbp, ILS: ils } };
}

/** Cours BCE du 19 octobre 2026 (unités de devise pour 1 euro), si le flux est injoignable. */
export const HOTEL_FX_SNAPSHOT: { date: string; rates: Record<string, number> } = {
  date: "2026-10-19",
  rates: {
    USD: 1.1225,
    JPY: 177.63,
    CZK: 24.343,
    DKK: 7.4747,
    GBP: 0.84205,
    HUF: 363.4,
    PLN: 4.3713,
    RON: 5.3264,
    SEK: 11.104,
    CHF: 0.9261,
    ISK: 136.4,
    NOK: 10.5555,
    TRY: 55.6227,
    AUD: 1.6068,
    BRL: 5.6633,
    CAD: 1.5798,
    CNY: 7.4991,
    HKD: 8.8097,
    IDR: 20253.16,
    ILS: 3.489,
    INR: 106.559,
    KRW: 1492.35,
    MXN: 20.7481,
    MYR: 4.5826,
    NZD: 1.9792,
    PHP: 70.715,
    SGD: 1.4357,
    THB: 37.665,
    ZAR: 18.4469,
  },
};

/** Toutes les devises du flux quotidien BCE. */
export function parseEcbBoard(xml: string): { date: string; rates: Record<string, number> } | null {
  const date = xml.match(/time='(\d{4}-\d{2}-\d{2})'/)?.[1];
  if (!date) return null;
  const rates: Record<string, number> = {};
  for (const match of xml.matchAll(/currency='([A-Z]{3})' rate='([0-9.]+)'/g)) {
    const value = Number(match[2]);
    if (value > 0) rates[match[1]] = value;
  }
  if (!(rates.USD > 0) || !(rates.SGD > 0) || !(rates.HKD > 0)) return null;
  return { date, rates };
}

/** Frankfurter republie le cours BCE : `{ rates: { SGD: 1.43 } }` pour 1 euro. */
export function parseFrankfurterRates(json: unknown): Record<string, number> | null {
  if (!json || typeof json !== "object") return null;
  const rates = (json as { rates?: unknown }).rates;
  if (!rates || typeof rates !== "object") return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(rates)) {
    if (/^[A-Z]{3}$/.test(key) && typeof value === "number" && value > 0) out[key] = value;
  }
  if (!(out.SGD > 0) || !(out.HKD > 0)) return null;
  return out;
}

export function coverCents(foreignAmount: number, unitsPerEur: number) {
  if (!(foreignAmount > 0) || !(unitsPerEur > 0)) return null;
  return Math.ceil((foreignAmount / unitsPerEur) * FX_COVER * 100);
}

export function corridorCeilingCents(country: VisaCorridor, travelers: number, rates: EurFx) {
  const fee = VISA_OFFICIAL[country];
  const unit = coverCents(fee.amount, rates[fee.currency]);
  if (unit == null) return null;
  return unit * Math.max(1, Math.floor(travelers) || 1);
}

export function combinedCeilingCents(countries: VisaCorridor[], travelers: number, rates: EurFx) {
  let total = 0;
  for (const country of countries) {
    const part = corridorCeilingCents(country, travelers, rates);
    if (part == null) return null;
    total += part;
  }
  return total;
}

export function centsToEur(cents: number) {
  return Math.round(cents) / 100;
}
