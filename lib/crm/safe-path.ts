/** Origine de référence : le chemin doit y rester une fois résolu. */
const SITE_ORIGIN = "https://travelba.fr";

/**
 * Chemin interne sûr, ou `fallback`.
 * Le parseur WHATWG lit `\` comme `/` : `/\evil.com` devient `https://evil.com/`.
 * On normalise donc `%5C` et `\` en `/`, on exige un seul `/` en tête, on refuse
 * tout schéma, puis on vérifie que l’URL résolue reste sur le site.
 */
export function safeInternalPath(input: string | null | undefined, fallback = "/mon-compte"): string {
  if (typeof input !== "string") return fallback;
  const candidate = input.trim().replace(/%5c/gi, "/").replace(/\\/g, "/");
  if (!candidate) return fallback;
  if (!/^\/(?![/\\])/.test(candidate)) return fallback;
  if (candidate.includes("://")) return fallback;
  if (/[\u0000-\u001f\u007f\s]/.test(candidate)) return fallback;
  try {
    const url = new URL(candidate, SITE_ORIGIN);
    if (url.origin !== SITE_ORIGIN) return fallback;
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return fallback;
    return candidate;
  } catch {
    return fallback;
  }
}
