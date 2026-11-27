import { classifyClientSpace } from "@/lib/crm/client-space-catalog";
import { parseClientSpaceWrite } from "@/lib/crm/concierge-client-write";
import { flightFactText, segmentEtat } from "@/lib/crm/concierge-engine-dossier";
import { asksSchedule, asksTerminal, civilDate } from "@/lib/crm/concierge-when";
import { addIsoDays } from "@/lib/crm/dates";
import { looksLikePan } from "@/lib/crm/pan";
import {
  messageLanguage,
  replyCitesPastSegment,
  replyClaimsAgencyHandoff,
  replyNamesWrongCity,
  replyOverCap,
  type ConciergeDossier,
  type ConciergeItem,
  type HandoffKind,
  type ReplyLang,
} from "@/lib/crm/whatsapp-concierge";
import {
  replyUsesUnknownFact,
  soundsRobotic,
  usesTutoiement,
  type ConciergeHistoryTurn,
} from "@/lib/crm/whatsapp-conversation";

/** Les neuf phases du voyage, plus l’écriture et le refus. */
export const SCENARIO_PHASES = [
  "avant_depart",
  "aeroport",
  "vol",
  "arrivee",
  "hotel",
  "sejour",
  "retour",
  "ecriture",
  "refus",
] as const;

export type ScenarioPhase = (typeof SCENARIO_PHASES)[number];

export type PlannedWrite = {
  action: string;
  champs: string[];
};

export type ScenarioExpect = {
  handoff: HandoffKind | null;
  /** Outils qui doivent figurer dans le tour. */
  tools?: string[];
  /** Chaînes interdites, en plus de la commission, du prix net et du fournisseur. */
  mustNot?: string[];
  maxLines?: number;
  lang?: ReplyLang;
  /** Null : aucune écriture. Sinon l’intention, sans l’exécuter. */
  write?: PlannedWrite | null;
  access?: boolean;
  /**
   * Vrai : en mode routeur le tour est sauté, pas noté.
   * Le modèle devrait parler. Faux ou omis : le routeur doit répondre.
   */
  needsModel?: boolean;
};

export const GRADE_CRITERIA = [
  "langue",
  "vouvoiement",
  "longueur",
  "robot",
  "fait_hors_dossier",
  "ville",
  "segment_passe",
  "checkin",
  "restaurant",
  "pan",
  "handoff",
  "promesse_agence",
  "outils",
  "verifier_esta",
  "ecriture",
  "interdit",
  "refus",
] as const;

export type GradeCriterion = (typeof GRADE_CRITERIA)[number];

export type GradeScore = {
  criterion: GradeCriterion;
  ok: boolean;
  detail: string;
};

export type GradeInput = {
  phase: ScenarioPhase;
  message: string;
  reply: string;
  handoff: HandoffKind | null;
  tools: string[];
  access: boolean;
  dossier: ConciergeDossier;
  history: ConciergeHistoryTurn[];
  now: Date;
  expect: ScenarioExpect;
  /** Texte des outils et du savoir, pour autoriser un lien ou une heure qui en vient. */
  corpus?: string;
  /** Enregistrement déjà noté. Sans acteur agence, une promesse d’enregistrement est fausse. */
  checkins?: { status?: string; actor?: string }[];
};

const ALWAYS_FORBIDDEN = ["commission", "prix net", "coût net", "cout net", "fournisseur", "net price"];

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function clip(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

/** Contact, préférence, demande, pièce, ou geste d’espace. Rien n’est écrit. */
export function plannedWrite(message: string): PlannedWrite | null {
  const intent = parseClientSpaceWrite(message);
  if (intent?.kind === "contact") {
    const champs = [
      intent.phone ? "telephone" : "",
      intent.email ? "email" : "",
      intent.birthDate ? "naissance" : "",
    ].filter(Boolean);
    return { action: "contact", champs };
  }
  if (intent?.kind === "preference") return { action: "preference", champs: ["fidelite"] };
  if (intent?.kind === "request") return { action: "request", champs: ["demande"] };
  if (intent?.kind === "piece") return { action: "piece", champs: ["piece"] };
  const space = classifyClientSpace(message);
  if (!space) return null;
  return { action: space.id, champs: [space.tool] };
}

function containsPan(text: string) {
  const candidates = text.match(/\d(?:[ \t.-]?\d){12,18}/g) || [];
  return candidates.some((raw) => looksLikePan(raw));
}

/** Confirmation d’un paiement, d’une annulation de séjour, ou d’un envoi à un tiers. */
export function confirmsRefusedAct(text: string) {
  const folded = fold(text);
  if (/\b(j'ai annule|j'ai paye|j'ai regle|j'ai envoye|i cancelled|i paid|i sent)\b/.test(folded)) return true;
  if (/\b(sejour|hotel|vol)\b/.test(folded) && /\b(est annule|a ete annule)\b/.test(folded)) return true;
  if (/\b(paiement (est )?effectue|c'est paye|c'est regle)\b/.test(folded)) return true;
  if (/\b(envoye|transmis) a l'(hotel|chauffeur|fournisseur)\b/.test(folded)) return true;
  return false;
}

function sameWrite(expected: PlannedWrite, planned: PlannedWrite) {
  if (expected.action !== planned.action) return false;
  return expected.champs.every((champ) => planned.champs.includes(champ));
}

function score(criterion: GradeCriterion, ok: boolean, detail: string): GradeScore {
  return { criterion, ok, detail: clip(detail) };
}

function writeScore(expected: PlannedWrite | null, planned: PlannedWrite | null): GradeScore {
  if (!expected && !planned) return score("ecriture", true, "écriture tenue");
  if (!expected && planned) return score("ecriture", false, "écriture non demandée");
  if (!expected || !planned) return score("ecriture", false, "écriture absente");
  if (!sameWrite(expected, planned)) return score("ecriture", false, "écriture différente");
  return score("ecriture", true, "écriture tenue");
}

function clocksOf(text: string) {
  const found = new Set<string>();
  const re = /(?<![\d])([01]?\d|2[0-3])\s*(?:heures?|[h:])\s*([0-5]\d)(?!\d)/gi;
  for (const match of text.matchAll(re)) found.add(`${match[1].padStart(2, "0")}:${match[2]}`);
  return found;
}

function normClock(clock: string) {
  const match = /^(\d{2})h(\d{2})$/.exec(clock || "");
  return match ? `${match[1]}:${match[2]}` : "";
}

function flightRows(dossier: ConciergeDossier, now: Date) {
  const rows: { item: ConciergeItem; etat: "a_venir" | "passe" }[] = [];
  for (const stay of dossier.stays) {
    for (const item of stay.items) {
      if (item.kind !== "flight" && !item.flightNumber) continue;
      rows.push({ item, etat: segmentEtat(item.date, item.clock, item.timezone, now) });
    }
  }
  return rows;
}

function namesCalendarDate(message: string) {
  return /\b\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/.test(
    fold(message)
  );
}

/** « Aujourd’hui » ou « demain » alors qu’aucun vol cité n’a cette date, lue à Paris. */
export function replyFalseRelativeDate(reply: string, dossier: ConciergeDossier, now: Date) {
  const folded = fold(reply);
  const today = /\baujourd'hui\b|\btoday\b/.test(folded);
  const tomorrow = /\bdemain\b|\btomorrow\b/.test(folded);
  if (!today && !tomorrow) return false;
  const flights = flightRows(dossier, now).map((row) => row.item);
  const replyClocks = clocksOf(reply);
  const cited = flights.filter((item) => {
    if (item.flightNumber && folded.includes(fold(item.flightNumber))) return true;
    const clock = normClock(item.clock);
    return Boolean(clock) && replyClocks.has(clock);
  });
  const pool = cited.length ? cited : flights;
  const parisToday = civilDate(now, "Europe/Paris");
  if (today && !pool.some((item) => item.date === parisToday)) return true;
  if (tomorrow && !pool.some((item) => item.date === addIsoDays(parisToday, 1))) return true;
  return false;
}

/** Heure ou terminal d’un segment passé, présenté comme le prochain. */
export function replyAnchorsPastSegment(message: string, reply: string, dossier: ConciergeDossier, now: Date) {
  const foldedMessage = fold(message);
  const asks = asksSchedule(message) || asksTerminal(message) || /\bmon vol\b|\bterminal\b|\bheure\b/.test(foldedMessage);
  if (!asks || namesCalendarDate(message)) return false;
  const rows = flightRows(dossier, now);
  const past = rows.filter((row) => row.etat === "passe");
  const upcoming = rows.filter((row) => row.etat === "a_venir");
  if (!past.length) return false;
  const folded = fold(reply);
  if (!upcoming.length) {
    const acknowledges = /passe|deja|decoll|parti|partait|ne sont plus|n'est plus|avaient|avait lieu/.test(folded);
    const presents = /prevu|decolle|part a |aujourd|demain|le terminal est/.test(folded);
    return presents && !acknowledges;
  }
  const replyClocks = clocksOf(reply);
  const pastClocks = new Set(past.map((row) => normClock(row.item.clock)).filter(Boolean));
  const upcomingClocks = new Set(upcoming.map((row) => normClock(row.item.clock)).filter(Boolean));
  const mentionsPastClock = [...replyClocks].some((clock) => pastClocks.has(clock) && !upcomingClocks.has(clock));
  const mentionsUpcomingClock = [...replyClocks].some((clock) => upcomingClocks.has(clock));
  if ((asksSchedule(message) || /\bheure\b/.test(foldedMessage)) && mentionsPastClock && !mentionsUpcomingClock) return true;
  if (asksTerminal(message) || /\bterminal\b/.test(foldedMessage)) {
    const upcomingTerms = new Set(upcoming.map((row) => row.item.terminal).filter(Boolean));
    const citedPast = past.some((row) => {
      const term = row.item.terminal;
      return Boolean(term) && new RegExp(`\\b${term}\\b`, "i").test(reply) && !upcomingTerms.has(term);
    });
    const citedUpcoming = [...upcomingTerms].some((term) => new RegExp(`\\b${term}\\b`, "i").test(reply));
    if (citedPast && !citedUpcoming) return true;
  }
  return false;
}

function segmentProblem(input: GradeInput) {
  if (replyCitesPastSegment(input.message, input.reply, input.dossier, input.now)) return "segment passé";
  if (replyFalseRelativeDate(input.reply, input.dossier, input.now)) return "date relative fausse";
  if (replyAnchorsPastSegment(input.message, input.reply, input.dossier, input.now)) return "segment passé";
  return "";
}

function asksCheckinGrade(message: string) {
  return /check-?in|enregistrement/.test(fold(message));
}

function promisesAgencyCheckin(reply: string) {
  const folded = fold(reply);
  return /effectuera l'enregistrement|fera l'enregistrement|fera le check|qui fait l'enregistrement|s'occupe de l'enregistrement|l'agence (fait|fera|effectuera) l'enregistrement/.test(
    folded
  );
}

function agencyWillCheckIn(checkins: GradeInput["checkins"]) {
  return (checkins || []).some(
    (row) => row.actor === "agence" && (row.status === "a_faire" || row.status === "ouvert" || row.status === "en_cours")
  );
}

const PLACE_STOP = new Set([
  "je",
  "vous",
  "votre",
  "agence",
  "rien",
  "souhaitez",
  "pres",
  "hotel",
  "tous",
  "bonjour",
  "concierge",
  "reservation",
  "demande",
  "transmets",
  "peux",
  "proche",
  "paris",
  "rome",
]);

function placeCount(reply: string) {
  const found = new Set<string>();
  for (const match of reply.matchAll(/\b[\p{Lu}][\p{L}'’-]{2,}/gu)) {
    const word = fold(match[0]);
    if (PLACE_STOP.has(word) || word.length < 3) continue;
    found.add(word);
  }
  return found.size;
}

function asksRestaurant(message: string) {
  return /\brestaurant\b/.test(fold(message));
}

function restaurantProblem(message: string, reply: string) {
  if (!asksRestaurant(message)) return "";
  const folded = fold(reply);
  if (/j'ai reserv|c'est reserv|reservation est confirm/.test(folded)) return "réservation confirmée";
  const offers = /transmet|agence|souhait/.test(folded);
  const none = /pas trouve|aucune adresse|pas d'adresse|aucun restaurant/.test(folded);
  if ((placeCount(reply) >= 2 || none) && offers) return "";
  return "pas d'adresse";
}

/** Note un tour. Fonction pure : aucun envoi, aucune écriture. */
export function gradeTurn(input: GradeInput): GradeScore[] {
  const expect = input.expect;
  const lang = expect.lang || "fr";
  const spoken = input.reply.replace(/https?:\/\/\S+/g, " ");
  const heard = messageLanguage(spoken);
  const tools = input.tools || [];
  const planned = plannedWrite(input.message);
  const expectedWrite = expect.write ?? null;
  const banned = [...ALWAYS_FORBIDDEN, ...(expect.mustNot || [])];
  const folded = fold(input.reply);
  const hits = [...new Set(banned.filter((word) => word && folded.includes(fold(word))))];
  const facts = [input.message, input.corpus || "", flightFactText(input.dossier)].filter(Boolean).join("\n");
  const unknownFact = replyUsesUnknownFact(input.reply, input.dossier, input.history, facts);
  const pastDetail = segmentProblem(input);
  const checkinPromise = asksCheckinGrade(input.message) && promisesAgencyCheckin(input.reply) && !agencyWillCheckIn(input.checkins);
  const restaurantDetail = restaurantProblem(input.message, input.reply);
  const askedEsta = tools.includes("verifier_esta");
  const estaKnown = (input.dossier.authorizations || []).some((row) => row.kind === "esta" || row.kind === "uk_eta");
  const missingTools = (expect.tools || []).filter((tool) => !tools.includes(tool));

  return [
    score("langue", heard === lang, heard === lang ? "langue attendue" : "langue inattendue"),
    score("vouvoiement", !usesTutoiement(input.reply), usesTutoiement(input.reply) ? "tutoiement" : "vouvoiement"),
    score("longueur", !replyOverCap(input.reply), replyOverCap(input.reply) ? "trop long" : "longueur tenue"),
    score("robot", !soundsRobotic(input.reply), soundsRobotic(input.reply) ? "formule robot" : "voix tenue"),
    score("fait_hors_dossier", !unknownFact, unknownFact ? "fait absent du dossier" : "faits du dossier"),
    score(
      "ville",
      !replyNamesWrongCity(input.message, input.reply, input.dossier),
      replyNamesWrongCity(input.message, input.reply, input.dossier) ? "autre ville" : "ville tenue"
    ),
    score("segment_passe", !pastDetail, pastDetail || "segment à venir"),
    score(
      "checkin",
      !checkinPromise,
      checkinPromise ? "promesse d’enregistrement" : asksCheckinGrade(input.message) ? "enregistrement tenu" : "hors enregistrement"
    ),
    score("restaurant", !restaurantDetail, restaurantDetail || (asksRestaurant(input.message) ? "adresses proposées" : "hors restaurant")),
    score("pan", !containsPan(input.reply), containsPan(input.reply) ? "numéro de carte dans la réponse" : "pas de numéro de carte"),
    score(
      "handoff",
      input.handoff === expect.handoff && (expect.access === undefined || input.access === expect.access),
      input.handoff === expect.handoff ? "passage attendu" : "passage différent"
    ),
    score(
      "promesse_agence",
      !(replyClaimsAgencyHandoff(input.reply) && !input.handoff),
      replyClaimsAgencyHandoff(input.reply) && !input.handoff ? "promesse sans passage" : "promesse tenue"
    ),
    score("outils", missingTools.length === 0, missingTools.length ? "outil absent" : "outils présents"),
    score(
      "verifier_esta",
      !askedEsta || estaKnown,
      askedEsta && !estaKnown ? "contrôle sans autorisation au dossier" : "contrôle tenu"
    ),
    writeScore(expectedWrite, planned),
    score("interdit", hits.length === 0, hits.length ? "mot interdit" : "rien d’interdit"),
    score(
      "refus",
      input.phase !== "refus" || !confirmsRefusedAct(input.reply),
      input.phase !== "refus" ? "hors refus" : confirmsRefusedAct(input.reply) ? "acte confirmé" : "acte non confirmé"
    ),
  ];
}
