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
  preparation: "Nous réunissons les pièces du voyage.",
  remplissage: "Le formulaire officiel est en cours de remplissage.",
  validation: "Nous vérifions le formulaire avant de l’envoyer.",
  paiement: "Le paiement des frais officiels est en cours.",
  piece: "Votre autorisation est prête.",
};

export const VISA_WAIT_COPY = "Nous nous en occupons. Vous n’avez rien à faire pour le moment.";

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

export type VisaRunPhase = "prêt" | "à confirmer" | "paiement" | "piece" | "brouillon" | "bloqué";

/** Étape enregistrée → geste du header. Préparation et remplissage attendent la suite, pas un second lancement. */
export function phaseForSavedStep(step: ClientVisaStep | null | undefined): VisaRunPhase | null {
  if (!step) return null;
  if (step === "validation") return "à confirmer";
  if (step === "paiement") return "paiement";
  if (step === "piece") return "piece";
  return "prêt";
}

/** Un nouveau lancement ne revient pas en arrière une fois le récapitulatif, le paiement ou la pièce atteints. */
export function launchWouldRewind(step: ClientVisaStep | null | undefined) {
  return step === "remplissage" || step === "validation" || step === "paiement" || step === "piece";
}

/** Israël reste au remplissage du portail. États-Unis et Royaume-Uni passent au récapitulatif : Astra ne couvre que l’ETA-IL. */
export function stepAfterPrepare(country: VisaCorridor): ClientVisaStep {
  return country === "IL" ? "remplissage" : "validation";
}

export function headerVisaLabel(phase: VisaRunPhase | null, country: VisaCorridor) {
  if (phase === "piece") return "Pièce au coffre";
  if (phase === "paiement") return "Paiement en attente";
  if (phase === "à confirmer") return "Confirmer";
  if (phase === "bloqué" || (phase === "prêt" && country === "IL") || phase === "brouillon") return "Remplir le portail";
  if (phase === "prêt") return "Préparer le récapitulatif";
  return "Lancer le parcours";
}

export function readEstaAnswers(value: unknown): Partial<EstaAnswers> {
  if (!value || typeof value !== "object") return {};
  const row = value as Record<string, unknown>;
  const text = (key: keyof EstaAnswers) => (typeof row[key] === "string" ? row[key].trim() : "");
  return {
    usAddress: text("usAddress"),
    employment: text("employment"),
    countriesVisited: text("countriesVisited"),
    priorRefusal: text("priorRefusal"),
  };
}

export function mergeEstaAnswers(
  stored: Partial<EstaAnswers> | null | undefined,
  incoming: Partial<EstaAnswers> | null | undefined
): Partial<EstaAnswers> {
  const pick = (key: keyof EstaAnswers) => incoming?.[key]?.trim() || stored?.[key]?.trim() || "";
  return {
    usAddress: pick("usAddress"),
    employment: pick("employment"),
    countriesVisited: pick("countriesVisited"),
    priorRefusal: pick("priorRefusal"),
  };
}

export function hasEstaAnswers(answers: Partial<EstaAnswers> | null | undefined) {
  return Boolean(
    answers?.usAddress?.trim() ||
      answers?.employment?.trim() ||
      answers?.countriesVisited?.trim() ||
      answers?.priorRefusal?.trim()
  );
}

/** La pièce ne clôt le parcours qu’après un paiement enregistré. Sinon le suivi reste au paiement. */
export function depositAdvancesToPiece(status: string | null | undefined) {
  return status === "paye";
}

export function clientVisaStepNote(step: ClientVisaStep, input?: { paid?: boolean; paymentHeld?: boolean }) {
  if (step === "paiement" && input?.paymentHeld && !input.paid) return paymentHold(false);
  if (step === "paiement" && input?.paid) return "Le frais d’État est enregistré. La pièce arrive au coffre.";
  return clientVisaStepCopy(step);
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
