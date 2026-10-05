import { createHash, timingSafeEqual } from "node:crypto";

/** sha256 accepte toute longueur : la chaîne entière est hachée, jamais tronquée ni résumée. */
function digestSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Comparaison en temps constant, indépendante de la longueur des deux chaînes.
 * Ne journalise rien. Sert aux jetons de cron, de webhook, de signature et au code desk.
 */
export function secretEquals(given: string, expected: string) {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  return timingSafeEqual(digestSecret(given), digestSecret(expected));
}
