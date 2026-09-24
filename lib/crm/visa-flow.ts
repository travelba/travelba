import type { VisaCorridor } from "./visa-fees";

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

export function confirmAllowed(input: {
  already: VisaCorridor[];
  country: VisaCorridor;
  frenchPassports: number;
  esta?: Partial<EstaAnswers> | null;
}) {
  if (input.already.includes(input.country)) return "déjà demandé";
  if (input.frenchPassports < 1) return "passeport français manquant";
  if (input.country === "US" && !estaReady(input.esta)) return "questionnaire ESTA incomplet";
  if (input.country === "GB" && !input.esta?.priorRefusal?.trim()) return "antécédent de refus manquant";
  return null;
}
