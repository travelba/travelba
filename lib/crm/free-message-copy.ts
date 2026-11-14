import { greetingGivenName } from "./identity";

/**
 * Texte du modèle message_libre_texte, sans Twilio.
 * Le corps est celui déposé chez Meta : prénom, texte de l’agence, signature.
 * Le compositeur admin l’importe sans charger l’envoi.
 */

export const FREE_MESSAGE_SIGNATURE = "Le Concierge";
export const FREE_MESSAGE_MAX_CHARS = 700;

/** Hors pièce. {{1}} prénom, {{2}} texte de l’agence. */
export const FREE_MESSAGE_TEXT_BODY = [
  "Bonjour {{1}},",
  "",
  "Votre conseiller Travel BA vous adresse ce message :",
  "",
  "{{2}}",
  "",
  FREE_MESSAGE_SIGNATURE,
].join("\n");

const PASSPORT = /\b[A-Z]{1,2}\d{6,9}\b/i;

export function freeMessageLooksLikeDocumentNumber(value: string) {
  return PASSPORT.test(value);
}

export function freeMessageGivenName(value: string | null | undefined) {
  const name = (greetingGivenName(value) || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return "voyageur";
  if (PASSPORT.test(name) || /https?:|travelba\.fr/i.test(name) || name.includes("{{")) return "voyageur";
  return name;
}

/** Texte mis dans la variable. Une ligne : Meta refuse les sauts dans une variable. */
export function freeMessageVariableText(value: string | null | undefined): string | null {
  const text = (value || "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!text || text.length > FREE_MESSAGE_MAX_CHARS) return null;
  if (text.includes("{{") || text.includes("}}") || PASSPORT.test(text)) return null;
  return text;
}

export function freeMessageTextError(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "Écrivez le message.";
  if (raw.length > FREE_MESSAGE_MAX_CHARS) return `Le message dépasse ${FREE_MESSAGE_MAX_CHARS} caractères.`;
  if (raw.includes("{{") || raw.includes("}}")) return "Le message ne peut pas contenir de variable.";
  if (PASSPORT.test(raw)) return "Le message ne peut pas contenir un numéro de pièce.";
  if (!freeMessageVariableText(raw)) return "Le message n’a pas pu être préparé.";
  return null;
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

/** Texte exact que le client lit pour message_libre_texte. */
export function freeMessageTemplateText(firstName: string | null | undefined, text: string) {
  const variable = freeMessageVariableText(text);
  if (!variable) return null;
  const greeting = freeMessageGivenName(firstName);
  const filled = applyVars(FREE_MESSAGE_TEXT_BODY, { "1": greeting, "2": variable });
  if (/\{\{\d+\}\}/.test(filled)) return null;
  return filled;
}

/** Aperçu du compositeur. Hors fenêtre, sans modèle séjour ni rappel. */
export function composerFreePreview(input: {
  windowOpen: boolean;
  template: string;
  text: string;
  firstName?: string | null;
}): { libre: boolean; texte: string | null; erreur: string | null } {
  const template = input.template.trim();
  if (input.windowOpen || template === "sejour_texte" || template === "rappel") {
    return { libre: false, texte: null, erreur: null };
  }
  if (!input.text.trim()) return { libre: true, texte: null, erreur: null };
  const erreur = freeMessageTextError(input.text);
  if (erreur) return { libre: true, texte: null, erreur };
  const texte = freeMessageTemplateText(input.firstName, input.text);
  if (!texte) return { libre: true, texte: null, erreur: "Le message n’a pas pu être préparé." };
  return { libre: true, texte, erreur: null };
}
