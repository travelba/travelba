/** Prix d’hébergement du Concierge. Rien n’est envoyé au client depuis ici. Aucun plancher de marge. */

export type AccommodationRate = {
  net: number;
  currency?: string | null;
  commissionable: boolean;
  /** 0.10 = 10 % reversés par l’hôtel. Ignoré si le tarif n’est pas commissionnable. */
  hotelCommission?: number | null;
};

export type PricedAccommodation = {
  net: number;
  sell: number;
  currency: string;
  /** Ce que l’agence garde, en devise, rapporté au net. */
  margin: number;
  marginOfNet: number;
  /** Majoration ajoutée au prix client. Zéro : le prix affiché reste le net. */
  addedRate: number;
  coveredByCommission: number;
};

function cents(amount: number) {
  return Math.round(amount * 100) / 100;
}

/**
 * Le prix client est le net. Aucune majoration n’est ajoutée.
 * Tarif commissionnable : la commission hôtel est le gain, elle ne change pas le prix affiché.
 */
export function priceAccommodation(rate: AccommodationRate): PricedAccommodation | null {
  const net = cents(rate.net);
  if (!(net > 0)) return null;
  const currency = (rate.currency || "EUR").trim().toUpperCase() || "EUR";
  const covered = rate.commissionable ? Math.max(0, Number(rate.hotelCommission) || 0) : 0;
  const margin = cents(net * covered);
  return {
    net,
    sell: net,
    currency,
    margin,
    marginOfNet: margin / net,
    addedRate: 0,
    coveredByCommission: covered,
  };
}
