/** Limites communes des pièces téléversées (dossier, pièces client / agence). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** `identity` : pièces d’identité (client / agence). `dossier` : pièces jointes d’un dossier (confirmations, e-mails, tableaux). */
export type UploadPolicy = "identity" | "dossier";

const IDENTITY_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const IDENTITY_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;

const DOSSIER_MIME = new Set([
  ...IDENTITY_MIME,
  "message/rfc822",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/calendar",
]);
const DOSSIER_EXT = /\.(pdf|jpe?g|png|webp|heic|heif|eml|docx|xlsx|txt|ics)$/i;

/** Type générique (navigateur muet) : l’extension décide, dans la liste de la politique seulement. */
const GENERIC_MIME = new Set(["", "application/octet-stream", "binary/octet-stream"]);

const RULES: Record<UploadPolicy, { mime: Set<string>; ext: RegExp }> = {
  identity: { mime: IDENTITY_MIME, ext: IDENTITY_EXT },
  dossier: { mime: DOSSIER_MIME, ext: DOSSIER_EXT },
};

export const UPLOAD_TYPE_ERRORS: Record<UploadPolicy, string> = {
  identity: "Format non pris en charge : PDF, JPEG, PNG, WebP ou HEIC.",
  dossier:
    "Format non pris en charge : PDF, image (JPEG, PNG, WebP, HEIC), e-mail (.eml), Word (.docx), Excel (.xlsx), texte (.txt) ou calendrier (.ics).",
};
export const UPLOAD_TYPE_ERROR = UPLOAD_TYPE_ERRORS.identity;
export const UPLOAD_SIZE_ERROR = "Fichier trop lourd : 25 Mo maximum.";
export const UPLOAD_EMPTY_ERROR = "Fichier vide.";

export function isAllowedUploadType(
  mime: string | null | undefined,
  name: string | null | undefined,
  policy: UploadPolicy = "identity"
) {
  const rules = RULES[policy];
  const type = String(mime || "").split(";")[0].trim().toLowerCase();
  if (!GENERIC_MIME.has(type)) return rules.mime.has(type);
  return rules.ext.test(String(name || ""));
}

export class UploadPolicyError extends Error {
  status = 400;
}

export function uploadIssue(file: Pick<File, "size" | "type" | "name">, policy: UploadPolicy = "identity") {
  if (!(file.size > 0)) return UPLOAD_EMPTY_ERROR;
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_SIZE_ERROR;
  if (!isAllowedUploadType(file.type, file.name, policy)) return UPLOAD_TYPE_ERRORS[policy];
  return null;
}

/** Lève une `UploadPolicyError` (400) si la pièce dépasse 25 Mo ou n’est pas d’un type accepté par la politique. */
export function assertUpload(file: Pick<File, "size" | "type" | "name">, policy: UploadPolicy = "identity") {
  const issue = uploadIssue(file, policy);
  if (issue) throw new UploadPolicyError(issue);
}
