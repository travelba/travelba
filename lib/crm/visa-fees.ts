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
