export type TrainFareClasse = "2de" | "1re";
export type TrainFareTarif = "non_remboursable" | "flex";

type FarePrices = { non_remboursable?: number | null; flex?: number | null };
type PricedLeg = { prix?: { "2de"?: FarePrices | null; "1re"?: FarePrices | null } | null };

export type TrainFare = {
  classe: TrainFareClasse;
  tarif: TrainFareTarif;
  titre: string;
};

const CLASSES: TrainFareClasse[] = ["2de", "1re"];
const TARIFS: TrainFareTarif[] = ["non_remboursable", "flex"];

export function fareButtonTitle(classe: TrainFareClasse, tarif: TrainFareTarif) {
  return `${classe} ${tarif === "flex" ? "Flex" : "Standard"}`;
}

/** Tarifs chiffrés sur chaque train choisi. Un Flex absent d’un seul sens n’est pas proposé. */
export function availableTrainFares(offers: PricedLeg[]): TrainFare[] {
  const legs = offers.filter(Boolean);
  if (!legs.length) return [];
  const fares: TrainFare[] = [];
  for (const classe of CLASSES) {
    for (const tarif of TARIFS) {
      const priced = legs.every((offer) => typeof offer.prix?.[classe]?.[tarif] === "number");
      if (priced) fares.push({ classe, tarif, titre: fareButtonTitle(classe, tarif) });
    }
  }
  return fares;
}

export function trainCombinationsBody() {
  return "Ce tarif n’est pas dispo sur ces trains. Choisis une autre combinaison. Le prix arrive juste après.";
}
