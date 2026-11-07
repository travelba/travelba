import { createHash } from "node:crypto";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE } from "./whatsapp";

/**
 * Message libre : un PDF en en-tête Document et un texte choisi par l’agence.
 * Ce n’est pas le modèle d’autorisation (visa, ESTA, ETA).
 * `acces_client` a été refusé par Meta : ce nom n’est pas repris.
 */
export const FREE_MESSAGE_TEMPLATE = "message_libre_document";
export const FREE_MESSAGE_TEMPLATE_ENV = "TWILIO_CONTENT_MESSAGE_LIBRE_DOCUMENT";
export const FREE_MESSAGE_CATEGORY = "UTILITY";
export const FREE_MESSAGE_LANGUAGE = "fr";

/** Noms déjà refusés. Un nouveau dépôt ne les réutilise pas. */
export const FREE_MESSAGE_REJECTED_NAMES = ["acces_client"] as const;

export const FREE_MESSAGE_URL_TTL_SECONDS = 60 * 60;
export const FREE_MESSAGE_SAMPLE_FILE = "message-agence-exemple.pdf";
export const FREE_MESSAGE_SAMPLE_PATH = `exemple/${FREE_MESSAGE_SAMPLE_FILE}`;
export const FREE_MESSAGE_SAMPLE_NAME = "Document-exemple.pdf";

const MEDIA_BASE = `${siteConfig.url}/api/whatsapp/messages/`;

/**
 * {{1}} est le PDF (en-tête, pas dans le corps).
 * {{2}} est le texte de l’agence.
 * Le corps commence par une salutation fixe et finit par Travel BA puis Le Concierge,
 * pour que la variable ne soit ni au début ni à la fin.
 */
export const FREE_MESSAGE_BODY = [
  "Bonjour,",
  "",
  "{{2}}",
  "",
  "Ce message de Travel BA accompagne le document joint.",
  "",
  CONCIERGE_SIGNATURE,
].join("\n");

/** Exemple soumis à Meta avec le dépôt. Pas un client réel. */
export const FREE_MESSAGE_SAMPLE_TEXT =
  "Camille, votre document de voyage est prêt. Vous le trouverez ci-joint.";

const PASSPORT = /\b(?:[A-Z]{1,2}\d{6,9}|\d{2}[A-Z]{2}\d{5})\b/i;
const MRZ = /[A-Z0-9<]{28,}/i;
const CARD = /\b\d{13,19}\b/;
const MAX_TEXT = 600;

/**
 * Meta exige au moins (2x+1) mots hors variables pour x variables.
 * Les mots se comptent sur le corps, après retrait des {{n}}.
 */
export function freeMessageWordRatio(body: string) {
  const variables = body.match(/\{\{\d+\}\}/g) || [];
  const words = body
    .replace(/\{\{\d+\}\}/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const variableCount = variables.length;
  const needed = 2 * variableCount + 1;
  return { words: words.length, variables: variableCount, needed, ok: words.length >= needed };
}

export function freeMessageFileName(stored: string | null | undefined) {
  const base = (stored || "document.pdf").split(/[/\\]/).pop() || "document.pdf";
  const cleaned = base
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const named = cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "document"}.pdf`;
  if (!named || named.length > 120 || named === ".pdf" || PASSPORT.test(named) || /["\\\r\n]/.test(named)) {
    return "document.pdf";
  }
  return named;
}

/** Une ligne, sans numéro de pièce ni accolade. La signature fixe n’est pas répétée. */
export function freeMessageText(value: string | null | undefined) {
  let text = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/(?:\s*[—–-]\s*)?(?:travel ba\s*)?le concierge\.?$/i, "").trim();
  if (!text || text.length > MAX_TEXT) return null;
  if (text.includes("{{") || text.includes("}}") || /[{}]/.test(text)) return null;
  if (PASSPORT.test(text) || MRZ.test(text.replace(/\s/g, "")) || CARD.test(text.replace(/\s/g, ""))) return null;
  return text;
}

export function freeMessagePreview(message: string | null | undefined) {
  const custom = freeMessageText(message);
  if (!custom) return null;
  const text = FREE_MESSAGE_BODY.replaceAll("{{2}}", custom);
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

export function freeMessageMediaVariable(token: string, filename: string) {
  if (!token || token.includes("/") || filename.includes("/") || filename.includes("\\")) return null;
  if (!filename.toLowerCase().endsWith(".pdf")) return null;
  return `${token}/${encodeURIComponent(filename)}`;
}

export function freeMessageContentVariables(mediaPath: string, message: string) {
  const custom = freeMessageText(message);
  if (!custom) return null;
  if (!mediaPath || mediaPath.includes("..") || mediaPath.includes("\\") || /^https?:/i.test(mediaPath)) return null;
  if (!/\.pdf$/i.test(mediaPath)) return null;
  return { "1": mediaPath, "2": custom };
}

export function freeMessageDedupeKey(documentId: string, qui: "client" | "voyageur", travelerId: string | null, message: string) {
  const digest = createHash("sha256").update(`${qui}\n${travelerId || ""}\n${message}`).digest("hex").slice(0, 12);
  const who = travelerId ? `${qui}:${travelerId}` : qui;
  return `message-libre:${documentId}:${who}:${digest}`;
}

export function isPdfDocument(mime: string | null | undefined, fileName: string | null | undefined) {
  const type = (mime || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (type.includes("pdf")) return true;
  if (type && !type.includes("octet-stream")) return false;
  return name.endsWith(".pdf");
}

/** Le badge et l’outil refusent : rien ne part sans le modèle approuvé. */
export function freeMessagePendingMessage() {
  const ratio = freeMessageWordRatio(FREE_MESSAGE_BODY);
  return [
    `Le modèle WhatsApp « ${FREE_MESSAGE_TEMPLATE} » n’est pas encore approuvé par Meta. Rien ne part.`,
    `Catégorie ${FREE_MESSAGE_CATEGORY}, langue ${FREE_MESSAGE_LANGUAGE}, en-tête Document (PDF).`,
    `Corps : ${FREE_MESSAGE_BODY.replace(/\n/g, " / ")}.`,
    `{{1}} est le fichier, exemple ${FREE_MESSAGE_SAMPLE_PATH}. {{2}} exemple : « ${FREE_MESSAGE_SAMPLE_TEXT} ».`,
    `Mots hors variable : ${ratio.words}, variables du corps : ${ratio.variables}, minimum Meta : ${ratio.needed}.`,
    `À déposer : deposer_modele_message_libre. Le SID est écrit dans crm_whatsapp_content_sids, sinon ${FREE_MESSAGE_TEMPLATE_ENV}.`,
    `Exemple de média : ${MEDIA_BASE}${FREE_MESSAGE_SAMPLE_PATH}.`,
  ].join(" ");
}

export function freeMessageSamplePdf() {
  const stream = "BT /F1 18 Tf 36 90 Td (Document exemple) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, "latin1");
}

/** Brouillon Content API. Le SID n’est pas ici. */
export function freeMessageContentDrafts() {
  return [
    {
      template: FREE_MESSAGE_TEMPLATE,
      env: FREE_MESSAGE_TEMPLATE_ENV,
      friendlyName: FREE_MESSAGE_TEMPLATE,
      create: {
        friendly_name: FREE_MESSAGE_TEMPLATE,
        language: FREE_MESSAGE_LANGUAGE,
        variables: {
          "1": FREE_MESSAGE_SAMPLE_PATH,
          "2": FREE_MESSAGE_SAMPLE_TEXT,
        },
        types: {
          "twilio/media": {
            body: FREE_MESSAGE_BODY,
            media: [`${MEDIA_BASE}{{1}}`],
          },
        },
      },
    },
  ];
}
