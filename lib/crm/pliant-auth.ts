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

/** 429 seulement : on bloque les prochains passages. Un refus d’identifiant reste réessayable. */
export function pliantTokenBackoffMs(status: number, retryAfter: string | null) {
  if (status !== 429) return 0;
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
  if (denial) {
    next.token_denied_until = denial.until;
    next.token_denied_message = denial.message;
  }
  return next;
}
