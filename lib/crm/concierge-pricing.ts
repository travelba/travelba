/** Marge d’hébergement du Concierge. Rien n’est envoyé au client depuis ici. */

export const MIN_MARGIN_OF_NET = 0.12;
/** Points déjà comptés sur un tarif commissionnable, en plus de la commission hôtel. */
export const PLATFORM_POINTS = 0.02;

export type AccommodationRate = {
  net: number;
  currency?: string | null;
  commissionable: boolean;
  /** 0.10 = 10 % reversés par l’hôtel. Ignoré si le tarif n’est pas commissionnable. */
  hotelCommission?: number | null;
  /**
   * Commission attendue, même devise que le net. Elle compte dans les 12 %.
   * Si elle est indiquée, elle remplace le taux hôtel pour ne pas compter deux fois.
   */
  expectedCommission?: number | null;
};

export type PricedAccommodation = {
  net: number;
  sell: number;
  currency: string;
  /** Ce que l’agence garde, en devise, rapporté au net. */
  margin: number;
  marginOfNet: number;
  /** Majoration ajoutée au prix client. 0 si la commission couvre déjà 12 %. */
  addedRate: number;
  coveredByCommission: number;
};

function cents(amount: number) {
  return Math.round(amount * 100) / 100;
}

/**
 * Hébergement : la marge vaut au moins 12 % du net.
 * Tarif net : le prix client est le net majoré de 12 %.
 * Tarif commissionnable : commission hôtel + 2 %. S’il manque pour atteindre 12 %,
 * ce manque est ajouté au prix client. On ne rabote pas une commission déjà supérieure.
 * Une commission attendue (montant imprimé) compte dans les 12 %. Elle remplace le taux
 * hôtel quand les deux sont là. Sans tarif commissionnable, les 2 % de plateforme ne s’ajoutent pas.
 */
export function priceAccommodation(rate: AccommodationRate): PricedAccommodation | null {
  const net = cents(rate.net);
  if (!(net > 0)) return null;
  const currency = (rate.currency || "EUR").trim().toUpperCase() || "EUR";
  const expected = Math.max(0, Number(rate.expectedCommission) || 0);
  const expectedRate = expected > 0 ? expected / net : 0;
  if (!rate.commissionable && expectedRate <= 0) {
    const sell = cents(net * (1 + MIN_MARGIN_OF_NET));
    const margin = cents(sell - net);
    return {
      net,
      sell,
      currency,
      margin,
      marginOfNet: margin / net,
      addedRate: MIN_MARGIN_OF_NET,
      coveredByCommission: 0,
    };
  }
  const hotel = rate.commissionable ? Math.max(0, Number(rate.hotelCommission) || 0) : 0;
  const printed = expectedRate > 0 ? expectedRate : hotel;
  const covered = printed + (rate.commissionable ? PLATFORM_POINTS : 0);
  const addedRate = Math.max(0, MIN_MARGIN_OF_NET - covered);
  const sell = cents(net * (1 + addedRate));
  const margin = cents(sell - net + net * covered);
  return {
    net,
    sell,
    currency,
    margin,
    marginOfNet: margin / net,
    addedRate,
    coveredByCommission: covered,
  };
}
