/** Auth0 n’accorde qu’une poignée de jetons par jour. On réutilise le même jusqu’à expiration. */

export const PLIANT_TOKEN_SKEW_MS = 60_000;
export const PLIANT_TOKEN_LIMIT = "Pliant limite les demandes de jeton. Réessayez dans une heure.";
export const PLIANT_TOKEN_REJECTED = "Pliant a refusé l’identifiant.";
export const PLIANT_TOKEN_MISSING = "Pliant n’a pas délivré de jeton.";

const TOKEN_FAILURES = new Set([PLIANT_TOKEN_LIMIT, PLIANT_TOKEN_REJECTED, PLIANT_TOKEN_MISSING]);

export function pliantTokenStillValid(expiresAtMs: number, now = Date.now()) {
  return Number.isFinite(expiresAtMs) && expiresAtMs > now + PLIANT_TOKEN_SKEW_MS;
}

export function pliantTokenFailureMessage(status: number) {
  if (status === 429) return PLIANT_TOKEN_LIMIT;
  if (status === 401 || status === 403) return PLIANT_TOKEN_REJECTED;
  return PLIANT_TOKEN_MISSING;
}

export function isPliantTokenFailure(message: string) {
  return TOKEN_FAILURES.has(message);
}

const FLEET_PAUSE_MS = 60_000;

/** Le quota tient une heure. Tout autre échec arrête le parc une minute, pour ne pas relancer Auth0. */
export function pliantTokenBackoffMs(status: number, retryAfter: string | null) {
  if (status !== 429) return FLEET_PAUSE_MS;
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds > 0 && seconds <= 24 * 3600) return Math.round(seconds * 1000);
  return 60 * 60 * 1000;
}

function denialFields(extra: unknown) {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return null;
  const row = extra as Record<string, unknown>;
  const until = typeof row.token_denied_until === "string" ? Date.parse(row.token_denied_until) : NaN;
  const message = typeof row.token_denied_message === "string" ? row.token_denied_message : "";
  if (!Number.isFinite(until) || !isPliantTokenFailure(message)) return null;
  return { until, message };
}

export function pliantStoredDenial(extra: unknown, now = Date.now()) {
  const denial = denialFields(extra);
  if (!denial || denial.until <= now) return null;
  return denial.message;
}

export function pliantDenialUntil(extra: unknown) {
  return denialFields(extra)?.until ?? null;
}

export function pliantTokenExtra(extra: unknown, denial: { until: string; message: string } | null) {
  const next =
    extra && typeof extra === "object" && !Array.isArray(extra) ? { ...(extra as Record<string, unknown>) } : {};
  delete next.token_denied_until;
  delete next.token_denied_message;
  delete next.token_refresh_until;
  if (denial) {
    next.token_denied_until = denial.until;
    next.token_denied_message = denial.message;
  }
  return next;
}

export const PLIANT_TOKEN_CLAIM_MS = 20_000;

export type PliantTokenMemory = {
  token: { accessToken: string; expiresAt: number } | null;
  deniedUntil: number;
  deniedMessage: string | null;
};

export type PliantTokenSnapshot = {
  accessToken: string | null;
  expiresAt: number | null;
  extra: unknown;
};

export type PliantTokenStore = {
  read: () => Promise<PliantTokenSnapshot | null>;
  claim: (untilIso: string) => Promise<boolean>;
  save: (accessToken: string, expiresAt: number, extra: unknown) => Promise<void>;
  deny: (untilIso: string, message: string, extra: unknown) => Promise<void>;
  release: (extra: unknown) => Promise<void>;
};

export type PliantTokenResponse =
  | { ok: true; accessToken: string; expiresInSec: number }
  | { ok: false; status: number; retryAfter: string | null };

export function emptyPliantTokenMemory(): PliantTokenMemory {
  return { token: null, deniedUntil: 0, deniedMessage: null };
}

function rememberToken(memory: PliantTokenMemory, accessToken: string, expiresAt: number) {
  memory.token = { accessToken, expiresAt };
  memory.deniedMessage = null;
  memory.deniedUntil = 0;
}

function rememberDenial(memory: PliantTokenMemory, message: string, until: number) {
  memory.deniedMessage = message;
  memory.deniedUntil = until;
}

function takeMemory(memory: PliantTokenMemory, now: number) {
  if (memory.token && pliantTokenStillValid(memory.token.expiresAt, now)) return memory.token.accessToken;
  if (memory.deniedMessage && memory.deniedUntil > now) throw new Error(memory.deniedMessage);
  return null;
}

function takeStored(memory: PliantTokenMemory, stored: PliantTokenSnapshot | null, now: number) {
  if (!stored) return null;
  if (stored.accessToken && stored.expiresAt && pliantTokenStillValid(stored.expiresAt, now)) {
    rememberToken(memory, stored.accessToken, stored.expiresAt);
    return stored.accessToken;
  }
  const blocked = pliantStoredDenial(stored.extra, now);
  if (blocked) {
    rememberDenial(memory, blocked, pliantDenialUntil(stored.extra) || now + FLEET_PAUSE_MS);
    throw new Error(blocked);
  }
  return null;
}

/**
 * Un seul appel Auth0 pour tout le parc. Les autres lisent le jeton déjà gardé,
 * ou attendent le verrou. Personne ne redemande pendant un blocage.
 */
export async function acquirePliantToken(input: {
  memory: PliantTokenMemory;
  store: PliantTokenStore;
  request: () => Promise<PliantTokenResponse>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  claimMs?: number;
}) {
  const now = input.now ?? (() => Date.now());
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const claimMs = input.claimMs ?? PLIANT_TOKEN_CLAIM_MS;
  const ready = takeMemory(input.memory, now());
  if (ready) return ready;

  const deadline = now() + claimMs;
  let extra: unknown = null;
  while (now() <= deadline) {
    const stored = await input.store.read();
    extra = stored?.extra ?? extra;
    const reused = takeStored(input.memory, stored, now());
    if (reused) return reused;
    if (await input.store.claim(new Date(now() + claimMs).toISOString())) {
      return issueOnce(input, extra, now);
    }
    await sleep(200);
  }
  const last = takeStored(input.memory, await input.store.read(), now());
  if (last) return last;
  throw new Error(PLIANT_TOKEN_MISSING);
}

async function issueOnce(
  input: {
    memory: PliantTokenMemory;
    store: PliantTokenStore;
    request: () => Promise<PliantTokenResponse>;
  },
  extra: unknown,
  now: () => number
) {
  try {
    const result = await input.request();
    if (!result.ok) {
      const status = result.status;
      const retryAfter = result.retryAfter;
      const message = pliantTokenFailureMessage(status);
      const until = now() + pliantTokenBackoffMs(status, retryAfter);
      rememberDenial(input.memory, message, until);
      await input.store.deny(new Date(until).toISOString(), message, extra);
      throw new Error(message);
    }
    if (!result.accessToken) {
      const message = pliantTokenFailureMessage(502);
      const until = now() + pliantTokenBackoffMs(502, null);
      rememberDenial(input.memory, message, until);
      await input.store.deny(new Date(until).toISOString(), message, extra);
      throw new Error(message);
    }
    const expiresAt = now() + (result.expiresInSec || 3600) * 1000;
    rememberToken(input.memory, result.accessToken, expiresAt);
    await input.store.save(result.accessToken, expiresAt, extra);
    return result.accessToken;
  } catch (err) {
    if (!(err instanceof Error) || !isPliantTokenFailure(err.message)) {
      try {
        await input.store.release(extra);
      } catch {
        /* Le verrou expire seul. */
      }
    }
    throw err;
  }
}
