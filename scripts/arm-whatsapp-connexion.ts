/**
 * Crée le modèle WhatsApp Utility « connexion_espace » et le soumet à Meta.
 * Lit TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN dans l’environnement.
 * N’écrit aucun secret. Affiche le SID à coller dans TWILIO_CONTENT_CONNEXION.
 */
import {
  CONNEXION_TEMPLATE_NAME,
  connexionContentCreateBody,
} from "../lib/crm/whatsapp";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

function requiredEnv() {
  return ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"].filter(
    (name) => !process.env[name]?.trim()
  );
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

async function findExisting() {
  let page: string | null = `${CONTENT_URL}?PageSize=50`;
  while (page) {
    const { response, payload } = await twilio(page);
    if (!response.ok) {
      throw new Error(safeMessage(payload, response.status));
    }
    const found = payload?.contents?.find(
      (row) => row.friendly_name === CONNEXION_TEMPLATE_NAME && row.sid
    );
    if (found?.sid) return found.sid;
    page = payload?.meta?.next_page_url || null;
  }
  return null;
}

async function submit(sid: string) {
  const { response, payload } = await twilio(
    `${CONTENT_URL}/${sid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      body: JSON.stringify({
        name: CONNEXION_TEMPLATE_NAME,
        category: "UTILITY",
      }),
    }
  );
  if (response.ok) return;
  const message = safeMessage(payload, response.status);
  if (/already|submitted|approved/i.test(message)) return;
  throw new Error(message);
}

function printSid(sid: string) {
  console.log(
    "Modèle soumis à Meta (Utility, français). Définissez TWILIO_CONTENT_CONNEXION sur Vercel Production, puis redéployez. Ne commitez pas cette valeur."
  );
  console.log(sid);
}

async function main() {
  const missing = requiredEnv();
  if (missing.length) {
    console.error(
      `Variables manquantes : ${missing.join(", ")}. Aucun modèle créé.`
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.TWILIO_CONTENT_CONNEXION?.trim()) {
    console.log(
      "TWILIO_CONTENT_CONNEXION est déjà défini. Aucun modèle créé."
    );
    return;
  }

  const existing = await findExisting();
  if (existing) {
    await submit(existing);
    printSid(existing);
    return;
  }

  const { response, payload } = await twilio(CONTENT_URL, {
    method: "POST",
    body: JSON.stringify(connexionContentCreateBody()),
  });
  if (!response.ok || !payload?.sid) {
    throw new Error(safeMessage(payload, response.status));
  }
  await submit(payload.sid);
  printSid(payload.sid);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : "échec";
  console.error(message.replace(/https?:\/\/\S+/g, "").slice(0, 200));
  process.exitCode = 1;
});
