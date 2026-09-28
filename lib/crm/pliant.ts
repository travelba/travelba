import "server-only";
import { pickListedId, pickTravelConfig, pliantRefusal } from "./eta-il-fee";

const PROD = {
  api: "https://partner-api.getpliant.com/api",
  token: "https://infinnityprodinternal.eu.auth0.com/oauth/token",
  audience: "api.getpliant.com/api/integration",
};
const SANDBOX = {
  api: "https://sandbox.partner-api.getpliant.com/api",
  token: "https://infinnitystaginginternal.eu.auth0.com/oauth/token",
  audience: "api.staging.infinnitytest.com/api/integration",
};

type Token = { accessToken: string; expiresAt: number };
let cached: Token | null = null;

export function pliantConfigured() {
  return Boolean(
    process.env.PLIANT_CLIENT_ID &&
      process.env.PLIANT_CLIENT_SECRET &&
      process.env.PLIANT_ORGANIZATION_ID &&
      process.env.PLIANT_CARDHOLDER_ID
  );
}

function endpoints() {
  return process.env.PLIANT_SANDBOX === "1" ? SANDBOX : PROD;
}

async function accessToken() {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;
  const clientId = process.env.PLIANT_CLIENT_ID || "";
  const clientSecret = process.env.PLIANT_CLIENT_SECRET || "";
  const { token, audience } = endpoints();
  const res = await fetch(token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error("Pliant n’a pas délivré de jeton.");
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Pliant n’a pas délivré de jeton.");
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return json.access_token;
}

export async function issuePliantCard(cardholderId: string, body: unknown) {
  const raw = (body && typeof body === "object" ? body : {}) as {
    organizationId?: string;
    cardConfig?: string;
  };
  const resolved = await resolvePliantIssue({
    organizationId: raw.organizationId || process.env.PLIANT_ORGANIZATION_ID || "",
    cardholderId: cardholderId || process.env.PLIANT_CARDHOLDER_ID || "",
    cardConfig: raw.cardConfig || "PLIANT_VIRTUAL_TRAVEL",
  });
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${resolved.cardholderId}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Pliant-API-Version": "2.1.0",
    },
    body: JSON.stringify({ ...raw, organizationId: resolved.organizationId, cardConfig: resolved.cardConfig }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[eta-il] pliant", res.status);
    throw new Error(pliantRefusal(res.status, text));
  }
  const json = JSON.parse(text) as { cardId?: string; id?: string; status?: string };
  return { cardId: json.cardId || json.id || null, status: json.status || null };
}

async function resolvePliantIssue(preferred: { organizationId: string; cardholderId: string; cardConfig: string }) {
  const organizations = await pliantJson("/organizations?status=ACTIVE&limit=100");
  const orgIds = rows(organizations, "organizationId");
  const organizationId = organizations ? pickListedId(preferred.organizationId, orgIds) : preferred.organizationId;
  if (!organizationId) throw new Error("Pliant : l’organisation configurée est introuvable.");

  const holders = await pliantJson(
    `/cardholders?organizationId=${encodeURIComponent(organizationId)}&status=ACTIVE&limit=100`
  );
  const holderIds = rows(holders, "cardholderId");
  const cardholderId = holders ? pickListedId(preferred.cardholderId, holderIds) : preferred.cardholderId;
  if (!cardholderId) throw new Error("Pliant : le porteur configuré est introuvable.");

  const available = await pliantJson(`/cards/available-cards?organizationId=${encodeURIComponent(organizationId)}`);
  const configs = Array.isArray(available?.cardConfigs) ? available.cardConfigs : null;
  const cardConfig = configs ? pickTravelConfig(preferred.cardConfig, configs) : preferred.cardConfig;
  if (!cardConfig) throw new Error("Pliant : la configuration de carte est introuvable.");
  return { organizationId, cardholderId, cardConfig };
}

function rows(payload: { data?: unknown } | null, key: "organizationId" | "cardholderId") {
  if (!payload || !Array.isArray(payload.data)) return [];
  return payload.data
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>)[key] : ""))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function pliantJson(path: string): Promise<{ data?: unknown; cardConfigs?: unknown } | null> {
  try {
    const token = await accessToken();
    const res = await fetch(`${endpoints().api}${path}`, {
      headers: { authorization: `Bearer ${token}`, "Pliant-API-Version": "2.1.0" },
    });
    if (!res.ok) return null;
    return (await res.json()) as { data?: unknown; cardConfigs?: unknown };
  } catch {
    return null;
  }
}

const PCI = {
  prod: "https://pci-api.getpliant.com",
  sandbox: "https://pci-sandbox.partner-api.getpliant.com",
};

/** Lecture éphémère. La réponse n'est pas journalisée. */
export async function readPliantCardSecrets(cardId: string) {
  const token = await accessToken();
  const host = process.env.PLIANT_SANDBOX === "1" ? PCI.sandbox : PCI.prod;
  const res = await fetch(`${host}/card-details/${encodeURIComponent(cardId)}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "Pliant-API-Version": "2.1.0",
    },
  });
  if (!res.ok) throw new Error("Pliant n’a pas renvoyé la carte.");
  const json = (await res.json()) as unknown;
  const { cardSecretsFromPayload } = await import("./hotel-arrival");
  const secrets = cardSecretsFromPayload(json);
  if (!secrets) throw new Error("Pliant n’a pas renvoyé la carte.");
  return secrets;
}

export async function raisePliantLimit(cardId: string, limit: { value: number; currency: "EUR" }, count: number) {
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${cardId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Pliant-API-Version": "2.1.0",
    },
    body: JSON.stringify({
      limit,
      transactionLimit: limit,
      limitRenewFrequency: "TOTAL",
      maxTransactionCount: count,
    }),
  });
  if (!res.ok) throw new Error("Pliant n’a pas relevé le plafond.");
}

export async function setPliantCardLimit(
  cardId: string,
  limit: { value: number; currency: string },
  count: number
) {
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${cardId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Pliant-API-Version": "2.1.0",
    },
    body: JSON.stringify({
      limit,
      transactionLimit: limit,
      limitRenewFrequency: "TOTAL",
      maxTransactionCount: count,
    }),
  });
  if (!res.ok) throw new Error("Pliant n’a pas modifié le plafond.");
}
