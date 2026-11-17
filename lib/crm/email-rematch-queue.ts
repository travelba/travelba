/** Délai avant de retenter un mail déjà repris. Le cron passe toutes les 5 minutes. */
export const REMATCH_RETRY_AFTER_MS = 60 * 60 * 1000;

export type RematchQueueRow = {
  id: string;
  received_at?: string | null;
  rematch_attempted_at?: string | null;
};

export function rematchRetryBefore(now = Date.now()) {
  return new Date(now - REMATCH_RETRY_AFTER_MS).toISOString();
}

/** Jamais tenté, ou dernière tentative plus ancienne que le délai. */
export function rematchAttemptDue(attemptedAt: string | null | undefined, now = Date.now()) {
  if (!attemptedAt) return true;
  const at = Date.parse(attemptedAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= REMATCH_RETRY_AFTER_MS;
}

/**
 * Jamais tentés d’abord, les plus anciens en tête, puis la tentative la plus ancienne.
 * À horodatage égal, le mail reçu le plus tôt.
 */
function attemptRank(row: RematchQueueRow) {
  if (!row.rematch_attempted_at) return null;
  const at = Date.parse(row.rematch_attempted_at);
  return Number.isFinite(at) ? at : null;
}

export function compareRematchQueue(a: RematchQueueRow, b: RematchQueueRow) {
  const aAt = attemptRank(a);
  const bAt = attemptRank(b);
  if (aAt == null && bAt != null) return -1;
  if (aAt != null && bAt == null) return 1;
  if (aAt != null && bAt != null && aAt !== bAt) return aAt - bAt;
  return String(a.received_at || "").localeCompare(String(b.received_at || ""));
}

export function pickRematchBatch<T extends RematchQueueRow>(rows: T[], limit: number, now = Date.now()) {
  return rows
    .filter((row) => rematchAttemptDue(row.rematch_attempted_at, now))
    .sort(compareRematchQueue)
    .slice(0, Math.max(0, limit));
}

/** La colonne de reprise n’est pas encore en base (migration non jouée). */
export function missingRematchColumn(
  error: { code?: string | null; message?: string | null } | null | undefined
) {
  if (!error) return false;
  const message = error.message || "";
  if (message.includes("rematch_attempted_at") || message.includes("rematch_attempts")) return true;
  return (error.code === "42703" || error.code === "PGRST204") && message.length === 0;
}
