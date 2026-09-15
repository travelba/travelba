import { createServiceClient } from "@/lib/supabase/admin";

export const CRM_BUCKET = "crm-files";
export const MAX_CRM_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateCrmFileMetadata(file: File) {
  if (file.size <= 0) return "Le fichier est vide.";
  if (file.size > MAX_CRM_FILE_BYTES) {
    return "Le fichier dépasse la taille maximale de 10 Mo.";
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return "Format non accepté. Utilisez PDF, JPEG, PNG ou WebP.";
  }
  return null;
}

export function validateCrmFile(file: File, bytes: Buffer) {
  const metadataError = validateCrmFileMetadata(file);
  if (metadataError) return metadataError;
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const signatureMatches =
    (file.type === "application/pdf" && isPdf) ||
    (file.type === "image/jpeg" && isJpeg) ||
    (file.type === "image/png" && isPng) ||
    (file.type === "image/webp" && isWebp);

  return signatureMatches ? null : "Le contenu du fichier ne correspond pas à son format.";
}

export async function uploadCrmFile(
  path: string,
  bytes: Buffer,
  contentType: string
) {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(CRM_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function signedCrmUrl(path: string, expiresIn = 120) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from(CRM_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error("URL signée impossible");
  return data.signedUrl;
}

export async function deleteCrmFile(path: string) {
  const supabase = createServiceClient();
  const { error } = await supabase.storage.from(CRM_BUCKET).remove([path]);
  if (error) throw error;
}

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "fichier";
}
