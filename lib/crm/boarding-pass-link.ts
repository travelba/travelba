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
 * Jeton d’une heure. WhatsApp le récupère au moment de l’envoi.
 * Le document et le nom de fichier sont dans la signature : un autre nom ne passe pas.
 */
export function signBoardingPassToken(documentId: string, filename: string, now = Date.now()) {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + BOARDING_PASS_URL_TTL_SECONDS;
  const payload = `${documentId}.${exp}.${filename}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${documentId}.${exp}.${sig}`;
}

export function verifyBoardingPassToken(token: string, filename: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [documentId, expRaw, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(documentId) || !/^\d{10}$/.test(expRaw) || !sig) return null;
  const exp = Number(expRaw);
  if (exp * 1000 <= now) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(`${documentId}.${expRaw}.${filename}`).digest("base64url");
  if (!secretEquals(sig, expected)) return null;
  return { documentId, exp };
}

/** Variable {{1}} : jeton puis nom de fichier .pdf. Null si la signature est impossible. */
export function boardingPassSignedPath(documentId: string, filename: string, now = Date.now()) {
  const token = signBoardingPassToken(documentId, filename, now);
  if (!token) return null;
  return boardingPassMediaVariable(token, filename);
}
