/**
 * Soumet les modèles Utility du Concierge à Meta.
 * Lit TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN.
 * N’écrit aucun secret. Affiche chaque SID à coller dans l’env indiqué.
 * Si la variable est déjà définie, ce modèle n’est pas recréé.
 */
import { conciergeContentDrafts } from "../lib/crm/concierge-notices";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

function requiredEnv() {
  return ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"].filter((name) => !process.env[name]?.trim());
}

function authHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const token = process.env.TWILIO_AUTH_TOKEN!.trim();
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

function safeMessage(payload: { message?: string } | null, status: number) {
  return (payload?.message || `HTTP ${status}`)
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\+?\d{8,}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

async function twilio(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    sid?: string;
    message?: string;
    contents?: { sid?: string; friendly_name?: string }[];
    meta?: { next_page_url?: string | null };
  } | null;
  return { response, payload };
}

async function findExisting(name: string) {
  let page: string | null = `${CONTENT_URL}?PageSize=50`;
  while (page) {
    const { response, payload } = await twilio(page);
    if (!response.ok) throw new Error(safeMessage(payload, response.status));
    const found = payload?.contents?.find((row) => row.friendly_name === name && row.sid);
    if (found?.sid) return found.sid;
    page = payload?.meta?.next_page_url || null;
  }
  return null;
}

async function submit(sid: string, name: string) {
  const { response, payload } = await twilio(`${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`, {
    method: "POST",
    body: JSON.stringify({ name, category: "UTILITY" }),
  });
  if (response.ok) return;
  const message = safeMessage(payload, response.status);
  if (/already|submitted|approved/i.test(message)) return;
  throw new Error(message);
}

async function main() {
  const missing = requiredEnv();
  if (missing.length) {
    console.error(`Variables manquantes : ${missing.join(", ")}. Aucun modèle créé.`);
    process.exitCode = 1;
    return;
  }

  for (const draft of conciergeContentDrafts()) {
    if (process.env[draft.env]?.trim()) {
      console.log(`${draft.env} est déjà défini. ${draft.friendlyName} n’est pas recréé.`);
      continue;
    }
    const existing = await findExisting(draft.friendlyName);
    const sid = existing || (await create(draft.create));
    await submit(sid, draft.friendlyName);
    console.log(
      `${draft.friendlyName} soumis à Meta (Utility, français). Définissez ${draft.env} sur Vercel Production, puis redéployez. Ne commitez pas cette valeur.`
    );
    console.log(sid);
  }
}

async function create(body: unknown) {
  const { response, payload } = await twilio(CONTENT_URL, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok || !payload?.sid) throw new Error(safeMessage(payload, response.status));
  return payload.sid;
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : "échec";
  console.error(message.replace(/https?:\/\/\S+/g, "").slice(0, 200));
  process.exitCode = 1;
});
