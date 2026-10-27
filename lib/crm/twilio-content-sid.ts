import { productionOnlySecret } from "./preview-secrets";
import { twilioApiSecret, twilioApiUser } from "./twilio-auth";

const CONTENT_URL = "https://content.twilio.com/v1/Content";
const CACHE_MS = 10 * 60 * 1000;

type CacheEntry = { approved: boolean; at: number };

const approvalCache = new Map<string, CacheEntry>();

/** Nom de la variante. L’ancien SID reste la variable d’origine. */
export function contentSidV2Name(envName: string) {
  return `${envName}_V2`;
}

export function contentSidPair(envName: string) {
  return {
    current: productionOnlySecret(process.env[envName]),
    next: productionOnlySecret(process.env[contentSidV2Name(envName)]),
  };
}

export function clearContentApprovalCache() {
  approvalCache.clear();
}

function twilioAccount() {
  return {
    sid: productionOnlySecret(process.env.TWILIO_ACCOUNT_SID),
    token: productionOnlySecret(twilioApiSecret()),
  };
}

/**
 * Meta a approuvé ce contenu WhatsApp. Un échec de lecture compte comme non approuvé :
 * l’envoi reste sur l’ancien SID.
 */
export async function whatsappContentApproved(contentSid: string, fetchImpl: typeof fetch = fetch) {
  const sid = contentSid.trim();
  if (!sid) return false;
  const cached = approvalCache.get(sid);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.approved;
  const { sid: accountSid, token } = twilioAccount();
  if (!accountSid || !token) return false;
  try {
    const response = await fetchImpl(`${CONTENT_URL}/${sid}/ApprovalRequests`, {
      headers: { Authorization: `Basic ${Buffer.from(`${twilioApiUser(accountSid)}:${token}`).toString("base64")}` },
      signal: AbortSignal.timeout(12_000),
    });
    const payload = (await response.json().catch(() => null)) as {
      whatsapp?: { status?: string };
      status?: string;
    } | null;
    const status = (payload?.whatsapp?.status || payload?.status || "").toLowerCase();
    const approved = response.ok && status === "approved";
    approvalCache.set(sid, { approved, at: Date.now() });
    return approved;
  } catch {
    return false;
  }
}

/**
 * SID à envoyer. La variante _V2 ne part qu’une fois Meta l’a approuvée.
 * Sans variante, ou tant qu’elle est en attente, l’ancien SID reste.
 */
export async function resolveContentSid(envName: string, fetchImpl: typeof fetch = fetch) {
  const { current, next } = contentSidPair(envName);
  if (!next || next === current) return current;
  if (await whatsappContentApproved(next, fetchImpl)) return next;
  return current;
}
