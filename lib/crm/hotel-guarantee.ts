/** Trois propositions pour l’étape Garantie. Le cadre du partenaire ne se retouche pas. */
export const GUARANTEE_VARIANTS = [
  {
    id: "nuit",
    option: "A",
    title: "Nuit",
    line: "Panneau marine, formulaire dans un écrin clair.",
  },
  {
    id: "filet",
    option: "B",
    title: "Filet",
    line: "Carte claire, liseré champagne.",
  },
  {
    id: "salon",
    option: "C",
    title: "Salon",
    line: "Le séjour d’un côté, la carte de l’autre.",
  },
] as const;

export type GuaranteeVariantId = (typeof GUARANTEE_VARIANTS)[number]["id"];
export type GuaranteeFrameState = "chargement" | "prete" | "enregistree";

export const GUARANTEE_COPY = {
  step: "Récapitulatif",
  kicker: "Paiement sécurisé",
  title: "Garantie de la réservation",
  trust: "Votre carte sert uniquement de garantie. Elle est conservée par un partenaire de paiement sécurisé.",
  loading: "Le formulaire sécurisé se charge…",
  saved: "Carte enregistrée. Confirmation en cours…",
  cta: "Confirmer le séjour",
  wait: "Le bouton s’active une fois la carte enregistrée.",
  pay: "Le client paie lui-même",
  payNote: "La carte garantit la réservation. L’hôtel prélève selon les conditions du tarif. Aucun encaissement par l’agence.",
} as const;

export function guaranteeVariant(value: string | undefined): GuaranteeVariantId {
  if (value === "filet" || value === "salon" || value === "nuit") return value;
  return "nuit";
}

export function guaranteeFrameState(value: string | undefined): GuaranteeFrameState {
  if (value === "chargement" || value === "enregistree") return value;
  return "prete";
}
