import "server-only";
import { pickListedId, pickTravelConfig, pliantRefusal } from "./eta-il-fee";
import { annotatePliantPayload, pliantCardFace, pliantHolderId, pliantHolderName, pliantTransactionPage } from "./pliant-tx";
import {
  parsePliantWidgetOtp,
  pliantCardBlockMessage,
  pliantWidgetFailure,
  pliantWidgetParams,
  pliantWidgetUrl,
} from "./pliant-widget";

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

function pciHost() {
  return process.env.PLIANT_SANDBOX === "1" ? PCI.sandbox : PCI.prod;
}

/** Ouvre le widget Pliant. Le numéro reste dans l’iframe, jamais dans Travelba. */
export async function openPliantCardWidget(cardId: string) {
  const token = await accessToken();
  const status = await pliantCardStatus(cardId, token);
  const blocked = pliantCardBlockMessage(status);
  if (blocked) throw new Error(blocked);
  const traceId = crypto.randomUUID();
  const host = pciHost();
  const res = await fetch(`${host}/card-details/widget/${encodeURIComponent(cardId)}/otp`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "Pliant-API-Version": "2.1.0",
      "Pliant-Trace-Id": traceId,
    },
  });
  if (!res.ok) {
    console.error("[pliant] widget", res.status);
    throw new Error(pliantWidgetFailure(res.status));
  }
  const otp = parsePliantWidgetOtp(await res.text());
  if (!otp) throw new Error("La carte n’a pas pu être lue.");
  const frameId = traceId;
  return { url: pliantWidgetUrl(host, traceId, pliantWidgetParams({ otp, cardId, frameId })), frameId };
}

async function pliantCardStatus(cardId: string, token: string) {
  try {
    const res = await fetch(`${endpoints().api}/cards/${encodeURIComponent(cardId)}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json", "Pliant-API-Version": "2.1.0" },
    });
    if (!res.ok) return "";
    const json = (await res.json()) as { status?: unknown; data?: { status?: unknown } };
    const status = json.status ?? json.data?.status;
    return typeof status === "string" ? status : "";
  } catch {
    return "";
  }
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

const TX_PAGE = 100;
const TX_PAGES = 40;

/** Mouvements de chaque organisation active : commerçant, carte, porteur. */
export async function fetchPliantTransactions() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const organizationIds = await pliantOrganizationIds();
  if (!organizationIds.length) throw new Error("Pliant n’est pas branché.");
  const seen = new Set<string>();
  const rows: unknown[] = [];
  for (const organizationId of organizationIds) {
    const [transactions, cards, holders] = await Promise.all([
      fetchOrganizationTransactions(organizationId),
      fetchOrganizationDirectory(organizationId, "cards"),
      fetchOrganizationDirectory(organizationId, "cardholders"),
    ]);
    const cardsById = new Map<string, unknown>();
    for (const card of cards) {
      const id = pliantCardFace(card).id;
      if (id) cardsById.set(id, card);
    }
    const holdersById = new Map<string, unknown>();
    for (const holder of holders) {
      const id = pliantHolderId(holder);
      if (id) holdersById.set(id, holder);
    }
    await hydrateMissingFaces(cardsById, holdersById, transactions);
    for (const payload of transactions) {
      if (!payload || typeof payload !== "object") continue;
      const row = payload as Record<string, unknown>;
      const id = typeof row.transactionId === "string" ? row.transactionId : typeof row.id === "string" ? row.id : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const cardId = typeof row.cardId === "string" ? row.cardId : "";
      const holderId = typeof row.cardholderId === "string" ? row.cardholderId : "";
      rows.push(annotatePliantPayload(payload, cardsById.get(cardId), holdersById.get(holderId)));
    }
  }
  return rows;
}

async function pliantOrganizationIds() {
  const configured = process.env.PLIANT_ORGANIZATION_ID || "";
  try {
    const listed = await pliantGet("/organizations?status=ACTIVE&limit=100");
    const ids = organizationIds(listed);
    return [...new Set([configured, ...ids].filter(Boolean))];
  } catch (err) {
    console.error("[pliant] organizations", err instanceof Error ? err.message : "échec");
    return configured ? [configured] : [];
  }
}

function organizationIds(payload: unknown) {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) return [];
  return (payload as { data: unknown[] }).data
    .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>).organizationId : ""))
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function fetchOrganizationTransactions(organizationId: string) {
  try {
    const detailed = await fetchPages((page) =>
      pliantPost("/transactions/details", {
        organizationIds: [organizationId],
        pagination: {
          page,
          limit: TX_PAGE,
          sortBy: { field: "createdAt", direction: "DESC" },
        },
      })
    );
    if (detailed.length) return detailed;
  } catch (err) {
    console.error("[pliant] details", err instanceof Error ? err.message : "échec");
  }
  return fetchPages((page) => {
    const query = new URLSearchParams({
      organizationId,
      limit: String(TX_PAGE),
      page: String(page),
      sortBy: "createdAt",
      sortDirection: "DESC",
    });
    return pliantGet(`/transactions?${query.toString()}`);
  });
}

async function fetchOrganizationDirectory(organizationId: string, kind: "cards" | "cardholders") {
  try {
    return await fetchPages((page) =>
      pliantGet(`/${kind}?organizationId=${encodeURIComponent(organizationId)}&limit=${TX_PAGE}&page=${page}`)
    );
  } catch (err) {
    console.error(`[pliant] ${kind}`, err instanceof Error ? err.message : "échec");
    return [];
  }
}

async function hydrateMissingFaces(
  cardsById: Map<string, unknown>,
  holdersById: Map<string, unknown>,
  transactions: unknown[]
) {
  const cardIds = new Set<string>();
  const holderIds = new Set<string>();
  for (const payload of transactions) {
    if (!payload || typeof payload !== "object") continue;
    const row = payload as Record<string, unknown>;
    const cardId = typeof row.cardId === "string" ? row.cardId : "";
    const holderId = typeof row.cardholderId === "string" ? row.cardholderId : "";
    const face = pliantCardFace(cardsById.get(cardId));
    if (cardId && !face.label && !face.last4) cardIds.add(cardId);
    if (holderId && !pliantHolderName(holdersById.get(holderId))) holderIds.add(holderId);
  }
  await pool([...cardIds], 8, async (cardId) => {
    try {
      cardsById.set(cardId, unwrapRecord(await pliantGet(`/cards/${encodeURIComponent(cardId)}`)) || { cardId });
    } catch (err) {
      console.error("[pliant] card", err instanceof Error ? err.message : "échec");
    }
  });
  await pool([...holderIds], 8, async (holderId) => {
    try {
      holdersById.set(holderId, unwrapRecord(await pliantGet(`/cardholders/${encodeURIComponent(holderId)}`)) || { cardholderId: holderId });
    } catch (err) {
      console.error("[pliant] cardholder", err instanceof Error ? err.message : "échec");
    }
  });
}

function unwrapRecord(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return payload;
}

async function pool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(run));
  }
}

async function fetchPages(load: (page: number) => Promise<unknown>) {
  const rows: unknown[] = [];
  for (let page = 0; page < TX_PAGES; page += 1) {
    const batch = pliantTransactionPage(await load(page), TX_PAGE);
    rows.push(...batch.rows);
    if (batch.done) break;
  }
  return rows;
}

async function pliantGet(path: string) {
  return pliantSend(path);
}

async function pliantPost(path: string, body: unknown) {
  return pliantSend(path, body);
}

async function pliantSend(path: string, body?: unknown) {
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "Pliant-API-Version": "2.1.0",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    console.error("[pliant] transactions", res.status);
    throw new Error("Pliant n’a pas renvoyé les transactions.");
  }
  return (await res.json()) as unknown;
}
