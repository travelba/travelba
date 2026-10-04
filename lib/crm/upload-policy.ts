/** Limites communes des pièces téléversées (dossier, pièces client / agence). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const ALLOWED_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const GENERIC_MIME = new Set(["", "application/octet-stream", "binary/octet-stream"]);

export const UPLOAD_TYPE_ERROR = "Format non pris en charge : PDF, JPEG, PNG, WebP ou HEIC.";
export const UPLOAD_SIZE_ERROR = "Fichier trop lourd : 25 Mo maximum.";
export const UPLOAD_EMPTY_ERROR = "Fichier vide.";

/** PDF, JPEG, PNG, WebP ou HEIC. Un type générique (navigateur muet) laisse l’extension décider. */
export function isAllowedUploadType(mime: string | null | undefined, name: string | null | undefined) {
  const type = String(mime || "").split(";")[0].trim().toLowerCase();
  if (!GENERIC_MIME.has(type)) return ALLOWED_MIME.has(type);
  return ALLOWED_EXT.test(String(name || ""));
}

export class UploadPolicyError extends Error {
  status = 400;
}

export function uploadIssue(file: Pick<File, "size" | "type" | "name">) {
  if (!(file.size > 0)) return UPLOAD_EMPTY_ERROR;
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_SIZE_ERROR;
  if (!isAllowedUploadType(file.type, file.name)) return UPLOAD_TYPE_ERROR;
  return null;
}

/** Lève une `UploadPolicyError` (400) si la pièce dépasse 25 Mo ou n’est pas un PDF / une image acceptée. */
export function assertUpload(file: Pick<File, "size" | "type" | "name">) {
  const issue = uploadIssue(file);
  if (issue) throw new UploadPolicyError(issue);
}
