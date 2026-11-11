import { createHash, createHmac } from "node:crypto";
import { productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";
import { BOARDING_PASS_URL_TTL_SECONDS, boardingPassMediaVariable } from "./boarding-pass-whatsapp";

function signingSecret() {
  const service = productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!service) return null;
  return createHash("sha256").update(`travelba:carte-embarquement:v1:${service}`).digest();
}

/**
 * Pages 1-based, croissantes, sans doublon. Null : le PDF entier (jeton ancien).
 * « 2,4 » est le segment signé. Un autre ordre ou une page hors bornes ne passe pas.
 */
export function boardingPassPageSpec(pages: number[] | null | undefined) {
  if (!pages) return null;
  if (!pages.length || pages.length > 12) return null;
  const next = pages.map((page) => Math.trunc(page));
  if (next.some((page) => page < 1 || page > 40)) return null;
  const unique = [...new Set(next)];
  if (unique.length !== next.length) return null;
  unique.sort((left, right) => left - right);
  return unique.join(",");
}

export function parseBoardingPassPages(spec: string | null | undefined) {
  if (!spec) return null;
  if (!/^[1-9]\d?(?:,[1-9]\d?)*$/.test(spec)) return null;
  const pages = spec.split(",").map(Number);
  if (pages.some((page) => page > 40)) return null;
  for (let index = 1; index < pages.length; index += 1) {
    if (pages[index] <= pages[index - 1]) return null;
  }
  return pages;
}

/**
 * Jeton d’une heure. WhatsApp le récupère au moment de l’envoi.
 * Le document, les pages et le nom de fichier sont dans la signature : un autre nom ou une autre page ne passe pas.
 * Sans pages, le jeton reste à trois segments et sert le PDF entier (liens déjà partis).
 */
export function signBoardingPassToken(
  documentId: string,
  filename: string,
  now = Date.now(),
  pages?: number[] | null
) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const spec = pages && pages.length ? boardingPassPageSpec(pages) : null;
  if (pages && pages.length && !spec) return null;
  const exp = Math.floor(now / 1000) + BOARDING_PASS_URL_TTL_SECONDS;
  const payload = spec
    ? `${documentId}.${exp}.${spec}.${filename}`
    : `${documentId}.${exp}.${filename}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return spec ? `${documentId}.${exp}.${spec}.${sig}` : `${documentId}.${exp}.${sig}`;
}

export function verifyBoardingPassToken(token: string, filename: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const documentId = parts[0] || "";
  const expRaw = parts[1] || "";
  const spec = parts.length === 4 ? parts[2] || "" : null;
  const sig = parts[parts.length - 1] || "";
  if (!/^[0-9a-f-]{36}$/i.test(documentId) || !/^\d{10}$/.test(expRaw) || !sig) return null;
  const pages = spec ? parseBoardingPassPages(spec) : null;
  if (spec && !pages) return null;
  const exp = Number(expRaw);
  if (exp * 1000 <= now) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const payload = spec
    ? `${documentId}.${expRaw}.${spec}.${filename}`
    : `${documentId}.${expRaw}.${filename}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!secretEquals(sig, expected)) return null;
  return { documentId, exp, pages };
}

const WALLET_FILE = "passe.pkpass";

/** Jeton d’une heure pour le .pkpass, sans le modifier. */
export function walletPassSignedPath(documentId: string, now = Date.now()) {
  const token = signBoardingPassToken(documentId, WALLET_FILE, now);
  if (!token) return null;
  return `${token}/${encodeURIComponent(WALLET_FILE)}`;
}

/** Variable {{1}} : jeton puis nom de fichier .pdf. Null si la signature est impossible. */
export function boardingPassSignedPath(
  documentId: string,
  filename: string,
  now = Date.now(),
  pages?: number[] | null
) {
  const token = signBoardingPassToken(documentId, filename, now, pages);
  if (!token) return null;
  return boardingPassMediaVariable(token, filename);
}
