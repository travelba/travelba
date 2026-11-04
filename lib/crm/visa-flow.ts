import { VISA_EUR, visaProposed } from "./extras";
import { VISA_OFFICIAL, type VisaCorridor } from "./visa-fees";

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

/** Paliers d’avancement, pas une durée. Le paiement tenu par Pliant reste à 80. */
const PROGRESS_MARK: Record<ClientVisaStep, number> = {
  preparation: 20,
  remplissage: 45,
  validation: 65,
  paiement: 80,
  piece: 100,
};

export function clientVisaProgress(step: ClientVisaStep) {
  return PROGRESS_MARK[step];
}

/** Astra ne remplit que le portail ETA-IL. */
export function astraFillsCountry(country: VisaCorridor) {
  return country === "IL";
}

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

export function clientVisaStepNote(
  step: ClientVisaStep,
  input?: { paid?: boolean; paymentHeld?: boolean; authorization?: string | null }
) {
  if (step === "paiement" && input?.paymentHeld && !input.paid) return paymentHold(false);
  if (step === "paiement" && input?.paid) return "Le frais d’État est enregistré. La pièce arrive au coffre.";
  const authorization = (input?.authorization || "").replace(/[\r\n]+/g, " ").trim();
  if (step === "piece" && authorization && authorization.length <= 40 && !/[{}%]|https?:/i.test(authorization)) {
    return `Votre autorisation ${authorization} est prête.`;
  }
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

/** Israël part sans questionnaire. États-Unis et Royaume-Uni attendent les réponses. */
export function agencyLaunchReady(country: VisaCorridor, answers: Partial<EstaAnswers> | null | undefined) {
  if (country === "IL") return true;
  if (country === "GB") return Boolean(answers?.priorRefusal?.trim());
  return estaReady(answers);
}

/** La carte n’est proposée que si l’agence active Visa. Une demande déjà acceptée reste visible. */
export function visaRequestShown(
  booking: { offer_visa?: boolean | null } | null | undefined,
  requests: { accepted_at?: string | null; accepted?: boolean | null }[] | null | undefined
) {
  if (visaProposed(booking)) return true;
  return (requests || []).some((row) => journeyStarted(row));
}

/** Un palier seul (45 % ou autre) n’ouvre pas le parcours. Il faut une validation explicite. */
export function journeyStarted(
  request: { step?: ClientVisaStep | null; accepted?: boolean | null; accepted_at?: string | null } | null | undefined
) {
  if (!request) return false;
  return request.accepted === true || Boolean(request.accepted_at);
}

/** L’agence recommence. Le client revoit la carte de départ : rien n’est lancé. */
export function visaResetPatch() {
  return {
    accepted_at: null,
    step: "preparation" as const,
    status: "en_cours" as const,
    traveler_ids: [] as string[],
    answers: {} as Record<string, never>,
    pay_attempts: 0,
    pliant_transaction_id: null,
    paid_cents: null,
    launched_by: null,
    launched_by_name: null,
  };
}

/** Après validation, la carte de départ ne revient pas. */
export function canReturnToOffer(
  request: { accepted?: boolean | null; accepted_at?: string | null } | null | undefined
) {
  return !journeyStarted(request);
}

/** Le prix n’est pas sur la carte. Il n’existe que pour la confirmation. */
export function visaPriceOnCard() {
  return null;
}

export function visaConfirmationQuote(input: { travelers: number; country: VisaCorridor }) {
  const travelers = Math.max(0, Math.floor(input.travelers));
  const official = VISA_OFFICIAL[input.country];
  return {
    travelers,
    agencyTotalEur: travelers * VISA_EUR,
    perPassengerEur: VISA_EUR,
    officialAmount: official.amount,
    officialCurrency: official.currency,
  };
}

export function visaConfirmationCopy(input: { travelers: number; country: VisaCorridor }) {
  const quote = visaConfirmationQuote(input);
  const people =
    quote.travelers > 1 ? `${quote.travelers} voyageurs` : quote.travelers === 1 ? "1 voyageur" : "aucun voyageur";
  return `Nous prenons la demande pour ${people}. ${quote.agencyTotalEur} €, ${quote.perPassengerEur} € par passager, hors frais officiels. Frais d’État : ${quote.officialAmount} ${quote.officialCurrency}.`;
}

export type VisaAcceptDecision =
  | { start: false; error: string }
  | {
      start: true;
      travelerIds: string[];
      step: ClientVisaStep;
      status: "en_cours" | "paye" | "piece" | "refuse";
    };

/** Rien ne part avant la confirmation. Un parcours déjà validé ne recule pas. */
export function acceptVisaDecision(input: {
  confirm: boolean;
  travelerIds: string[];
  partyIds: string[];
  alreadyAccepted: boolean;
  step?: ClientVisaStep | null;
  status?: string | null;
}): VisaAcceptDecision {
  if (input.alreadyAccepted) return { start: false, error: "Le parcours est déjà lancé." };
  if (!input.confirm) return { start: false, error: "Confirmez la demande avant de lancer le parcours." };
  const allowed = new Set(input.partyIds);
  const travelerIds = input.partyIds.length ? input.travelerIds.filter((id) => allowed.has(id)) : [];
  if (input.partyIds.length && travelerIds.length < 1) {
    return { start: false, error: "Choisissez au moins un voyageur." };
  }
  const filed = input.status === "piece" || input.step === "piece";
  const paying = input.status === "paye" || input.step === "paiement";
  const step: ClientVisaStep = filed ? "piece" : paying ? "paiement" : "preparation";
  const status =
    input.status === "paye" || input.status === "piece" || input.status === "refuse"
      ? input.status
      : step === "piece"
        ? "piece"
        : "en_cours";
  return { start: true, travelerIds, step, status };
}

/** WhatsApp seulement quand la pièce est dans l’espace, pas à la validation. */
export function whatsappOnVisa(event: "validation" | "piece") {
  return event === "piece";
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

export function formalityName(country: VisaCorridor) {
  if (country === "US") return "ESTA";
  if (country === "GB") return "ETA Royaume-Uni";
  return "ETA-IL";
}

export function clientVisaStepLabel(step: ClientVisaStep) {
  return STEP_LABEL[step];
}

export function frenchPassportCount(
  documents: { doc_type?: string | null; issuing_country?: string | null; number?: string | null }[] | null | undefined
) {
  return (documents || []).filter((row) => row.doc_type === "passport" && row.issuing_country === "FR" && row.number)
    .length;
}

const ESTA_FIELD_LABEL: Record<keyof EstaAnswers, string> = {
  usAddress: "l’adresse du séjour aux États-Unis",
  employment: "l’emploi",
  countriesVisited: "les pays visités",
  priorRefusal: "le refus de visa antérieur",
};

/** Champs encore vides. Israël n’en a pas. */
export function missingLaunchAnswers(country: VisaCorridor, answers: Partial<EstaAnswers> | null | undefined) {
  if (country === "IL") return [];
  if (country === "GB") return answers?.priorRefusal?.trim() ? [] : [ESTA_FIELD_LABEL.priorRefusal];
  return (Object.keys(ESTA_FIELD_LABEL) as (keyof EstaAnswers)[])
    .filter((key) => !answers?.[key]?.trim())
    .map((key) => ESTA_FIELD_LABEL[key]);
}

/** Phrase lisible pour un refus de confirmAllowed. Le code court reste la clé interne. */
export function confirmBlockMessage(
  block: string | null | undefined,
  country?: VisaCorridor,
  answers?: Partial<EstaAnswers> | null
) {
  if (!block) return null;
  if (block === "déjà demandé") return "Cette formalité est déjà demandée pour ce dossier.";
  if (block === "passeport français manquant") {
    return "Passeport français manquant. Ajoutez un passeport français avec son numéro au coffre du client avant de lancer la demande.";
  }
  if (block === "antécédent de refus manquant" || (block === "questionnaire ESTA incomplet" && country === "GB")) {
    return "Réponse manquante pour le Royaume-Uni : indiquez s’il y a eu un refus de visa antérieur.";
  }
  if (block === "questionnaire ESTA incomplet") {
    const missing = country ? missingLaunchAnswers(country, answers) : [];
    if (missing.length) return `Questionnaire ESTA incomplet. Il manque ${missing.join(", ")}.`;
    return "Questionnaire ESTA incomplet. Indiquez l’adresse du séjour aux États-Unis, l’emploi, les pays visités et le refus de visa antérieur.";
  }
  return block;
}

export function parseVisaCorridor(value: unknown): VisaCorridor | null {
  if (value === "IL" || value === "US" || value === "GB") return value;
  const key = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (key === "il" || key === "israel" || key === "etail") return "IL";
  if (key === "us" || key === "usa" || key === "etatsunis" || key === "esta") return "US";
  if (key === "gb" || key === "uk" || key === "royaumeuni" || key === "etaroyaumeuni" || key === "etauk") return "GB";
  return null;
}

/** Mêmes réponses que le formulaire client, avec les noms français du connecteur. */
export function estaAnswersFrom(value: unknown): Partial<EstaAnswers> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const item = row[key];
      if (typeof item === "string" && item.trim()) return item.trim();
    }
    return "";
  };
  return {
    usAddress: text("usAddress", "adresse", "adresse_sejour"),
    employment: text("employment", "emploi"),
    countriesVisited: text("countriesVisited", "pays_visites", "paysVisites"),
    priorRefusal: text("priorRefusal", "refus", "refus_anterieur"),
  };
}

export function visaLaunchSummary(country: VisaCorridor, name: string) {
  const author = name.trim() || "l’agence";
  return `${formalityName(country)} lancée pour le client par ${author}.`.slice(0, 500);
}

export type VisaLaunchPreview = {
  lance: false;
  pays: string;
  code: VisaCorridor;
  formalite: string;
  voyageurs: { voyageur_id: string; nom: string; retenu: boolean }[];
  prix_eur: number;
  par_passager_eur: number;
  frais_etat: string;
  manque: string[];
  pret: boolean;
  offre_visa: boolean;
  message: string;
};

export type VisaLaunchDecision =
  | { kind: "refuse"; error: string }
  | { kind: "preview"; preview: VisaLaunchPreview }
  | {
      kind: "launch";
      travelerIds: string[];
      step: ClientVisaStep;
      status: "en_cours" | "paye" | "piece" | "refuse";
      answers: Partial<EstaAnswers>;
      enableOffer: boolean;
      fillIsrael: boolean;
      preview: VisaLaunchPreview;
    };

function launchSelection(partyIds: string[], requested: string[] | null) {
  if (!requested) return { ids: partyIds, error: null as string | null };
  const allowed = new Set(partyIds);
  if (requested.some((id) => !allowed.has(id))) {
    return { ids: [] as string[], error: "Un voyageur indiqué ne fait pas partie du dossier." };
  }
  if (partyIds.length && requested.length < 1) {
    return { ids: [] as string[], error: "Choisissez au moins un voyageur." };
  }
  return { ids: requested, error: null as string | null };
}

function launchGaps(country: VisaCorridor, answers: Partial<EstaAnswers>, frenchPassports: number) {
  const gaps = missingLaunchAnswers(country, answers);
  if (frenchPassports < 1) return ["passeport français", ...gaps];
  return gaps;
}

export type VisaJourneyLine = {
  pays: string;
  code: string;
  formalite: string;
  lance: boolean;
  etape: string;
  statut: string | null;
  lance_par: string | null;
  voyageurs: string[];
};

/** Parcours enregistrés, plus les pays détectés qui n’ont pas encore démarré. */
export function visaJourneyLines(input: {
  travelers: { id: string; nom: string }[];
  requests: {
    country: string;
    step?: ClientVisaStep | null;
    status?: string | null;
    accepted_at?: string | null;
    accepted?: boolean | null;
    traveler_ids?: string[] | null;
    launched_by_name?: string | null;
  }[];
  detected: VisaCorridor[];
}): VisaJourneyLine[] {
  const names = new Map(input.travelers.map((row) => [row.id, row.nom]));
  const seen = new Set<string>();
  const lines: VisaJourneyLine[] = [];
  const push = (
    country: string,
    request?: (typeof input.requests)[number] | null
  ) => {
    if (seen.has(country)) return;
    seen.add(country);
    const corridor = country === "IL" || country === "US" || country === "GB" ? country : null;
    const started = journeyStarted(request);
    const step = request?.step;
    const ids = Array.isArray(request?.traveler_ids) ? request.traveler_ids.filter((id) => typeof id === "string") : [];
    lines.push({
      pays: corridor ? VISA_OFFICIAL[corridor].countryName : country,
      code: country,
      formalite: corridor ? formalityName(corridor) : "Formalité",
      lance: started,
      etape: started && step ? clientVisaStepLabel(step) : "Pas lancée",
      statut: request?.status ?? null,
      lance_par: started ? request?.launched_by_name?.trim() || null : null,
      voyageurs: ids.map((id) => names.get(id) || "Voyageur"),
    });
  };
  for (const country of input.detected) push(country, input.requests.find((row) => row.country === country));
  for (const request of input.requests) push(request.country, request);
  return lines;
}

/** Aperçu sans écriture, ou lancement. Rien ne part sans confirm. */
export function decideVisaLaunch(input: {
  confirm: boolean;
  country: VisaCorridor;
  requestedTravelerIds: string[] | null;
  party: { id: string; nom: string }[];
  alreadyAccepted: boolean;
  frenchPassports: number;
  answers: Partial<EstaAnswers>;
  offerVisa: boolean;
  priorStep?: ClientVisaStep | null;
  priorStatus?: string | null;
  passengers?: number;
}): VisaLaunchDecision {
  if (input.alreadyAccepted) return { kind: "refuse", error: "Le parcours est déjà lancé." };
  const partyIds = input.party.map((row) => row.id);
  const picked = launchSelection(partyIds, input.requestedTravelerIds);
  if (picked.error) return { kind: "refuse", error: picked.error };
  const count = partyIds.length ? picked.ids.length : Math.max(1, input.passengers || 1);
  const quote = visaConfirmationQuote({ travelers: count, country: input.country });
  const gaps = launchGaps(input.country, input.answers, input.frenchPassports);
  const block = confirmAllowed({
    already: [],
    country: input.country,
    frenchPassports: input.frenchPassports,
    esta: input.answers,
  });
  const kept = new Set(picked.ids);
  const preview: VisaLaunchPreview = {
    lance: false,
    pays: VISA_OFFICIAL[input.country].countryName,
    code: input.country,
    formalite: formalityName(input.country),
    voyageurs: input.party.map((row) => ({
      voyageur_id: row.id,
      nom: row.nom,
      retenu: partyIds.length ? kept.has(row.id) : true,
    })),
    prix_eur: quote.agencyTotalEur,
    par_passager_eur: quote.perPassengerEur,
    frais_etat: `${quote.officialAmount} ${quote.officialCurrency}`,
    manque: gaps,
    pret: block == null,
    offre_visa: input.offerVisa,
    message: block
      ? `${confirmBlockMessage(block, input.country, input.answers)} Rien n’est lancé.`
      : "Confirmez pour lancer la demande. Rien n’est lancé.",
  };
  if (!input.confirm) return { kind: "preview", preview };
  if (block) return { kind: "refuse", error: confirmBlockMessage(block, input.country, input.answers) || block };
  const decision = acceptVisaDecision({
    confirm: true,
    travelerIds: picked.ids,
    partyIds,
    alreadyAccepted: false,
    step: input.priorStep || null,
    status: input.priorStatus || null,
  });
  if (!decision.start) return { kind: "refuse", error: decision.error };
  return {
    kind: "launch",
    travelerIds: decision.travelerIds,
    step: decision.step,
    status: decision.status,
    answers: input.answers,
    enableOffer: !input.offerVisa,
    fillIsrael: input.country === "IL" && decision.step === "preparation",
    preview,
  };
}
