/** Fenêtre de fraîcheur du webhook Revolut (`Revolut-Request-Timestamp`). */
export const REVOLUT_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

/** L’en-tête est en millisecondes Unix ; une valeur en secondes (10 chiffres) est tolérée. Illisible → null. */
export function revolutTimestampMs(header: string | null | undefined): number | null {
  const raw = String(header || "").trim();
  if (!/^\d{10,13}$/.test(raw)) return null;
  const value = Number(raw);
  return raw.length <= 10 ? value * 1000 : value;
}

/** Rejette un webhook sans timestamp, illisible, ou décalé de plus de 5 minutes (rejeu). */
export function isRevolutTimestampFresh(
  header: string | null | undefined,
  now = Date.now(),
  maxAgeMs = REVOLUT_WEBHOOK_MAX_AGE_MS
) {
  const timestamp = revolutTimestampMs(header);
  if (timestamp == null) return false;
  return Math.abs(now - timestamp) <= maxAgeMs;
}
