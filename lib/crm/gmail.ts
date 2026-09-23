import "server-only";
import { createPrivateKey, createSign } from "crypto";
import {
  buildGmailHistorySearchParams,
  collectHistoryMessageIds,
  parseGmailMessage,
  type GmailHistoryRecord,
  type ParsedGmailMessage,
} from "@/lib/crm/gmail-parse";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const DEFAULT_LABELS = ["little-emperors", "expedia-taap"];

type ServiceAccount = { client_email: string; private_key: string };

function impersonateEmail() {
  return (process.env.GMAIL_IMPERSONATE || "").trim();
}

function serviceAccountRaw() {
  return (process.env.GOOGLE_SA_JSON || "").trim();
}

export function gmailConfigured() {
  return Boolean(serviceAccountRaw() && impersonateEmail());
}

export function gmailPubsubTopic() {
  return (process.env.GMAIL_PUBSUB_TOPIC || "").trim();
}

/** Labels Gmail suivis (filtres agence). Défaut : little-emperors, expedia-taap. */
export function gmailLabelNames(): string[] {
  const raw = (process.env.GMAIL_LABELS || "").trim();
  if (!raw) return [...DEFAULT_LABELS];
  const names = raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return names.length ? names : [...DEFAULT_LABELS];
}

function loadServiceAccount(): ServiceAccount {
  const raw = serviceAccountRaw();
  if (!raw) throw new Error("GOOGLE_SA_JSON manquant");
  let json = raw;
  if (!raw.startsWith("{")) {
    json = Buffer.from(raw, "base64").toString("utf8");
  }
  const parsed = JSON.parse(json) as {
    client_email?: string;
    private_key?: string;
  };
  const clientEmail = (parsed.client_email || "").trim();
  const privateKey = (parsed.private_key || "").replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error("GOOGLE_SA_JSON incomplet (client_email / private_key)");
  }
  return { client_email: clientEmail, private_key: privateKey };
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const sa = loadServiceAccount();
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
      sub: impersonateEmail(),
    })
  ).toString("base64url");
  const data = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  const signature = signer.sign(createPrivateKey(sa.private_key), "base64url");
  const assertion = `${data}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail auth ${res.status} ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Gmail auth : access_token manquant");
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return cachedToken.token;
}

async function gmailApi(path: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      `Gmail ${res.status} ${path.split("?")[0]} ${detail.slice(0, 200)}`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

/** Résout les labels ciblés (nom → id Gmail), insensible à la casse. */
export async function resolveLabelIds(
  names: string[]
): Promise<Map<string, string>> {
  const res = await gmailApi(`/labels`);
  const json = (await res.json()) as {
    labels?: { id?: string; name?: string }[];
  };
  const wanted = new Map(names.map((n) => [n.toLowerCase(), n]));
  const out = new Map<string, string>();
  for (const label of json.labels || []) {
    const key = String(label.name || "").toLowerCase();
    const original = wanted.get(key);
    if (original && label.id) out.set(original, label.id);
  }
  return out;
}

export type GmailWatchResult = { historyId: string; expiration: string };

/** Pose / renouvelle le watch Gmail (push Pub/Sub) sur les labels ciblés. */
export async function watchMailbox(
  topicName: string,
  labelIds: string[]
): Promise<GmailWatchResult> {
  const res = await gmailApi(`/watch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topicName,
      labelIds,
      labelFilterBehavior: "include",
    }),
  });
  const json = (await res.json()) as { historyId?: string; expiration?: string };
  return {
    historyId: String(json.historyId || ""),
    expiration: String(json.expiration || ""),
  };
}

/** Identifiant d'historique courant de la boîte (re-baseline si le curseur est trop ancien). */
export async function currentHistoryId(): Promise<string> {
  const res = await gmailApi(`/profile`);
  const json = (await res.json()) as { historyId?: string };
  return String(json.historyId || "");
}

export class GmailHistoryTooOldError extends Error {}

/**
 * IDs de messages nouveaux ou relabellisés depuis startHistoryId pour un label.
 * Inclut messageAdded (arrivée) et labelAdded (label appliqué à un mail existant).
 * Lève GmailHistoryTooOldError si le curseur est expiré (404).
 */
export async function listHistoryMessageIds(
  startHistoryId: string,
  labelId?: string
): Promise<{ messageIds: string[]; historyId: string }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latest = startHistoryId;
  do {
    const params = buildGmailHistorySearchParams(startHistoryId, {
      labelId,
      pageToken,
    });
    let res: Response;
    try {
      res = await gmailApi(`/history?${params.toString()}`);
    } catch (err) {
      if ((err as { status?: number }).status === 404) {
        throw new GmailHistoryTooOldError("history_too_old");
      }
      throw err;
    }
    const json = (await res.json()) as {
      history?: GmailHistoryRecord[];
      historyId?: string;
      nextPageToken?: string;
    };
    if (json.historyId) latest = String(json.historyId);
    for (const id of collectHistoryMessageIds(json.history, labelId)) {
      ids.add(id);
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return { messageIds: [...ids], historyId: latest };
}

export async function getMessage(id: string): Promise<ParsedGmailMessage> {
  const res = await gmailApi(`/messages/${id}?format=full`);
  return parseGmailMessage(await res.json());
}

export async function getAttachmentBytes(
  messageId: string,
  attachmentId: string
): Promise<Uint8Array> {
  const res = await gmailApi(
    `/messages/${messageId}/attachments/${attachmentId}`
  );
  const json = (await res.json()) as { data?: string };
  return new Uint8Array(Buffer.from(String(json.data || ""), "base64url"));
}
