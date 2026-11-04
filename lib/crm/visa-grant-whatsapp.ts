import { greetingGivenName } from "./identity";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE, whatsappAddress } from "./whatsapp";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { isTravelAuthorization } from "./types";
import { productionOnlySecret } from "./preview-secrets";

/**
 * Meta n’accepte qu’un type d’en-tête par modèle.
 * Un PDF devient un en-tête Document, une photo un en-tête Image.
 */
export const VISA_GRANT_TEMPLATE_ENV = {
  autorisation_validee_document: "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT",
  autorisation_validee_image: "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE",
} as const;

export type VisaGrantTemplate = keyof typeof VISA_GRANT_TEMPLATE_ENV;
export type VisaGrantHeader = "document" | "image";

export const VISA_GRANT_URL_TTL_SECONDS = 60 * 60;

export const VISA_GRANT_SAMPLE_PDF = "esta-exemple.pdf";
export const VISA_GRANT_SAMPLE_IMAGE = "esta-exemple.jpg";
export const VISA_GRANT_SAMPLE_PDF_PATH = `exemple/${VISA_GRANT_SAMPLE_PDF}`;
export const VISA_GRANT_SAMPLE_IMAGE_PATH = `exemple/${VISA_GRANT_SAMPLE_IMAGE}`;

const MEDIA_BASE = `${siteConfig.url}/api/whatsapp/autorisations/`;

/** Phrase demandée, avec la salutation et la signature des autres modèles. */
export const VISA_GRANT_SENTENCE = "Bonne nouvelle ! Votre ESTA ou ETA a été validé. Vous le trouverez ci-joint.";

const BODY = ["Bonjour {{2}},", "", VISA_GRANT_SENTENCE, "", CONCIERGE_SIGNATURE].join("\n");

const PASSPORT = /\b[A-Z]{1,2}\d{6,9}\b/i;

export type VisaGrantCandidate = {
  id: string;
  doc_type?: string | null;
  issuing_country?: string | null;
  traveler_id?: string | null;
  booking_id?: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export function visaGrantTemplateForHeader(header: VisaGrantHeader): VisaGrantTemplate {
  return header === "image" ? "autorisation_validee_image" : "autorisation_validee_document";
}

export function visaGrantContentSid(header: VisaGrantHeader) {
  return productionOnlySecret(process.env[VISA_GRANT_TEMPLATE_ENV[visaGrantTemplateForHeader(header)]]) || "";
}

/** PDF → document. JPEG ou PNG → image. Le reste ne part pas. */
export function visaGrantHeader(mime: string | null | undefined, fileName: string | null | undefined): VisaGrantHeader | null {
  const type = (mime || "").toLowerCase();
  const name = (fileName || "").toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "document";
  if (type.includes("png") || name.endsWith(".png")) return "image";
  if (type.includes("jpeg") || type.includes("jpg") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image";
  return null;
}

export function visaGrantLabel(input: { country?: string | null; docType?: string | null }): "ESTA" | "ETA" | "Visa" {
  const country = (input.country || "").trim().toUpperCase();
  if (country === "US") return "ESTA";
  if (input.docType === "eta" || country === "GB" || country === "IL") return "ETA";
  return "Visa";
}

export function visaGrantGivenName(value: string | null | undefined) {
  const name = (greetingGivenName(value) || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return "voyageur";
  if (PASSPORT.test(name) || /https?:|travelba\.fr/i.test(name) || name.includes("{{")) return "voyageur";
  return name;
}

function asciiToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9]/g, "");
}

/** « ESTA-Camille-Martin.pdf ». Le numéro de pièce n’entre pas dans le nom. */
export function visaGrantFileName(input: {
  label: "ESTA" | "ETA" | "Visa";
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  header: VisaGrantHeader;
  mime?: string | null;
}) {
  const first = asciiToken(input.firstName || "");
  const last = asciiToken(input.lastName || "");
  if (!first || !last || first.length > 40 || last.length > 40) return null;
  if (/\d/.test(first) || /\d/.test(last) || PASSPORT.test(first) || PASSPORT.test(last)) return null;
  const png = (input.mime || "").toLowerCase().includes("png");
  const ext = input.header === "document" ? "pdf" : png ? "png" : "jpg";
  const name = `${input.label}-${first}-${last}.${ext}`;
  if (name.length > 120 || /["\\\r\n]/.test(name)) return null;
  return name;
}

export function visaGrantMediaVariable(token: string, filename: string) {
  if (!token || token.includes("/") || filename.includes("/") || filename.includes("\\")) return null;
  if (!/\.(pdf|png|jpe?g)$/i.test(filename)) return null;
  return `${token}/${encodeURIComponent(filename)}`;
}

export function visaGrantContentVariables(mediaPath: string, givenName: string) {
  if (!mediaPath || mediaPath.includes("..") || mediaPath.includes("\\") || /^https?:/i.test(mediaPath)) return null;
  if (!/\.(pdf|png|jpe?g)$/i.test(mediaPath)) return null;
  return { "1": mediaPath, "2": visaGrantGivenName(givenName) };
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

export function visaGrantPreview(givenName: string | null | undefined) {
  const text = applyVars(BODY, { "2": visaGrantGivenName(givenName) });
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

export function visaGrantBody() {
  return BODY;
}

/** Le badge et l’outil refusent : rien ne part sans la pièce. */
export function visaGrantPendingMessage(header: VisaGrantHeader) {
  const template = visaGrantTemplateForHeader(header);
  const env = VISA_GRANT_TEMPLATE_ENV[template];
  const kind = header === "image" ? "Image (JPEG ou PNG)" : "Document (PDF)";
  return `Le modèle WhatsApp « ${template} » n’est pas encore approuvé par Meta. Le document ne part pas sans ce modèle. En-tête ${kind}. À soumettre : npx tsx scripts/arm-whatsapp-concierge.ts, puis ${env}.`;
}

export const VISA_GRANT_MISSING = "Le document du visa n’est pas dans l’espace.";
export const VISA_GRANT_UNSUPPORTED = "Le fichier doit être un PDF, un JPEG ou un PNG.";

export function visaGrantSendBlock(input: {
  phone?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
  file?: { mime: string | null; fileName: string | null } | null;
}) {
  if (!whatsappAddress(input.phone)) return "Pas de téléphone pour WhatsApp.";
  if (!proactiveWhatsappAllowed({ whatsapp_opt_in_at: input.optInAt, whatsapp_opt_out_at: input.optOutAt })) {
    return "WhatsApp n’est pas accepté.";
  }
  if (!input.file) return VISA_GRANT_MISSING;
  const header = visaGrantHeader(input.file.mime, input.file.fileName);
  if (!header) return VISA_GRANT_UNSUPPORTED;
  if (!visaGrantContentSid(header)) return visaGrantPendingMessage(header);
  return null;
}

/**
 * Pièce du voyageur pour ce pays. La plus récente si plusieurs.
 * Un voyageur nommé l’emporte sur une pièce sans voyageur.
 */
export function visaGrantPayload(file: VisaGrantCandidate | null | undefined) {
  if (!file?.id || !file.storage_path) return null;
  return {
    documentId: file.id,
    mime: file.mime_type || null,
    fileName: file.file_name || null,
    firstName: file.first_name || null,
    lastName: file.last_name || null,
    country: file.issuing_country || null,
    docType: file.doc_type || null,
  };
}

export function pickVisaGrantFile<T extends VisaGrantCandidate>(
  documents: T[] | null | undefined,
  input: { country: string; travelerId?: string | null; bookingId?: string | null }
): T | null {
  const country = input.country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return null;
  const rows = (documents || []).filter((doc) => {
    if (!isTravelAuthorization(doc.doc_type) || !doc.storage_path || !doc.id) return false;
    if ((doc.issuing_country || "").trim().toUpperCase() !== country) return false;
    if (input.bookingId && doc.booking_id && doc.booking_id !== input.bookingId) return false;
    return true;
  });
  if (input.travelerId) {
    const own = rows.filter((doc) => doc.traveler_id === input.travelerId);
    if (own.length) return own[own.length - 1];
  }
  const loose = rows.filter((doc) => !input.travelerId || !doc.traveler_id || doc.traveler_id === input.travelerId);
  return loose.length ? loose[loose.length - 1] : null;
}

function mediaTemplate(samplePath: string) {
  return {
    friendly_name: "",
    language: "fr" as const,
    variables: { "1": samplePath, "2": "Camille" },
    types: {
      "twilio/media": {
        body: BODY,
        media: [`${MEDIA_BASE}{{1}}`],
      },
    },
  };
}

/** PDF d’exemple, sans voyageur. Meta le récupère pour classer l’en-tête Document. */
export function visaGrantSamplePdf() {
  const stream = "BT /F1 18 Tf 36 90 Td (ESTA exemple) Tj ET";
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

/** Brouillons soumis par `scripts/arm-whatsapp-concierge.ts`. Le SID n’est pas ici. */
export function visaGrantContentDrafts() {
  const document = mediaTemplate(VISA_GRANT_SAMPLE_PDF_PATH);
  document.friendly_name = "autorisation_validee_document";
  const image = mediaTemplate(VISA_GRANT_SAMPLE_IMAGE_PATH);
  image.friendly_name = "autorisation_validee_image";
  return [
    {
      template: "autorisation_validee_document" as const,
      env: VISA_GRANT_TEMPLATE_ENV.autorisation_validee_document,
      friendlyName: "autorisation_validee_document",
      create: document,
    },
    {
      template: "autorisation_validee_image" as const,
      env: VISA_GRANT_TEMPLATE_ENV.autorisation_validee_image,
      friendlyName: "autorisation_validee_image",
      create: image,
    },
  ];
}
