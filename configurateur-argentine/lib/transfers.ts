import { stages } from "./catalog";

export type TransferMode = "prive" | "partage" | "aucun";

export type TransferOption = {
  id: TransferMode;
  label: string;
  /** null = sur devis, hors du total chiffré. Le seed ne donne pas de tarif transfert. */
  usdCouple: number | null;
};

export const transferOptions: TransferOption[] = [
  { id: "prive", label: "Transfert privé", usdCouple: null },
  { id: "partage", label: "Transfert partagé", usdCouple: null },
  { id: "aucun", label: "Sans transfert", usdCouple: 0 },
];

export type Leg = {
  id: string;
  dayId: string;
  from: string;
  to: string;
  title: string;
};

export const legs: Leg[] = [
  {
    id: "arrivee",
    dayId: stages[0]?.days[0] ?? "J1",
    from: "Aéroport de Buenos Aires",
    to: stages[0]?.label ?? "Buenos Aires",
    title: "Arrivée · aéroport → hôtel",
  },
  ...stages.slice(1).map((stage, index) => {
    const previous = stages[index];
    return {
      id: `${previous.id}__${stage.id}`,
      dayId: stage.days[0],
      from: previous.label,
      to: stage.label,
      title: `${previous.label} → ${stage.label}`,
    };
  }),
];

export function legForDay(dayId: string): Leg | undefined {
  return legs.find((leg) => leg.dayId === dayId);
}

export function transferOption(mode: TransferMode): TransferOption {
  const option = transferOptions.find((item) => item.id === mode);
  if (!option) throw new Error(`Mode de transfert inconnu : ${mode}`);
  return option;
}
