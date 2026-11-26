import { classifyClientSpace } from "@/lib/crm/client-space-catalog";
import { parseClientSpaceWrite } from "@/lib/crm/concierge-client-write";
import { looksLikePan } from "@/lib/crm/pan";
import {
  messageLanguage,
  replyCitesPastSegment,
  replyClaimsAgencyHandoff,
  replyNamesWrongCity,
  replyOverCap,
  type ConciergeDossier,
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
  const askedEsta = tools.includes("verifier_esta");
  const estaKnown = (input.dossier.authorizations || []).some((row) => row.kind === "esta" || row.kind === "uk_eta");
  const missingTools = (expect.tools || []).filter((tool) => !tools.includes(tool));

  return [
    score("langue", heard === lang, heard === lang ? "langue attendue" : "langue inattendue"),
    score("vouvoiement", !usesTutoiement(input.reply), usesTutoiement(input.reply) ? "tutoiement" : "vouvoiement"),
    score("longueur", !replyOverCap(input.reply), replyOverCap(input.reply) ? "trop long" : "longueur tenue"),
    score("robot", !soundsRobotic(input.reply), soundsRobotic(input.reply) ? "formule robot" : "voix tenue"),
    score(
      "fait_hors_dossier",
      !replyUsesUnknownFact(input.reply, input.dossier, input.history, [input.message, input.corpus || ""].filter(Boolean).join("\n")),
      replyUsesUnknownFact(input.reply, input.dossier, input.history, [input.message, input.corpus || ""].filter(Boolean).join("\n"))
        ? "fait absent du dossier"
        : "faits du dossier"
    ),
    score(
      "ville",
      !replyNamesWrongCity(input.message, input.reply, input.dossier),
      replyNamesWrongCity(input.message, input.reply, input.dossier) ? "autre ville" : "ville tenue"
    ),
    score(
      "segment_passe",
      !replyCitesPastSegment(input.message, input.reply, input.dossier, input.now),
      replyCitesPastSegment(input.message, input.reply, input.dossier, input.now) ? "segment passé" : "segment à venir"
    ),
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
