export type SignedCacheEntry = { url: string; expiresAtMs: number };

/** Marge avant expiration : on régénère quand il reste moins de 10 % ou 60 s. */
export function signedUrlMarginMs(expiresInSec: number) {
  const ttl = Math.max(1, expiresInSec) * 1000;
  return Math.min(60_000, Math.max(5_000, Math.floor(ttl * 0.1)));
}

/** Réutilise l’URL tant qu’elle n’est pas proche de l’expiration. */
export function reusableSignedUrl(entry: SignedCacheEntry | undefined, now: number, marginMs: number) {
  if (!entry?.url) return null;
  if (entry.expiresAtMs - now <= marginMs) return null;
  return entry.url;
}
