import { siteConfig } from "@/lib/site";

/** Base URL publique (prod / preview / local). */
export function getPublicSiteUrl() {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (fromEnv) {
    const raw = fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
    return raw.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  return siteConfig.url.replace(/\/$/, "");
}

/** Alphabet sans caractères ambigus (0/O, 1/l/I). */
const SHORT_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

/** Code court 16 caractères (80 bits) pour WhatsApp. */
export function ensureShortCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let out = "";
  for (const b of bytes) {
    out += SHORT_ALPHABET[b % SHORT_ALPHABET.length];
  }
  return out;
}

export function ensureQuoteToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Lien long historique `/devis/[token]`. */
export function buildPublicQuoteUrl(quoteToken: string | null | undefined) {
  if (!quoteToken) return null;
  return `${getPublicSiteUrl()}/devis/${quoteToken}`;
}

/** Suivi dépenses — lien court `/d/xxxxxx`. */
export function buildShortExpenseUrl(shortCode: string | null | undefined) {
  if (!shortCode) return null;
  return `${getPublicSiteUrl()}/d/${shortCode}`;
}

/** Traveler View My Trip — lien court `/v/xxxxxx`. */
export function buildShortTripUrl(shortCode: string | null | undefined) {
  if (!shortCode) return null;
  return `${getPublicSiteUrl()}/v/${shortCode}`;
}
