import "server-only";

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
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${cardholderId}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Pliant-API-Version": "2.1.0",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("Pliant n’a pas créé la carte.");
  const json = JSON.parse(text) as { cardId?: string; id?: string; status?: string };
  return { cardId: json.cardId || json.id || null, status: json.status || null };
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
