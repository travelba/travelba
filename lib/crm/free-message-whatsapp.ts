import { greetingGivenName } from "./identity";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE, withConciergeSignature } from "./whatsapp";
import { visaGrantHeader, type VisaGrantHeader } from "./visa-grant-whatsapp";

/**
 * Message libre WhatsApp. Ce n’est pas l’autorisation de voyage.
 * Le corps garde assez de français fixe pour Meta : au moins (2x+1) mots hors variables.
 * {{1}} du média n’est pas dans le corps. Le prénom et le texte de l’agence le sont.
 */

export const FREE_MESSAGE_TEMPLATE_ENV = {
  message_libre_texte: "TWILIO_CONTENT_MESSAGE_LIBRE_TEXTE",
  message_libre_document: "TWILIO_CONTENT_MESSAGE_LIBRE_DOCUMENT",
  message_libre_image: "TWILIO_CONTENT_MESSAGE_LIBRE_IMAGE",
} as const;

export type FreeMessageTemplate = keyof typeof FREE_MESSAGE_TEMPLATE_ENV;
export type FreeMessageHeader = VisaGrantHeader;

export const FREE_MESSAGE_SAMPLE_PDF_PATH = "exemple/esta-exemple.pdf";
export const FREE_MESSAGE_SAMPLE_IMAGE_PATH = "exemple/esta-exemple.jpg";
export const FREE_MESSAGE_SAMPLE_GREETING = "Camille";
export const FREE_MESSAGE_SAMPLE_TEXT = "Voici le document demandé pour votre séjour.";
export const FREE_MESSAGE_MAX_CHARS = 700;
export const FREE_MESSAGE_URL_TTL_SECONDS = 60 * 60;

const MEDIA_BASE = `${siteConfig.url}/api/whatsapp/autorisations/`;

export const FREE_MESSAGE_SAMPLE_PDF_URL = `${MEDIA_BASE}${FREE_MESSAGE_SAMPLE_PDF_PATH}`;
export const FREE_MESSAGE_SAMPLE_IMAGE_URL = `${MEDIA_BASE}${FREE_MESSAGE_SAMPLE_IMAGE_PATH}`;

/** Hors pièce. {{1}} prénom, {{2}} texte de l’agence. */
export const FREE_MESSAGE_TEXT_BODY = [
  "Bonjour {{1}},",
  "",
  "Votre conseiller Travel BA vous adresse ce message :",
  "",
  "{{2}}",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

/** PDF ou image. {{1}} est le média, hors corps. {{2}} prénom, {{3}} texte de l’agence. */
export const FREE_MESSAGE_MEDIA_BODY = [
  "Bonjour {{2}},",
  "",
  "Votre conseiller Travel BA vous adresse ce message. Vous trouverez le document ci-joint.",
  "",
  "{{3}}",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

const PASSPORT = /\b[A-Z]{1,2}\d{6,9}\b/i;
const IDENTITY = new Set(["passport", "id_card", "passeport", "carte d'identité", "carte d'identite"]);

export function freeMessageTemplateFor(header: FreeMessageHeader | null): FreeMessageTemplate {
  if (header === "image") return "message_libre_image";
  if (header === "document") return "message_libre_document";
  return "message_libre_texte";
}

export function freeMessageBody(template: FreeMessageTemplate) {
  return template === "message_libre_texte" ? FREE_MESSAGE_TEXT_BODY : FREE_MESSAGE_MEDIA_BODY;
}

/** Mots hors {{n}}. Meta demande au moins (2x+1) mots fixes pour x variables du corps. */
export function freeMessageRatio(body: string) {
  const variables = body.match(/\{\{\d+\}\}/g)?.length ?? 0;
  const words = body
    .replace(/\{\{\d+\}\}/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).length;
  const needed = 2 * variables + 1;
  return { variables, words, needed, ok: variables === 0 || words >= needed };
}

export function freeMessageHeader(mime: string | null | undefined, fileName: string | null | undefined) {
  return visaGrantHeader(mime, fileName);
}

export function freeMessageIdentityBlocked(docType: string | null | undefined) {
  const type = (docType || "").trim().toLowerCase();
  return IDENTITY.has(type);
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

/** Texte de la fenêtre de 24 h : les mots de l’agence, puis la signature. */
export function freeMessageSessionBody(value: string | null | undefined) {
  if (freeMessageTextError(value)) return null;
  const text = (value || "").replace(/\r\n/g, "\n").trim();
  const signed = withConciergeSignature(text);
  if (!signed || signed.length > 1000 || /\{\{/.test(signed)) return null;
  return signed;
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

/** Texte que le client lit quand le modèle part. */
export function freeMessageTemplatePreview(template: FreeMessageTemplate, firstName: string | null | undefined, text: string) {
  const variable = freeMessageVariableText(text);
  if (!variable) return null;
  const greeting = freeMessageGivenName(firstName);
  const filled =
    template === "message_libre_texte"
      ? applyVars(FREE_MESSAGE_TEXT_BODY, { "1": greeting, "2": variable })
      : applyVars(FREE_MESSAGE_MEDIA_BODY, { "2": greeting, "3": variable });
  if (/\{\{\d+\}\}/.test(filled)) return null;
  return filled;
}

export function freeMessageFileName(stored: string | null | undefined, header: FreeMessageHeader, mime: string | null | undefined) {
  const png = (mime || "").toLowerCase().includes("png");
  const ext = header === "document" ? "pdf" : png ? "png" : "jpg";
  const stem = (stored || "")
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!stem || /\d{5,}/.test(stem) || PASSPORT.test(stem)) return `Document-Travel-BA.${ext}`;
  const name = `${stem}.${ext}`;
  if (name.length > 80 || /["\\\r\n]/.test(name)) return `Document-Travel-BA.${ext}`;
  return name;
}

export function freeMessageMediaVariable(token: string, filename: string) {
  if (!token || token.includes("/") || filename.includes("/") || filename.includes("\\")) return null;
  if (!/\.(pdf|png|jpe?g)$/i.test(filename)) return null;
  return `${token}/${encodeURIComponent(filename)}`;
}

export function freeMessageMediaUrl(mediaPath: string) {
  if (!mediaPath || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  return `${MEDIA_BASE}${mediaPath}`;
}

export function freeMessageContentVariables(
  template: FreeMessageTemplate,
  input: { mediaPath?: string | null; firstName: string | null | undefined; text: string }
): Record<string, string> | null {
  const variable = freeMessageVariableText(input.text);
  if (!variable) return null;
  const greeting = freeMessageGivenName(input.firstName);
  if (template === "message_libre_texte") return { "1": greeting, "2": variable };
  const mediaPath = input.mediaPath || "";
  if (!mediaPath || mediaPath.includes("..") || /^https?:/i.test(mediaPath)) return null;
  if (!/\.(pdf|png|jpe?g)$/i.test(mediaPath)) return null;
  return { "1": mediaPath, "2": greeting, "3": variable };
}

export function freeMessagePendingMessage(template: FreeMessageTemplate) {
  const env = FREE_MESSAGE_TEMPLATE_ENV[template];
  const kind =
    template === "message_libre_image" ? "Image (JPEG ou PNG)" : template === "message_libre_document" ? "Document (PDF)" : "Texte";
  return `Le modèle WhatsApp « ${template} » n’est pas encore approuvé par Meta. Rien n’est envoyé. À déposer : deposer_modeles_message_libre_whatsapp. Le SID est écrit dans crm_whatsapp_content_sids, sinon ${env}. En-tête ${kind}.`;
}

function mediaDraft(name: FreeMessageTemplate, samplePath: string) {
  return {
    template: name,
    env: FREE_MESSAGE_TEMPLATE_ENV[name],
    friendlyName: name,
    create: {
      friendly_name: name,
      language: "fr" as const,
      variables: {
        "1": samplePath,
        "2": FREE_MESSAGE_SAMPLE_GREETING,
        "3": FREE_MESSAGE_SAMPLE_TEXT,
      },
      types: {
        "twilio/media": {
          body: FREE_MESSAGE_MEDIA_BODY,
          media: [`${MEDIA_BASE}{{1}}`],
        },
      },
    },
  };
}

/** Brouillons déposés par `deposer_modeles_message_libre_whatsapp`. Le SID n’est pas ici. */
export function freeMessageContentDrafts() {
  return [
    {
      template: "message_libre_texte" as const,
      env: FREE_MESSAGE_TEMPLATE_ENV.message_libre_texte,
      friendlyName: "message_libre_texte",
      create: {
        friendly_name: "message_libre_texte",
        language: "fr" as const,
        variables: {
          "1": FREE_MESSAGE_SAMPLE_GREETING,
          "2": FREE_MESSAGE_SAMPLE_TEXT,
        },
        types: {
          "twilio/text": { body: FREE_MESSAGE_TEXT_BODY },
        },
      },
    },
    mediaDraft("message_libre_document", FREE_MESSAGE_SAMPLE_PDF_PATH),
    mediaDraft("message_libre_image", FREE_MESSAGE_SAMPLE_IMAGE_PATH),
  ];
}
