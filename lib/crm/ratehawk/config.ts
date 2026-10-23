export type RatehawkEnv = "sandbox" | "production";

export type PaymentTypeName = "deposit" | "hotel" | "now";

export type RatehawkConfig = {
  environment: RatehawkEnv;
  baseUrl: string;
  keyId: string;
  apiKey: string;
  proxy: string | null;
  paymentType: PaymentTypeName;
  priceIncreasePercent: number;
  marginPercent: number;
  searchTimeoutSeconds: number;
  prebookTimeoutMs: number;
  bookingCutoffSeconds: number;
  orderInfoDelaySeconds: number;
  currency: string;
  language: "en" | "fr";
  agencyEmail: string;
  agencyPhone: string;
  webhookToken: string;
};

const HOSTS: Record<RatehawkEnv, string> = {
  sandbox: "api-sandbox.ratehawk.com",
  production: "api.ratehawk.com",
};

export const PREBOOK_TIMEOUT_MS = 60_000;
export const SEARCH_TIMEOUT_MAX_SECONDS = 30;

export class RatehawkConfigError extends Error {}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function loadRatehawkConfig(env: Record<string, string | undefined> = process.env): RatehawkConfig {
  const mode = (env.RATEHAWK_ENV || "sandbox").trim().toLowerCase();
  if (mode !== "sandbox" && mode !== "production") {
    throw new RatehawkConfigError("RATEHAWK_ENV vaut sandbox ou production.");
  }
  if (env.VERCEL_ENV === "preview" && mode === "production") {
    throw new RatehawkConfigError("Le bac à sable Ratehawk seul est admis en preview.");
  }
  const expectedHost = HOSTS[mode];
  const baseUrl = (env.RATEHAWK_BASE_URL || `https://${expectedHost}`).trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new RatehawkConfigError("RATEHAWK_BASE_URL est illisible.");
  }
  if (url.protocol !== "https:" || url.hostname !== expectedHost || (url.pathname !== "" && url.pathname !== "/")) {
    throw new RatehawkConfigError("RATEHAWK_BASE_URL ne correspond pas à RATEHAWK_ENV.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RatehawkConfigError("RATEHAWK_BASE_URL ne porte ni secret ni requête.");
  }

  const payment = (env.RATEHAWK_PAYMENT_TYPE || "deposit").trim().toLowerCase();
  if (payment !== "deposit" && payment !== "hotel" && payment !== "now") {
    throw new RatehawkConfigError("RATEHAWK_PAYMENT_TYPE vaut deposit, hotel ou now.");
  }

  const proxyRaw = (env.RATEHAWK_HTTPS_PROXY || "").trim();
  let proxy: string | null = null;
  if (proxyRaw) {
    let proxyUrl: URL;
    try {
      proxyUrl = new URL(proxyRaw);
    } catch {
      throw new RatehawkConfigError("RATEHAWK_HTTPS_PROXY est illisible.");
    }
    if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
      throw new RatehawkConfigError("RATEHAWK_HTTPS_PROXY est un proxy http ou https.");
    }
    proxy = proxyUrl.toString();
  }

  const marginRaw = Number(env.RATEHAWK_MARGIN_PERCENT);
  const marginPercent = Number.isFinite(marginRaw) ? Math.max(12, marginRaw) : 12;
  const priceIncreasePercent = clampInt(env.RATEHAWK_PRICE_INCREASE_PERCENT, 10, 0, 100);

  return {
    environment: mode,
    baseUrl,
    keyId: (env.RATEHAWK_KEY_ID || "").trim(),
    apiKey: (env.RATEHAWK_API_KEY || "").trim(),
    proxy,
    paymentType: payment,
    priceIncreasePercent,
    marginPercent,
    searchTimeoutSeconds: clampInt(env.RATEHAWK_SEARCH_TIMEOUT_SECONDS, 30, 1, SEARCH_TIMEOUT_MAX_SECONDS),
    prebookTimeoutMs: PREBOOK_TIMEOUT_MS,
    bookingCutoffSeconds: clampInt(env.RATEHAWK_BOOKING_CUTOFF_SECONDS, 180, 30, 300),
    orderInfoDelaySeconds: clampInt(env.RATEHAWK_ORDER_INFO_DELAY_SECONDS, 60, 30, 3600),
    currency: (env.RATEHAWK_CURRENCY || "EUR").trim().toUpperCase() || "EUR",
    language: mode === "sandbox" ? "en" : "fr",
    agencyEmail: (env.RATEHAWK_AGENCY_EMAIL || "").trim(),
    agencyPhone: (env.RATEHAWK_AGENCY_PHONE || "").trim(),
    webhookToken: (env.RATEHAWK_WEBHOOK_TOKEN || "").trim(),
  };
}

export function ratehawkConfigured(config = safeConfig()): boolean {
  return Boolean(config?.keyId && config?.apiKey);
}

export function safeConfig(): RatehawkConfig | null {
  try {
    return loadRatehawkConfig();
  } catch {
    return null;
  }
}

export function requireConfig(): RatehawkConfig {
  const config = loadRatehawkConfig();
  if (!config.keyId || !config.apiKey) {
    throw new RatehawkConfigError("Ratehawk n’est pas configuré : RATEHAWK_KEY_ID et RATEHAWK_API_KEY.");
  }
  return config;
}

export function requireBookingConfig(): RatehawkConfig {
  const config = requireConfig();
  if (!config.agencyEmail.includes("@")) {
    throw new RatehawkConfigError("RATEHAWK_AGENCY_EMAIL est l’adresse fixe de l’agence pour user.email.");
  }
  return config;
}
