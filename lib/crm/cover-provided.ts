import { toCoverWebp } from "./cover-file";
import { downloadCoverImage, isSafeCoverImageUrl } from "./cover-search";
import { uploadCrmFile } from "./files";

/** Image fournie pour la couverture d’un dossier. */
export const PROVIDED_COVER_MAX_BYTES = 5 * 1024 * 1024;
export const DEFAULT_COVER_CREDIT = "Image générée par IA";

const CREDIT_MAX = 120;

export type CoverImageMime = "image/jpeg" | "image/png" | "image/webp";

export type ProvidedCoverImage =
  | { source: "url"; url: string }
  | { source: "file"; bytes: Buffer; mime: CoverImageMime };

export function sniffCoverImage(bytes: Buffer): CoverImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function bookingCoverStoragePath(bookingId: string) {
  return `bookings/${bookingId}/cover.webp`;
}

export function coverCreditText(value: unknown): { credit: string } | { error: string } {
  if (value == null || value === "") return { credit: DEFAULT_COVER_CREDIT };
  if (typeof value !== "string") return { error: "Crédit invalide." };
  const credit = value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!credit) return { credit: DEFAULT_COVER_CREDIT };
  if (credit.length > CREDIT_MAX) return { error: "Crédit trop long." };
  return { credit };
}

const DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i;

function declaredMime(kind: string): CoverImageMime | null {
  const value = kind.toLowerCase();
  if (value === "jpeg" || value === "jpg") return "image/jpeg";
  if (value === "png") return "image/png";
  if (value === "webp") return "image/webp";
  return null;
}

function decodedSize(raw: string) {
  const stripped = raw.replace(/\s+/g, "");
  return Math.floor((stripped.length * 3) / 4);
}

function decodeBase64(raw: string) {
  const stripped = raw.replace(/\s+/g, "");
  if (!stripped || stripped.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(stripped)) return null;
  const bytes = Buffer.from(stripped, "base64");
  return bytes.length ? bytes : null;
}

function checkedFile(bytes: Buffer, declared?: CoverImageMime | null): ProvidedCoverImage | { error: string } {
  if (bytes.length > PROVIDED_COVER_MAX_BYTES) return { error: "Photo trop lourde (5 Mo maximum)." };
  const mime = sniffCoverImage(bytes);
  if (!mime || (declared && mime !== declared)) return { error: "Formats acceptés : JPEG, PNG ou WebP." };
  return { source: "file", bytes, mime };
}

/**
 * `catalogue` et les lieux restent le catalogue.
 * Une URL https ou une image en base64 devient un fichier à déposer.
 */
export function classifyProvidedCover(
  value: string
): { kind: "catalog" } | ({ kind: "image" } & ProvidedCoverImage) | { error: string } {
  const raw = value.trim();
  if (!raw) return { error: "Couverture invalide." };
  if (/^http:\/\//i.test(raw)) return { error: "L’image doit être en HTTPS." };
  if (/^https:\/\//i.test(raw)) {
    if (raw.length > 2000 || !isSafeCoverImageUrl(raw)) return { error: "Adresse d’image refusée." };
    return { kind: "image", source: "url", url: raw };
  }
  if (/^data:/i.test(raw)) {
    const match = raw.match(DATA_URL);
    if (!match) return { error: "Formats acceptés : JPEG, PNG ou WebP." };
    const declared = declaredMime(match[1]);
    if (!declared) return { error: "Formats acceptés : JPEG, PNG ou WebP." };
    if (decodedSize(match[2]) > PROVIDED_COVER_MAX_BYTES) return { error: "Photo trop lourde (5 Mo maximum)." };
    const bytes = decodeBase64(match[2]);
    if (!bytes) return { error: "Image illisible." };
    const file = checkedFile(bytes, declared);
    if ("error" in file) return file;
    return { kind: "image", ...file };
  }
  const compact = raw.replace(/\s+/g, "");
  const looksBase64 =
    compact.length >= 64 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
  if (!looksBase64) return { kind: "catalog" };
  if (decodedSize(compact) > PROVIDED_COVER_MAX_BYTES) return { error: "Photo trop lourde (5 Mo maximum)." };
  const bytes = decodeBase64(compact);
  if (!bytes) return { kind: "catalog" };
  const file = checkedFile(bytes);
  if ("error" in file) return file;
  return { kind: "image", ...file };
}

export function providedCoverFailure(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (message === "size") return "Photo trop lourde (5 Mo maximum).";
  if (message === "type") return "Formats acceptés : JPEG, PNG ou WebP.";
  if (message === "unreadable") return "Photo illisible.";
  if (message === "http") return "Photo inaccessible.";
  return "Envoi de la photo impossible.";
}

/** Dépose l’image au chemin des couvertures, en WebP, comme l’envoi de l’agence. */
export async function materializeProvidedCover(input: {
  bookingId: string;
  image: ProvidedCoverImage;
  download?: (url: string) => Promise<Buffer>;
  convert?: (bytes: Buffer) => Promise<Buffer>;
  upload?: (path: string, bytes: Buffer, contentType: string) => Promise<unknown>;
}) {
  let bytes: Buffer;
  let declared: CoverImageMime | null = null;
  if (input.image.source === "url") {
    try {
      bytes = input.download ? await input.download(input.image.url) : await downloadCoverImage(input.image.url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      throw new Error(message === "size" || message === "type" ? message : "http");
    }
  } else {
    bytes = input.image.bytes;
    declared = input.image.mime;
  }
  if (bytes.length > PROVIDED_COVER_MAX_BYTES) throw new Error("size");
  const mime = sniffCoverImage(bytes);
  if (!mime || (declared && mime !== declared)) throw new Error("type");
  let webp: Buffer;
  try {
    webp = input.convert ? await input.convert(bytes) : await toCoverWebp(bytes);
  } catch {
    throw new Error("unreadable");
  }
  if (!webp.length || sniffCoverImage(webp) !== "image/webp") throw new Error("unreadable");
  const path = bookingCoverStoragePath(input.bookingId);
  const upload =
    input.upload ||
    ((file: string, body: Buffer, contentType: string) => uploadCrmFile(file, body, contentType, { upsert: true }));
  try {
    await upload(path, webp, "image/webp");
  } catch {
    throw new Error("upload");
  }
  return { path };
}
