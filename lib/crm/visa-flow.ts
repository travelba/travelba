import type { VisaCorridor } from "./visa-fees";

export const CLIENT_VISA_STEPS = ["preparation", "remplissage", "validation", "paiement", "piece"] as const;

export type ClientVisaStep = (typeof CLIENT_VISA_STEPS)[number];

const STEP_LABEL: Record<ClientVisaStep, string> = {
  preparation: "Préparation",
  remplissage: "Remplissage",
  validation: "Validation",
  paiement: "Paiement",
  piece: "Pièce",
};

const STEP_COPY: Record<ClientVisaStep, string> = {
  preparation: "L’agence réunit les pièces du voyage.",
  remplissage: "L’agence remplit le formulaire officiel.",
  validation: "L’agence vérifie le formulaire avant l’envoi.",
  paiement: "Paiement des frais officiels.",
  piece: "La pièce est dans Pièces.",
};

export function clientVisaTrack(step: ClientVisaStep) {
  const index = CLIENT_VISA_STEPS.indexOf(step);
  return CLIENT_VISA_STEPS.map((id, position) => ({
    id,
    label: STEP_LABEL[id],
    state: (step === "piece" || position < index ? "fait" : position === index ? "en cours" : "à venir") as
      | "fait"
      | "en cours"
      | "à venir",
  }));
}

export function clientVisaStepCopy(step: ClientVisaStep) {
  return STEP_COPY[step];
}

export type ClientVisaPhase = "à préparer" | "en cours" | "au coffre";

export function clientVisaPhase(input: { started: boolean; filed: boolean }): ClientVisaPhase {
  if (input.filed) return "au coffre";
  if (input.started) return "en cours";
  return "à préparer";
}

/** Ouvre le carnet sans révéler les prix déjà masqués. Une publication déjà faite reste visible. */
export function visibilityOnRequest(current: { visible: boolean; prices: boolean }) {
  return { visible: true, prices: current.prices };
}

export function paymentHold(pliantReady: boolean) {
  if (pliantReady) return null;
  return "Le parcours s’arrête au paiement : la carte Pliant n’est pas branchée. Le séjour est ouvert, sans les prix.";
}

export function nextPayAttempt(previous: number): "pay" | "retry" | "alert" {
  if (previous <= 0) return "pay";
  if (previous === 1) return "retry";
  return "alert";
}

export type EstaAnswers = {
  usAddress: string;
  employment: string;
  countriesVisited: string;
  priorRefusal: string;
};

export function estaReady(answers: Partial<EstaAnswers> | null | undefined) {
  if (!answers) return false;
  return Boolean(
    answers.usAddress?.trim() &&
      answers.employment?.trim() &&
      answers.countriesVisited?.trim() &&
      answers.priorRefusal?.trim()
  );
}

export function corridorNeedsAnswers(country: VisaCorridor) {
  return country === "US" || country === "GB";
}

/** Israël part sans questionnaire. États-Unis et Royaume-Uni attendent les réponses. */
export function agencyLaunchReady(country: VisaCorridor, answers: Partial<EstaAnswers> | null | undefined) {
  if (country === "IL") return true;
  if (country === "GB") return Boolean(answers?.priorRefusal?.trim());
  return estaReady(answers);
}

export function confirmAllowed(input: {
  already: VisaCorridor[];
  country: VisaCorridor;
  frenchPassports: number;
  esta?: Partial<EstaAnswers> | null;
  resumable?: boolean;
}) {
  if (input.already.includes(input.country) && !input.resumable) return "déjà demandé";
  if (input.frenchPassports < 1) return "passeport français manquant";
  if (input.country === "US" && !estaReady(input.esta)) return "questionnaire ESTA incomplet";
  if (input.country === "GB" && !input.esta?.priorRefusal?.trim()) return "antécédent de refus manquant";
  return null;
}
