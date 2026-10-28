import { createHash, createHmac } from "node:crypto";
import { productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";
import { STATEMENT_URL_TTL_SECONDS, statementMediaVariable } from "./statement-whatsapp";

function signingSecret() {
  const service = productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!service) return null;
  return createHash("sha256").update(`travelba:releve:v1:${service}`).digest();
}

/** Jeton d’une heure. WhatsApp récupère le PDF au moment de l’envoi. */
export function signStatementToken(customerId: string, now = Date.now()) {
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + STATEMENT_URL_TTL_SECONDS;
  const payload = `${customerId}.${exp}.releve`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${customerId}.${exp}.${sig}`;
}

export function verifyStatementToken(token: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [customerId, expRaw, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(customerId) || !/^\d{10}$/.test(expRaw) || !sig) return null;
  const exp = Number(expRaw);
  if (exp * 1000 <= now) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(`${customerId}.${expRaw}.releve`).digest("base64url");
  if (!secretEquals(sig, expected)) return null;
  return { customerId, exp };
}

/** Variable {{1}} : jeton puis nom de fichier .pdf. */
export function statementSignedPath(customerId: string, now = Date.now()) {
  const token = signStatementToken(customerId, now);
  if (!token) return null;
  return statementMediaVariable(token);
}
