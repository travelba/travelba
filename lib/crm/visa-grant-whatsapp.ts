import { greetingGivenName } from "./identity";
import { siteConfig } from "../site";
import { CONCIERGE_SIGNATURE, whatsappAddress } from "./whatsapp";
import { proactiveWhatsappAllowed } from "./whatsapp-concierge";
import { isTravelAuthorization } from "./types";
import { productionOnlySecret } from "./preview-secrets";
import { authorizationDisplayName } from "./visa-fr";

/**
 * Meta n’accepte qu’un type d’en-tête par modèle.
 * Un PDF devient un en-tête Document, une photo un en-tête Image.
 */
export const VISA_GRANT_TEMPLATE_ENV = {
  autorisation_validee_document: "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT",
  autorisation_validee_image: "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE",
  autorisation_validee_document_v2: "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT_V2",
  autorisation_validee_image_v2: "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE_V2",
} as const;

export type VisaGrantTemplate = keyof typeof VISA_GRANT_TEMPLATE_ENV;
export type VisaGrantHeader = "document" | "image";
export type VisaGrantVersion = "v1" | "v2";

export const VISA_GRANT_URL_TTL_SECONDS = 60 * 60;

export const VISA_GRANT_SAMPLE_PDF = "esta-exemple.pdf";
export const VISA_GRANT_SAMPLE_IMAGE = "esta-exemple.jpg";
export const VISA_GRANT_SAMPLE_PDF_PATH = `exemple/${VISA_GRANT_SAMPLE_PDF}`;
export const VISA_GRANT_SAMPLE_IMAGE_PATH = `exemple/${VISA_GRANT_SAMPLE_IMAGE}`;

const MEDIA_BASE = `${siteConfig.url}/api/whatsapp/autorisations/`;

/** Phrase v1, encore envoyée tant que Meta n’a pas approuvé la v2. */
export const VISA_GRANT_SENTENCE = "Bonne nouvelle ! Votre ESTA ou ETA a été validé. Vous le trouverez ci-joint.";

/** Phrase v2. {{3}} est le nom de l’autorisation (ESTA, ETA, ETA-IL…). */
export const VISA_GRANT_SENTENCE_V2 =
  "Bonne nouvelle ! Votre autorisation {{3}} a été validée. Vous la trouverez ci-jointe.";

export const VISA_GRANT_SAMPLE_AUTHORIZATION = "ESTA";

const BODY_V1 = ["Bonjour {{2}},", "", VISA_GRANT_SENTENCE, "", CONCIERGE_SIGNATURE].join("\n");
const BODY_V2 = ["Bonjour {{2}},", "", VISA_GRANT_SENTENCE_V2, "", CONCIERGE_SIGNATURE].join("\n");

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

export function visaGrantTemplateForHeader(header: VisaGrantHeader, version: VisaGrantVersion = "v1"): VisaGrantTemplate {
  if (version === "v2") return header === "image" ? "autorisation_validee_image_v2" : "autorisation_validee_document_v2";
  return header === "image" ? "autorisation_validee_image" : "autorisation_validee_document";
}

export function visaGrantTemplateVersion(template: string | null | undefined): VisaGrantVersion | null {
  if (template === "autorisation_validee_document_v2" || template === "autorisation_validee_image_v2") return "v2";
  if (template === "autorisation_validee_document" || template === "autorisation_validee_image") return "v1";
  return null;
}

/** Un envoi v1 ou v2 compte. L’ancienne carte sans ce fichier ne compte pas. */
export function isVisaGrantTemplate(template: string | null | undefined) {
  return visaGrantTemplateVersion(template) !== null;
}

/** Une pièce, un envoi. Le voyageur d’un autre numéro a sa propre clé. */
export function visaGrantDedupeKey(bookingId: string, documentId: string, travelerId?: string | null) {
  const base = `autorisation-validee:${bookingId}:${documentId}`;
  return travelerId ? `${base}:voyageur:${travelerId}` : base;
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

/** Nom mis dans {{3}} et dans les textes hors modèle Meta. */
export function visaGrantAuthorizationName(input?: { country?: string | null; docType?: string | null }) {
  return authorizationDisplayName(input);
}

export function visaGrantAuthorizationToken(value: string | null | undefined) {
  const name = (value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40) return null;
  if (/[{}%]|https?:|travelba\.fr/i.test(name) || name.includes("{{")) return null;
  if (PASSPORT.test(name)) return null;
  return name;
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

export function visaGrantContentVariables(
  mediaPath: string,
  givenName: string,
  authorization?: string | null
) {
  if (!mediaPath || mediaPath.includes("..") || mediaPath.includes("\\") || /^https?:/i.test(mediaPath)) return null;
  if (!/\.(pdf|png|jpe?g)$/i.test(mediaPath)) return null;
  const variables: Record<string, string> = { "1": mediaPath, "2": visaGrantGivenName(givenName) };
  if (authorization === undefined) return variables;
  variables["3"] = visaGrantAuthorizationToken(authorization) || visaGrantAuthorizationName();
  return variables;
}

function applyVars(body: string, variables: Record<string, string>) {
  return body.replace(/\{\{(\d+)\}\}/g, (_, key: string) => variables[key] ?? "");
}

/** Texte avec le vrai nom. C’est celui de la v2, et celui des avis hors WhatsApp Meta. */
export function visaGrantPreview(givenName: string | null | undefined, authorization?: string | null) {
  const label = visaGrantAuthorizationToken(authorization || "") || visaGrantAuthorizationName();
  const text = applyVars(BODY_V2, { "2": visaGrantGivenName(givenName), "3": label });
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

/** Texte du modèle v1, sans variable de nom. */
export function visaGrantLegacyPreview(givenName: string | null | undefined) {
  const text = applyVars(BODY_V1, { "2": visaGrantGivenName(givenName) });
  if (/\{\{\d+\}\}/.test(text)) return null;
  return text;
}

export function visaGrantBody(version: VisaGrantVersion = "v2") {
  return version === "v1" ? BODY_V1 : BODY_V2;
}

/** Le badge et l’outil refusent : rien ne part sans la pièce. */
export function visaGrantPendingMessage(header: VisaGrantHeader) {
  const current = visaGrantTemplateForHeader(header, "v2");
  const previous = visaGrantTemplateForHeader(header, "v1");
  const env = VISA_GRANT_TEMPLATE_ENV[current];
  const fallback = VISA_GRANT_TEMPLATE_ENV[previous];
  const kind = header === "image" ? "Image (JPEG ou PNG)" : "Document (PDF)";
  return `Le modèle WhatsApp « ${current} » n’est pas encore approuvé par Meta, et « ${previous} » n’a pas de SID. Le document ne part pas sans un modèle approuvé. En-tête ${kind}. À déposer : deposer_modeles_autorisation_whatsapp. Le SID est écrit dans crm_whatsapp_content_sids, sinon ${env} (repli ${fallback}).`;
}

export const VISA_GRANT_MISSING = "Le document du visa n’est pas dans l’espace.";
export const VISA_GRANT_UNSUPPORTED = "Le fichier doit être un PDF, un JPEG ou un PNG.";

export function visaGrantSendBlock(input: {
  phone?: string | null;
  optInAt?: string | null;
  optOutAt?: string | null;
  file?: { mime: string | null; fileName: string | null } | null;
  /** SID déjà lu (réglage, puis variable). Omis : seule la variable est regardée. */
  contentSid?: string | null;
}) {
  if (!whatsappAddress(input.phone)) return "Pas de téléphone pour WhatsApp.";
  if (!proactiveWhatsappAllowed({ whatsapp_opt_in_at: input.optInAt, whatsapp_opt_out_at: input.optOutAt })) {
    return "WhatsApp n’est pas accepté.";
  }
  if (!input.file) return VISA_GRANT_MISSING;
  const header = visaGrantHeader(input.file.mime, input.file.fileName);
  if (!header) return VISA_GRANT_UNSUPPORTED;
  const sid = input.contentSid !== undefined ? input.contentSid : visaGrantContentSid(header);
  if (!sid) return visaGrantPendingMessage(header);
  return null;
}

/**
 * Pièce du voyageur pour ce pays. La plus récente si plusieurs.
 * Un voyageur nommé l’emporte sur une pièce sans voyageur.
 */
/** SID déjà résolu pour le type du fichier. Vide si le modèle n’est pas là. */
export function visaGrantSidFor(
  file: { mime_type?: string | null; file_name?: string | null; storage_path?: string | null } | null | undefined,
  sids: { document: string; image: string } | null | undefined
) {
  if (!sids || !file?.storage_path) return undefined;
  const header = visaGrantHeader(file.mime_type, file.file_name);
  if (header === "image") return sids.image;
  if (header === "document") return sids.document;
  return "";
}

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

function mediaTemplate(samplePath: string, version: VisaGrantVersion) {
  return {
    friendly_name: "",
    language: "fr" as const,
    variables:
      version === "v2"
        ? { "1": samplePath, "2": "Camille", "3": VISA_GRANT_SAMPLE_AUTHORIZATION }
        : { "1": samplePath, "2": "Camille" },
    types: {
      "twilio/media": {
        body: version === "v2" ? BODY_V2 : BODY_V1,
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

/** Brouillons soumis par `scripts/arm-whatsapp-concierge.ts`. Le SID n’est pas ici. La v2 passe devant. */
export function visaGrantContentDrafts() {
  const versions = ["v2", "v1"] as const;
  return versions.flatMap((version) => {
    const documentName = visaGrantTemplateForHeader("document", version);
    const imageName = visaGrantTemplateForHeader("image", version);
    const document = mediaTemplate(VISA_GRANT_SAMPLE_PDF_PATH, version);
    document.friendly_name = documentName;
    const image = mediaTemplate(VISA_GRANT_SAMPLE_IMAGE_PATH, version);
    image.friendly_name = imageName;
    return [
      {
        template: documentName,
        env: VISA_GRANT_TEMPLATE_ENV[documentName],
        friendlyName: documentName,
        create: document,
      },
      {
        template: imageName,
        env: VISA_GRANT_TEMPLATE_ENV[imageName],
        friendlyName: imageName,
        create: image,
      },
    ];
  });
}
