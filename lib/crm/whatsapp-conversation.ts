import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import { aiGatewayConfigured, openaiApiKey } from "./ingest-types";
import { looksLikePan } from "./pan";
import {
  agencyHandoffSentence,
  conciergeContextText,
  conciergeFollowUp,
  isComplaint,
  messageLanguage,
  planConciergeTurn,
  stayClientUrl,
  transactionsClientUrl,
  type ConciergeDossier,
  type ConciergeTurn,
  type HandoffKind,
  type ReplyLang,
} from "./whatsapp-concierge";
import { CONCIERGE_SIGNATURE, withConciergeSignature } from "./whatsapp";

const MODEL_TIMEOUT_MS = 8_000;
const HISTORY_LIMIT = 16;

const replySchema = z.object({
  text: z.string(),
  bookingReference: z.string().nullable(),
  handoff: z.enum(["complaint", "question"]).nullable(),
});

export type ConciergeModelReply = z.infer<typeof replySchema>;

export type ConciergeHistoryTurn = {
  direction: "inbound" | "outbound";
  body: string;
};

export type ConciergeGenerator = (input: {
  message: string;
  dossier: ConciergeDossier;
  history: ConciergeHistoryTurn[];
  lang: ReplyLang;
}) => Promise<ConciergeModelReply | null>;

const SYSTEM = `Tu es Le Concierge de Travel Business Agency. Tu réponds sur WhatsApp à un client déjà identifié.
Voix de l’agence : vouvoiement, phrases courtes, pas d’emoji, pas de signature (elle est ajoutée après).
Langue : celle demandée dans le message (français ou anglais).
Faits du séjour, horaires, inclus, prix, encours, pièces, formalités, chauffeur, dates et lieux : uniquement ce qui est écrit dans le JSON. S’il manque, dis que tu ne l’as pas dans le dossier. N’invente jamais une heure, un prix, un téléphone, un numéro de pièce, un contact d’hôtel ou un lien.
Un conseil général (prise, tenue, quartier, météo) est permis. Présente-le comme un conseil, pas comme un fait du dossier.
Tu ne modifies rien, tu n’annules rien, tu ne rapproches aucun paiement, tu ne déposes aucune formalité, tu ne commandes aucun chauffeur.
handoff vaut "question" seulement si le client demande à parler à l’agence. "complaint" seulement s’il se plaint. Sinon null.
bookingReference : une référence présente dans le JSON, ou null.
text : la réponse, 1200 caractères au plus.`;

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’']/g, "'")
    .toLowerCase();
}

function signReply(body: string) {
  const trimmed = body.replace(/\s+$/u, "").replace(new RegExp(`\\n*${CONCIERGE_SIGNATURE}\\s*$`), "").trim();
  const signed = withConciergeSignature(trimmed);
  if (signed.length <= 1500) return signed;
  const room = Math.max(40, 1500 - CONCIERGE_SIGNATURE.length - 2);
  return withConciergeSignature(trimmed.slice(0, room).trim());
}

function questionTurn(keyword: ConciergeTurn, lang: ReplyLang): ConciergeTurn {
  return {
    handoff: "question",
    bookingId: keyword.bookingId,
    text: conciergeFollowUp(agencyHandoffSentence(lang), lang),
    cover: null,
    optOut: false,
    access: false,
  };
}

/** « Yes » tout seul n’a pas de mot anglais : on reprend la langue de la proposition. */
function replyLanguage(message: string, history: ConciergeHistoryTurn[]): ReplyLang {
  const own = messageLanguage(message);
  if (own === "en") return "en";
  if (!/^(yes|ok|okay|please|yep|yeah)\b/.test(fold(message))) return own;
  const last = [...history].reverse().find((row) => row.direction === "outbound" && row.body.trim());
  if (last && messageLanguage(last.body) === "en") return "en";
  return own;
}

/** Le client confirme la proposition « en parler à l’agence » du message précédent. */
export function confirmsAgencyOffer(message: string, history: ConciergeHistoryTurn[]) {
  const last = [...history].reverse().find((row) => row.direction === "outbound" && row.body.trim());
  if (!last) return false;
  const offered = fold(last.body);
  const asked =
    (offered.includes("souhaitez-vous que j") && offered.includes("agence")) ||
    offered.includes("would you like me to ask the agency");
  if (!asked) return false;
  const text = fold(message).replace(/[.!]+$/g, "").trim();
  if (/^(oui|yes|ok|okay|ouais|d'accord|volontiers|bien sur)\b/.test(text)) {
    const rest = text.replace(/^(oui|yes|ok|okay|ouais|d'accord|volontiers|bien sur)\b[, ]*/, "");
    if (!rest || /^(please|merci|thanks|thank you|svp)$/.test(rest)) return true;
    return /parlez|transmet|agence|agency|ask|demande/.test(rest);
  }
  return false;
}

function clientWantsAgency(message: string) {
  const text = fold(message);
  return /parlez-en|transmettez|demandez a l'agence|ask the agency|tell the agency|passez (cela|ca) a l'agence/.test(text);
}

function clockTokens(text: string) {
  const found = new Set<string>();
  const re = /(?<![\d])([01]?\d|2[0-3])\s*(?:heures?|[h:])\s*([0-5]\d)(?!\d)/gi;
  for (const match of text.matchAll(re)) {
    found.add(`${match[1].padStart(2, "0")}:${match[2]}`);
  }
  return found;
}

const AMOUNT = "((?:\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)(?:[,.]\\d{1,2})?)";

function moneyTokens(text: string) {
  const found: number[] = [];
  const patterns = [
    new RegExp(`${AMOUNT}\\s*(?:€|eur(?:os)?)`, "gi"),
    new RegExp(`€\\s*${AMOUNT}`, "gi"),
    new RegExp(`(?:co[uû]te|prix|tarif|montant|price|costs?)\\D{0,16}${AMOUNT}`, "gi"),
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const value = parseAmount(match[1]);
      if (value != null) found.push(value);
    }
  }
  return found;
}

function parseAmount(raw: string) {
  const cleaned = raw.replace(/[ \u00a0]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(",", ".") : cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.abs(value) : null;
}

function allowedAmounts(dossier: ConciergeDossier, corpus: string) {
  const amounts = new Set<number>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if ((key === "amount" || key === "totalAmount" || key === "balance") && typeof child === "number") {
        if (Number.isFinite(child)) amounts.add(Math.abs(child));
      } else {
        walk(child);
      }
    }
  };
  walk(dossier);
  for (const value of moneyTokens(corpus)) amounts.add(value);
  return amounts;
}

function sameAmount(left: number, right: number) {
  return Math.abs(left - right) < 0.001;
}

function phoneTokens(text: string) {
  const found: string[] = [];
  const re = /(?:\+\d{1,3}|00\d{1,3}|0[1-9])(?:[\s.\u00a0-]?\d){8,14}/g;
  for (const match of text.matchAll(re)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 10) found.push(digits);
  }
  return found;
}

function unknownReference(text: string, dossier: ConciergeDossier, corpus: string) {
  const known = new Set(dossier.stays.map((stay) => stay.reference.toUpperCase()));
  const upper = corpus.toUpperCase();
  for (const match of text.toUpperCase().matchAll(/\b[A-Z]{2,}(?:-\d+)+\b/g)) {
    if (known.has(match[0]) || upper.includes(match[0])) continue;
    return true;
  }
  return false;
}

function allowedUrl(url: string, dossier: ConciergeDossier, corpus: string) {
  const clean = url.replace(/[.,);]+$/g, "");
  if (corpus.includes(clean)) return true;
  if (clean === transactionsClientUrl()) return true;
  return dossier.stays.some((stay) => clean === stayClientUrl(stay.reference));
}

function replyContainsPan(text: string) {
  const candidates = text.match(/\d(?:[ \t.-]?\d){12,18}/g) || [];
  return candidates.some((raw) => looksLikePan(raw));
}

/** Vrai si la réponse cite une heure, un montant, un téléphone, une référence ou un lien absents du dossier et de l’historique. */
export function replyUsesUnknownFact(text: string, dossier: ConciergeDossier, history: ConciergeHistoryTurn[]) {
  const corpus = `${conciergeContextText(dossier)}\n${history.map((row) => row.body).join("\n")}`.replace(
    /T00:00(?::00)?/g,
    "T"
  );
  const clocks = clockTokens(corpus);
  for (const clock of clockTokens(text)) {
    if (!clocks.has(clock)) return true;
  }
  const amounts = allowedAmounts(dossier, corpus);
  for (const amount of moneyTokens(text)) {
    if (![...amounts].some((known) => sameAmount(known, amount))) return true;
  }
  const digits = corpus.replace(/\D/g, "");
  for (const phone of phoneTokens(text)) {
    if (!digits.includes(phone)) return true;
  }
  if (unknownReference(text, dossier, corpus)) return true;
  for (const match of text.matchAll(/https?:\/\/[^\s)]+/gi)) {
    if (!allowedUrl(match[0], dossier, corpus)) return true;
  }
  if (replyContainsPan(text)) return true;
  return false;
}

function stayId(reference: string | null, dossier: ConciergeDossier) {
  const trimmed = reference?.trim();
  if (!trimmed) return null;
  return dossier.stays.find((stay) => stay.reference === trimmed)?.id || null;
}

function userPrompt(input: {
  message: string;
  dossier: ConciergeDossier;
  history: ConciergeHistoryTurn[];
  lang: ReplyLang;
}) {
  const history = input.history
    .slice(-HISTORY_LIMIT)
    .map((row) => `${row.direction === "inbound" ? "Client" : "Concierge"}: ${row.body.slice(0, 1500)}`)
    .join("\n");
  return [
    `Langue de réponse : ${input.lang === "en" ? "anglais" : "français"}.`,
    "Dossier publié (JSON) :",
    conciergeContextText(input.dossier),
    "Historique :",
    history || "(aucun)",
    "Message du client :",
    input.message.slice(0, 1500),
  ].join("\n");
}

function conciergeModel() {
  const key = openaiApiKey();
  if (key) return createOpenAI({ apiKey: key })("gpt-4.1-mini");
  return "openai/gpt-4.1-mini";
}

/** Appel réel. Null si la clé manque, si le délai est dépassé, ou si la sortie est invalide. */
export async function generateConciergeReply(input: {
  message: string;
  dossier: ConciergeDossier;
  history: ConciergeHistoryTurn[];
  lang: ReplyLang;
}): Promise<ConciergeModelReply | null> {
  if (!aiGatewayConfigured()) return null;
  const key = openaiApiKey();
  try {
    const result = await generateText({
      model: conciergeModel(),
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      output: Output.object({
        schema: replySchema,
        name: "concierge_turn",
        description: "Réponse WhatsApp du Concierge, ancrée sur le dossier publié",
      }),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt(input) },
      ],
      ...(key
        ? {}
        : {
            providerOptions: {
              gateway: { tags: ["feature:whatsapp-concierge"] },
            },
          }),
    });
    const parsed = replySchema.safeParse(result.output);
    if (!parsed.success) return null;
    if (!parsed.data.text.trim()) return null;
    return parsed.data;
  } catch (err) {
    console.error("[whatsapp-concierge] turn", err instanceof Error ? err.name : "error");
    return null;
  }
}

function composeModelTurn(
  message: string,
  dossier: ConciergeDossier,
  keyword: ConciergeTurn,
  output: ConciergeModelReply
): ConciergeTurn {
  let handoff: HandoffKind | null = null;
  if (output.handoff === "complaint" && isComplaint(message)) handoff = "complaint";
  if (output.handoff === "question" && clientWantsAgency(message)) handoff = "question";
  const bookingId = stayId(output.bookingReference, dossier) || keyword.bookingId;
  let text = output.text.trim();
  if (handoff === "question" && !/agence|agency/i.test(text)) {
    text = `${text}\n${agencyHandoffSentence(messageLanguage(message))}`;
  }
  if (handoff === "complaint" && !/agence|agency/i.test(text)) {
    text = `${text}\n${agencyHandoffSentence(messageLanguage(message))}`;
  }
  return {
    handoff,
    bookingId,
    text: signReply(text),
    cover: handoff ? null : keyword.cover,
    optOut: false,
    access: false,
  };
}

/**
 * Stop, lien d’accès et actes métier restent le routeur déterministe.
 * Le modèle tient la conversation. Un fait inconnu, une erreur ou l’absence de clé
 * renvoient la réponse du routeur.
 */
export async function planConciergeConversation(input: {
  message: string;
  dossier: ConciergeDossier;
  history?: ConciergeHistoryTurn[];
  generate?: ConciergeGenerator;
}): Promise<ConciergeTurn> {
  const history = input.history || [];
  const keyword = planConciergeTurn(input.message, input.dossier);
  if (keyword.optOut || keyword.access || keyword.handoff) return keyword;
  if (confirmsAgencyOffer(input.message, history)) {
    return questionTurn(keyword, replyLanguage(input.message, history));
  }
  if (!input.generate) return keyword;

  let output: ConciergeModelReply | null = null;
  try {
    output = await input.generate({
      message: input.message,
      dossier: input.dossier,
      history: history.slice(-HISTORY_LIMIT),
      lang: messageLanguage(input.message),
    });
  } catch (err) {
    console.error("[whatsapp-concierge] turn", err instanceof Error ? err.name : "error");
    output = null;
  }
  if (!output?.text.trim()) {
    if (clientWantsAgency(input.message)) return questionTurn(keyword, messageLanguage(input.message));
    return keyword;
  }
  if (replyUsesUnknownFact(output.text, input.dossier, history)) {
    if (clientWantsAgency(input.message)) return questionTurn(keyword, messageLanguage(input.message));
    return keyword;
  }
  return composeModelTurn(input.message, input.dossier, keyword, output);
}
