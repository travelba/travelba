import { createHash, timingSafeEqual } from "node:crypto";

const MAX_SECRET = 512;

function digestSecret(value: string) {
  const bounded = value.length > MAX_SECRET ? `len:${value.length}` : value;
  return createHash("sha256").update(bounded).digest();
}

/**
 * Comparaison en temps constant, indépendante de la longueur des deux chaînes.
 * Ne journalise rien. Sert aux jetons de cron, de webhook, de signature et au code desk.
 */
export function secretEquals(given: string, expected: string) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  return timingSafeEqual(digestSecret(given), digestSecret(expected));
}
