import { createHash, createHmac } from "node:crypto";
import { productionOnlySecret } from "./preview-secrets";
import { secretEquals } from "./secret-equals";

export const INVOICE_URL_TTL_SECONDS = 60 * 60;
export const INVOICE_MEDIA_FILE = "facture.pdf";

function signingSecret() {
  const service = productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!service) return null;
  return createHash("sha256").update(`travelba:facture:v1:${service}`).digest();
}

export function invoiceObjectPath(customerId: string, bookingId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(customerId) || !/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  return `customers/${customerId}/factures/${bookingId}.pdf`;
}

/** Jeton d’une heure. WhatsApp récupère le PDF au moment de l’envoi. */
export function signInvoiceToken(customerId: string, bookingId: string, now = Date.now()) {
  if (!invoiceObjectPath(customerId, bookingId)) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + INVOICE_URL_TTL_SECONDS;
  const payload = `${customerId}.${bookingId}.${exp}.facture`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${customerId}.${bookingId}.${exp}.${sig}`;
}

export function verifyInvoiceToken(token: string, now = Date.now()) {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [customerId, bookingId, expRaw, sig] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(customerId) || !/^[0-9a-f-]{36}$/i.test(bookingId)) return null;
  if (!/^\d{10}$/.test(expRaw) || !sig) return null;
  const exp = Number(expRaw);
  if (exp * 1000 <= now) return null;
  const secret = signingSecret();
  if (!secret) return null;
  const expected = createHmac("sha256", secret).update(`${customerId}.${bookingId}.${expRaw}.facture`).digest("base64url");
  if (!secretEquals(sig, expected)) return null;
  return { customerId, bookingId, exp };
}

export function invoiceMediaPath(customerId: string, bookingId: string, now = Date.now()) {
  const token = signInvoiceToken(customerId, bookingId, now);
  if (!token) return null;
  return `${token}/${INVOICE_MEDIA_FILE}`;
}
