import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import { pickListedId, pickTravelConfig, pliantRefusal } from "./eta-il-fee";
import {
  acquirePliantToken,
  emptyPliantTokenMemory,
  isPliantTokenFailure,
  PLIANT_TOKEN_MISSING,
  pliantTokenExtra,
  pliantTokenStillValid,
  type PliantTokenStore,
} from "./pliant-auth";
import { pliantOtpToken, pliantPciWidgetUrl } from "./pliant-pci";
import { annotatePliantPayload, pliantCardFace, pliantHolderId, pliantHolderName, pliantTransactionPage } from "./pliant-tx";

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

const TOKEN_PROVIDER = "pliant";

const memory = emptyPliantTokenMemory();
let pending: Promise<string> | null = null;

export function pliantConfigured() {
  return Boolean(
    pliantClientId() &&
      pliantClientSecret() &&
      process.env.PLIANT_ORGANIZATION_ID &&
      process.env.PLIANT_CARDHOLDER_ID
  );
}

function pliantClientId() {
  return productionOnlySecret(process.env.PLIANT_CLIENT_ID);
}

function pliantClientSecret() {
  return productionOnlySecret(process.env.PLIANT_CLIENT_SECRET);
}

const PLIANT_TIMEOUT_MS = 20_000;

function endpoints() {
  return process.env.PLIANT_SANDBOX === "1" ? SANDBOX : PROD;
}

async function accessToken() {
  const now = Date.now();
  if (memory.token && pliantTokenStillValid(memory.token.expiresAt, now)) return memory.token.accessToken;
  if (memory.deniedMessage && memory.deniedUntil > now) throw new Error(memory.deniedMessage);
  if (!pending) {
    pending = acquirePliantToken({ memory, store: integrationStore(), request: requestPliantToken }).finally(() => {
      pending = null;
    });
  }
  return pending;
}

function integrationStore(): PliantTokenStore {
  return {
    read: readStoredToken,
    claim: claimTokenRefresh,
    save: writeToken,
    deny: writeDenial,
    release: releaseTokenRefresh,
  };
}

async function readStoredToken() {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("crm_integrations")
    .select("access_token, expires_at, extra")
    .eq("provider", TOKEN_PROVIDER)
    .maybeSingle();
  if (error) throw new Error(PLIANT_TOKEN_MISSING);
  const row = data as { access_token: string | null; expires_at: string | null; extra: unknown } | null;
  if (!row) return null;
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : null;
  return { accessToken: row.access_token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : null, extra: row.extra };
}

async function claimTokenRefresh(untilIso: string) {
  const admin = createServiceClient();
  const { data, error } = await admin.rpc("crm_claim_integration_refresh", {
    p_provider: TOKEN_PROVIDER,
    p_until: untilIso,
  });
  if (error) throw new Error(PLIANT_TOKEN_MISSING);
  return data === true;
}

async function writeToken(token: string, expiresAt: number, extra: unknown) {
  const admin = createServiceClient();
  const { error } = await admin.from("crm_integrations").upsert(
    {
      provider: TOKEN_PROVIDER,
      access_token: token,
      expires_at: new Date(expiresAt).toISOString(),
      extra: pliantTokenExtra(extra, null),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
  if (error) console.error("[pliant] jeton", "enregistrement");
}

async function writeDenial(untilIso: string, message: string, extra: unknown) {
  const admin = createServiceClient();
  const { error } = await admin.from("crm_integrations").upsert(
    {
      provider: TOKEN_PROVIDER,
      extra: pliantTokenExtra(extra, { until: untilIso, message }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
  if (error) console.error("[pliant] jeton", "blocage");
}

async function releaseTokenRefresh(extra: unknown) {
  const admin = createServiceClient();
  const { error } = await admin.from("crm_integrations").upsert(
    {
      provider: TOKEN_PROVIDER,
      extra: pliantTokenExtra(extra, null),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" }
  );
  if (error) console.error("[pliant] jeton", "verrou");
}

async function requestPliantToken() {
  const clientId = pliantClientId();
  const clientSecret = pliantClientSecret();
  if (!clientId || !clientSecret) return { ok: false as const, status: 401, retryAfter: null };
  const { token, audience } = endpoints();
  const res = await fetch(token, {
    method: "POST",
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    console.error("[pliant] jeton", res.status);
    return { ok: false as const, status: res.status, retryAfter: res.headers.get("retry-after") };
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return { ok: false as const, status: 502, retryAfter: null };
  return { ok: true as const, accessToken: json.access_token, expiresInSec: json.expires_in || 3600 };
}

function rethrowTokenFailure(err: unknown) {
  if (err instanceof Error && isPliantTokenFailure(err.message)) throw err;
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
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
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

/** Cadre PCI. Le numéro est dessiné par Pliant, pas par nos serveurs. */
export async function pliantPciWidget(cardId: string, frameId: string) {
  const traceId = crypto.randomUUID();
  const token = await accessToken();
  const host = process.env.PLIANT_SANDBOX === "1" ? PCI.sandbox : PCI.prod;
  const res = await fetch(`${host}/card-details/widget/${encodeURIComponent(cardId)}/otp`, {
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "Pliant-API-Version": "2.1.0",
      "Pliant-Trace-Id": traceId,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[pliant] pci", res.status);
    throw new Error("Pliant n’a pas ouvert la carte.");
  }
  const otp = pliantOtpToken(text);
  const safeFrame = frameId.replace(/[^\w-]/g, "").slice(0, 80);
  const src = otp ? pliantPciWidgetUrl({ host, traceId, cardId, token: otp, frameId: safeFrame }) : null;
  if (!src || !safeFrame) throw new Error("Pliant n’a pas ouvert la carte.");
  return { src, frameId: safeFrame };
}

export async function raisePliantLimit(cardId: string, limit: { value: number; currency: "EUR" }, count: number) {
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${cardId}`, {
    method: "PATCH",
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
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
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
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
    rethrowTokenFailure(err);
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
    rethrowTokenFailure(err);
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
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
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
