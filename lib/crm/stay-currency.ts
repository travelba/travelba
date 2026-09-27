export const STAY_CURRENCIES = ["EUR", "USD", "CHF", "GBP"] as const;

export type StayCurrency = (typeof STAY_CURRENCIES)[number];

const ALIASES: Record<string, StayCurrency> = {
  EUR: "EUR",
  EURO: "EUR",
  EUROS: "EUR",
  "€": "EUR",
  USD: "USD",
  DOLLAR: "USD",
  DOLLARS: "USD",
  $: "USD",
  US$: "USD",
  CHF: "CHF",
  FS: "CHF",
  GBP: "GBP",
  POUND: "GBP",
  POUNDS: "GBP",
  "£": "GBP",
};

/** Devise du séjour : EUR, USD, CHF ou GBP. Hors liste → EUR. */
export function stayCurrency(value: unknown): StayCurrency {
  const raw = String(value ?? "").trim().toUpperCase();
  if ((STAY_CURRENCIES as readonly string[]).includes(raw)) return raw as StayCurrency;
  return ALIASES[raw] || "EUR";
}

/**
 * Enregistrement du séjour : le choix du formulaire.
 * `document_currency` de chaque carte ne le remplace pas.
 */
export function bookingCurrencyFromReview(
  choice: unknown,
  _items?: { details?: { document_currency?: unknown } | null }[] | null
): StayCurrency {
  return stayCurrency(choice);
}
