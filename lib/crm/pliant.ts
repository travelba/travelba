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
import {
  emptyPliantCardControls,
  PLIANT_SINGLE_USE,
  pliantConfigIsSingleUse,
  pliantControlsAreOpen,
  pliantIssuePayload,
} from "./pliant-controls";
import { pliantRowsWithinSince } from "./sync-delta";
import {
  annotatePliantPayload,
  maskPliantPath,
  pliantAvailableLimit,
  pliantCardFace,
  pliantHolderId,
  pliantHolderName,
  pliantTransactionPage,
  scrubPliantLog,
} from "./pliant-tx";

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

function moneyCode(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const currency = (value as { currency?: unknown }).currency;
  if (typeof currency !== "string" || !currency.trim()) return null;
  return currency.trim().toUpperCase();
}

export async function issuePliantCard(cardholderId: string, body: unknown) {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown> & {
    organizationId?: string;
    cardConfig?: string;
  };
  const codes = [moneyCode(raw.limit), moneyCode(raw.transactionLimit)].filter((code): code is string => Boolean(code));
  if (codes.some((code) => code !== "EUR")) {
    console.error("[pliant] emission", "devise");
    throw new Error("Pliant n'accepte que l'euro.");
  }
  if (typeof raw.validFrom === "string" && typeof raw.validTo === "string" && raw.validTo <= raw.validFrom) {
    console.error("[pliant] emission", "validité");
    throw new Error("Pliant : la fin de validité doit suivre le début.");
  }
  const resolved = await resolvePliantIssue({
    organizationId: raw.organizationId || process.env.PLIANT_ORGANIZATION_ID || "",
    cardholderId: cardholderId || process.env.PLIANT_CARDHOLDER_ID || "",
    cardConfig: raw.cardConfig || PLIANT_SINGLE_USE,
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
    body: JSON.stringify(pliantIssuePayload(raw, resolved)),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("[pliant] emission", "POST", maskPliantPath(`/cards/${resolved.cardholderId}`), res.status, scrubPliantLog(text));
    throw new Error(pliantRefusal(res.status, text));
  }
  const json = JSON.parse(text) as { cardId?: string; id?: string; status?: string };
  const cardId = json.cardId || json.id || null;
  if (cardId) await clearPliantCardControls(cardId, token);
  return { cardId, status: json.status || null };
}

/** Retire commerçants, catégories, dates, lieux, pays, devises et modes d’acceptation. */
async function clearPliantCardControls(cardId: string, token: string) {
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "Pliant-API-Version": "2.1.0",
  };
  const url = `${endpoints().api}/cards/${encodeURIComponent(cardId)}/card-controls`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    const res = await fetch(url, {
      method: "PUT",
      signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
      headers,
      body: JSON.stringify(emptyPliantCardControls()),
    });
    if ((res.ok || res.status === 202) && (await pliantCardControlsAreOpen(url, headers))) return;
    console.error("[pliant] contrôles", res.status);
  }
  throw new Error("Pliant n’a pas retiré les restrictions de la carte.");
}

async function pliantCardControlsAreOpen(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS) });
  if (!res.ok) return false;
  return pliantControlsAreOpen(await res.json().catch(() => null));
}

async function resolvePliantIssue(preferred: { organizationId: string; cardholderId: string; cardConfig: string }) {
  const organizations = await pliantJson("/organizations?status=ACTIVE&limit=100");
  const orgIds = rows(organizations, "organizationId");
  const organizationId = organizations ? pickListedId(preferred.organizationId, orgIds) : preferred.organizationId;
  if (!organizationId) throw new Error("Pliant : l’organisation configurée est introuvable.");

  warnPliantId("organizationId", organizationId);
  const holders = await pliantJson(cardholdersListPath(organizationId, { status: "ACTIVE", limit: 100, page: 0 }));
  const holderIds = rows(holders, "cardholderId");
  const cardholderId = holders ? pickListedId(preferred.cardholderId, holderIds) : preferred.cardholderId;
  if (!cardholderId) throw new Error("Pliant : le porteur configuré est introuvable.");

  const available = await pliantJson(`/cards/available-cards?organizationId=${encodeURIComponent(organizationId)}`);
  const configs = Array.isArray(available?.cardConfigs) ? available.cardConfigs : null;
  const cardConfig = configs ? pickTravelConfig(preferred.cardConfig, configs) : preferred.cardConfig;
  if (!cardConfig) {
    throw new Error(
      pliantConfigIsSingleUse(preferred.cardConfig)
        ? "Pliant : la carte à usage unique n’est pas disponible sur ce compte."
        : "Pliant : la configuration de carte est introuvable."
    );
  }
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
    return (await pliantSend(path)) as { data?: unknown; cardConfigs?: unknown };
  } catch (err) {
    rethrowTokenFailure(err);
    return null;
  }
}

const PLIANT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function warnPliantId(kind: "organizationId" | "cardholderId", value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    console.error("[pliant]", kind, "absent");
    return;
  }
  if (!PLIANT_UUID.test(trimmed)) console.error("[pliant]", kind, "pas un uuid");
}

/** Liste 2.1.0 : organizationId obligatoire, page depuis 0, status ACTIVE autorisé. */
function cardholdersListPath(organizationId: string, options?: { status?: string; limit?: number; page?: number }) {
  const params = new URLSearchParams();
  params.set("organizationId", organizationId);
  if (options?.status) params.set("status", options.status);
  params.set("limit", String(options?.limit ?? 100));
  params.set("page", String(options?.page ?? 0));
  return `/cardholders?${params.toString()}`;
}

/** Détail 2.1.0 : organizationId est un paramètre de requête obligatoire. Sans lui, Pliant répond 400. */
function cardholderDetailsPath(cardholderId: string) {
  const organizationId = (process.env.PLIANT_ORGANIZATION_ID || "").trim();
  warnPliantId("organizationId", organizationId);
  warnPliantId("cardholderId", cardholderId);
  const params = new URLSearchParams();
  if (organizationId) params.set("organizationId", organizationId);
  const query = params.toString();
  return `/cardholders/${encodeURIComponent(cardholderId)}${query ? `?${query}` : ""}`;
}

const PCI = {
  prod: "https://pci-api.getpliant.com",
  sandbox: "https://pci-sandbox.partner-api.getpliant.com",
};

/**
 * PCI 2.1.0 : GET /card-details/{cardId} sur l’hôte PCI, sans organizationId.
 * Ce paramètre est obligatoire sur le détail porteur, pas sur cette lecture.
 * Une carte vient d’être émise : 404, 409, 5xx ou un corps incomplet se relisent.
 */
const SECRETS_BACKOFF_MS = [1_000, 2_000, 4_000];

export class PliantSecretsError extends Error {
  readonly status: number;
  readonly incomplete: boolean;

  constructor(status: number, incomplete = false) {
    super("Pliant n’a pas renvoyé la carte.");
    this.name = "PliantSecretsError";
    this.status = status;
    this.incomplete = incomplete;
  }
}

export function pliantSecretsRetryable(err: unknown) {
  if (!(err instanceof PliantSecretsError)) return false;
  if (err.incomplete) return true;
  return err.status === 0 || err.status === 404 || err.status === 409 || err.status >= 500;
}

/** Motif interne. Aucun numéro, aucun cryptogramme. */
export function cardReadStopReason(err: unknown) {
  if (err instanceof PliantSecretsError) {
    if (err.incomplete) return "Carte: réponse incomplète";
    if (!err.status) return "Carte: lecture interrompue";
    return `Carte: lecture refusée (${err.status})`;
  }
  const message = err instanceof Error ? err.message : "";
  const clean = scrubPliantLog(message, 160);
  if (!clean) return "Carte: lecture impossible";
  return clean.startsWith("Carte:") ? clean : `Carte: ${clean}`;
}

function secretsPath(cardId: string) {
  return maskPliantPath(`/card-details/${cardId}`);
}

/** Lecture éphémère. Le journal ne garde que le statut et le chemin masqué. */
export async function readPliantCardSecrets(cardId: string) {
  const token = await accessToken();
  const host = process.env.PLIANT_SANDBOX === "1" ? PCI.sandbox : PCI.prod;
  const safePath = secretsPath(cardId);
  let res: Response;
  try {
    res = await fetch(`${host}/card-details/${encodeURIComponent(cardId)}`, {
      signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "Pliant-API-Version": "2.1.0",
      },
    });
  } catch {
    console.error("[pliant]", "secrets", 0, safePath);
    throw new PliantSecretsError(0, false);
  }
  if (!res.ok) {
    await res.text().catch(() => "");
    console.error("[pliant]", "secrets", res.status, safePath);
    throw new PliantSecretsError(res.status, false);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const { cardSecretsFromPayload } = await import("./hotel-arrival");
  const secrets = cardSecretsFromPayload(json);
  if (!secrets) {
    console.error("[pliant]", "secrets", res.status, safePath, "incomplet");
    throw new PliantSecretsError(res.status, true);
  }
  return secrets;
}

/** Relit la carte juste après l’émission. Quatre essais, puis 1 s, 2 s et 4 s. */
export async function readIssuedPliantCardSecrets(
  cardId: string,
  options?: { sleep?: (ms: number) => Promise<void>; read?: (cardId: string) => Promise<Awaited<ReturnType<typeof readPliantCardSecrets>>> }
) {
  const sleep = options?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const read = options?.read ?? readPliantCardSecrets;
  let last: unknown;
  for (let attempt = 0; attempt <= SECRETS_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(SECRETS_BACKOFF_MS[attempt - 1]);
    try {
      return await read(cardId);
    } catch (err) {
      last = err;
      if (attempt === SECRETS_BACKOFF_MS.length || !pliantSecretsRetryable(err)) throw err;
    }
  }
  throw last;
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

/** Disponible du compte Pliant (organisation), pas le plafond d’une carte. */
export async function fetchPliantAccountBalance() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const organizationId = process.env.PLIANT_ORGANIZATION_ID || "";
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/organizations/${encodeURIComponent(organizationId)}`, {
    headers: { authorization: `Bearer ${token}`, "Pliant-API-Version": "2.1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error("Pliant n’a pas renvoyé le solde du compte.");
  const money = pliantAvailableLimit(await res.json());
  return { availableCents: money?.cents ?? null, currency: money?.currency || "EUR" };
}

export async function loadPliantAccountBalance() {
  if (!pliantConfigured()) return null;
  try {
    return await fetchPliantAccountBalance();
  } catch (err) {
    console.error("[pliant] solde", err instanceof Error ? err.message : "échec");
    return { availableCents: null as number | null, currency: "EUR" };
  }
}

export async function lockPliantCard(cardId: string) {
  const ok = await pliantCardAction(cardId, "lock");
  if (!ok) throw new Error("Pliant n’a pas bloqué la carte.");
}

export async function unlockPliantCard(cardId: string) {
  const ok = await pliantCardAction(cardId, "unlock");
  if (!ok) throw new Error("Pliant n’a pas débloqué la carte.");
}

/** Suppression définitive. Pliant refuse ensuite tout paiement. */
export async function terminatePliantCard(cardId: string) {
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${encodeURIComponent(cardId)}/terminate`, {
    method: "POST",
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Pliant-API-Version": "2.1.0",
    },
    body: JSON.stringify({ reason: "OTHER" }),
  });
  if (res.ok || res.status === 404) return;
  console.error("[pliant] carte", "terminate", res.status);
  throw new Error("Pliant n’a pas supprimé la carte.");
}

async function pliantCardAction(cardId: string, action: "lock" | "unlock") {
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}/cards/${encodeURIComponent(cardId)}/${action}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Pliant-API-Version": "2.1.0" },
  });
  if (!res.ok) console.error("[pliant] carte", action, res.status);
  return res.ok;
}

export type PliantCardholderRead =
  | { ok: true; firstName: string; lastName: string }
  | { ok: false; reason: string };

export class PliantRequestError extends Error {
  readonly status: number;
  readonly body: string;
  readonly method: string;
  readonly path: string;

  constructor(input: { method: string; path: string; status: number; body: string }) {
    super(`Pliant ${input.method} ${input.status}`);
    this.name = "PliantRequestError";
    this.status = input.status;
    this.body = input.body;
    this.method = input.method;
    this.path = input.path;
  }
}

function holderReadReason(err: unknown) {
  if (err instanceof PliantRequestError) {
    return scrubPliantLog(err.body ? `Pliant ${err.status} ${err.body}` : `Pliant ${err.status}`, 180);
  }
  if (err instanceof Error && err.message) return scrubPliantLog(err.message, 180);
  return "Porteur illisible";
}

/** Nom du porteur configuré. Jamais le client, jamais l’hôtel. Un échec de lecture est renvoyé, pas avalé. */
export async function readPliantCardholderName(cardholderId: string): Promise<PliantCardholderRead> {
  const id = cardholderId.trim();
  if (!id) {
    const reason = "Porteur non configuré";
    console.error("[pliant] porteur", reason);
    return { ok: false, reason };
  }
  try {
    const row = unwrapRecord(await pliantGet(cardholderDetailsPath(id))) as {
      firstName?: unknown;
      lastName?: unknown;
    } | null;
    const firstName = typeof row?.firstName === "string" ? row.firstName.trim() : "";
    const lastName = typeof row?.lastName === "string" ? row.lastName.trim() : "";
    if (!firstName || !lastName) {
      const reason = "Nom du porteur incomplet";
      console.error("[pliant] porteur", reason);
      return { ok: false, reason };
    }
    return { ok: true, firstName, lastName };
  } catch (err) {
    const reason = holderReadReason(err);
    console.error("[pliant] porteur", reason);
    return { ok: false, reason };
  }
}

/** Organisation et porteur configurés lisibles. N’écrit pas d’alerte. */
export async function readPliantHealth(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const organizationId = (process.env.PLIANT_ORGANIZATION_ID || "").trim();
  const cardholderId = (process.env.PLIANT_CARDHOLDER_ID || "").trim();
  if (!organizationId || !cardholderId) return { ok: false, reason: "Organisation ou porteur absent" };
  try {
    await pliantGet(`/organizations/${encodeURIComponent(organizationId)}`);
  } catch (err) {
    rethrowTokenFailure(err);
    const reason =
      err instanceof PliantRequestError
        ? scrubPliantLog(err.body ? `Organisation illisible : Pliant ${err.status} ${err.body}` : `Organisation illisible : Pliant ${err.status}`, 180)
        : "Organisation illisible";
    return { ok: false, reason };
  }
  const holder = await readPliantCardholderName(cardholderId);
  if (!holder.ok) return { ok: false, reason: `Porteur illisible : ${holder.reason}` };
  return { ok: true };
}

export async function readPliantCardFace(cardId: string) {
  try {
    return pliantCardFace(unwrapRecord(await pliantGet(`/cards/${encodeURIComponent(cardId)}`)));
  } catch {
    return { id: cardId, label: null as string | null, last4: null as string | null };
  }
}

export async function setPliantCardLimit(
  cardId: string,
  limit: { value: number; currency: string },
  count: number | null,
  transactionLimit?: { value: number; currency: string }
) {
  const token = await accessToken();
  const payload: Record<string, unknown> = {
    limit,
    transactionLimit: transactionLimit || limit,
    limitRenewFrequency: "TOTAL",
  };
  if (typeof count === "number" && count >= 1) payload.maxTransactionCount = count;
  const res = await fetch(`${endpoints().api}/cards/${cardId}`, {
    method: "PATCH",
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "Pliant-API-Version": "2.1.0",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Pliant n’a pas modifié le plafond.");
}

const TX_PAGE = 100;
const TX_PAGES = 40;

/**
 * Mouvements de chaque organisation active : commerçant, carte, porteur.
 * `sinceMs` arrête la pagination dès que la page sort de la fenêtre.
 * Sans date, l’historique entier (premier passage). Le parc de cartes n’est relu que dans ce cas.
 */
export async function fetchPliantTransactions(options?: { sinceMs?: number | null }) {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const organizationIds = await pliantOrganizationIds();
  if (!organizationIds.length) throw new Error("Pliant n’est pas branché.");
  const sinceMs = options?.sinceMs ?? null;
  const seen = new Set<string>();
  const rows: unknown[] = [];
  for (const organizationId of organizationIds) {
    const transactions = await fetchOrganizationTransactions(organizationId, sinceMs);
    const [cards, holders] =
      sinceMs == null
        ? await Promise.all([
            fetchOrganizationDirectory(organizationId, "cards"),
            fetchOrganizationDirectory(organizationId, "cardholders"),
          ])
        : [[], []];
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

async function fetchOrganizationTransactions(organizationId: string, sinceMs: number | null) {
  try {
    const detailed = await fetchPages(
      (page) =>
        pliantPost("/transactions/details", {
          organizationIds: [organizationId],
          pagination: {
            page,
            limit: TX_PAGE,
            sortBy: { field: "createdAt", direction: "DESC" },
          },
        }),
      sinceMs
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
  }, sinceMs);
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
      holdersById.set(holderId, unwrapRecord(await pliantGet(cardholderDetailsPath(holderId))) || { cardholderId: holderId });
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

async function fetchPages(load: (page: number) => Promise<unknown>, sinceMs: number | null = null) {
  const rows: unknown[] = [];
  for (let page = 0; page < TX_PAGES; page += 1) {
    const batch = pliantTransactionPage(await load(page), TX_PAGE);
    if (sinceMs == null) {
      rows.push(...batch.rows);
      if (batch.done) break;
      continue;
    }
    const within = pliantRowsWithinSince(batch.rows, sinceMs);
    rows.push(...within.kept);
    if (batch.done || within.done) break;
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
  const method = body === undefined ? "GET" : "POST";
  const token = await accessToken();
  const res = await fetch(`${endpoints().api}${path}`, {
    method,
    signal: AbortSignal.timeout(PLIANT_TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${token}`,
      "Pliant-API-Version": "2.1.0",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const loggedBody = scrubPliantLog(await res.text());
    const safePath = maskPliantPath(path);
    console.error("[pliant]", method, safePath, res.status, loggedBody);
    throw new PliantRequestError({ method, path: safePath, status: res.status, body: loggedBody });
  }
  return (await res.json()) as unknown;
}
