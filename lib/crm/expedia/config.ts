export type ExpediaEnv = "test" | "production";

export type ExpediaSalesChannel = "website" | "mobile_web" | "agent_tool";

export type ExpediaConfig = {
  environment: ExpediaEnv;
  baseUrl: string;
  apiKey: string;
  sharedSecret: string;
  testHeader: string | null;
  salesChannelMode: "auto" | ExpediaSalesChannel;
  userAgent: string;
};

const TEST_HOST = "test.ean.com";
const PRODUCTION_HOST = "api.ean.com";

export class ExpediaConfigError extends Error {}

function hostAllowed(mode: ExpediaEnv, hostname: string) {
  return mode === "test" ? hostname === TEST_HOST : hostname === PRODUCTION_HOST;
}

export function loadExpediaConfig(env: Record<string, string | undefined> = process.env): ExpediaConfig {
  const mode = (env.EXPEDIA_RAPID_ENV || "test").trim().toLowerCase();
  if (mode !== "test" && mode !== "production") {
    throw new ExpediaConfigError("EXPEDIA_RAPID_ENV vaut test ou production.");
  }
  if (env.VERCEL_ENV === "preview" && mode === "production") {
    throw new ExpediaConfigError("L’environnement de test Expedia seul est admis en preview.");
  }
  const fallback = mode === "test" ? `https://${TEST_HOST}/v3` : `https://${PRODUCTION_HOST}/v3`;
  const baseUrl = (env.EXPEDIA_RAPID_BASE_URL || fallback).trim().replace(/\/$/, "");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new ExpediaConfigError("EXPEDIA_RAPID_BASE_URL est illisible.");
  }
  if (url.protocol !== "https:" || !hostAllowed(mode, url.hostname) || url.pathname !== "/v3") {
    throw new ExpediaConfigError("EXPEDIA_RAPID_BASE_URL ne correspond pas à EXPEDIA_RAPID_ENV.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ExpediaConfigError("EXPEDIA_RAPID_BASE_URL ne porte ni secret ni requête.");
  }
  const testRaw = (env.EXPEDIA_RAPID_TEST ?? (mode === "test" ? "standard" : "off")).trim().toLowerCase();
  const allowedTests = new Set(["off", "standard", "no_availability", "service_unavailable"]);
  if (!allowedTests.has(testRaw)) {
    throw new ExpediaConfigError("EXPEDIA_RAPID_TEST vaut off, standard, no_availability ou service_unavailable.");
  }
  const channelRaw = (env.EXPEDIA_SALES_CHANNEL_MODE || "auto").trim().toLowerCase();
  const channels = new Set(["auto", "website", "mobile_web", "agent_tool"]);
  if (!channels.has(channelRaw)) {
    throw new ExpediaConfigError("EXPEDIA_SALES_CHANNEL_MODE vaut auto, website, mobile_web ou agent_tool.");
  }
  return {
    environment: mode,
    baseUrl,
    apiKey: (env.EXPEDIA_RAPID_API_KEY || "").trim(),
    sharedSecret: (env.EXPEDIA_RAPID_SHARED_SECRET || "").trim(),
    testHeader: testRaw === "off" ? null : testRaw,
    salesChannelMode: channelRaw as ExpediaConfig["salesChannelMode"],
    userAgent: "TravelBA/1.0 (https://travelba.fr)",
  };
}

/** Interrupteur. Absent, ou autre chose que 1 / true / on : Expedia ne part pas, même si les clés sont là. */
export function expediaSearchEnabled(env: Record<string, string | undefined> = process.env) {
  const flag = (env.EXPEDIA_RAPID_ENABLED || "").trim().toLowerCase();
  if (flag !== "1" && flag !== "true" && flag !== "on") return false;
  try {
    const config = loadExpediaConfig(env);
    return Boolean(config.apiKey && config.sharedSecret);
  } catch {
    return false;
  }
}

export function resolveExpediaSalesChannel(input: {
  mode: ExpediaConfig["salesChannelMode"];
  audience: "client" | "agent";
  mobile: boolean;
}): ExpediaSalesChannel {
  if (input.mode !== "auto") return input.mode;
  if (input.mobile) return "mobile_web";
  return input.audience === "agent" ? "agent_tool" : "website";
}

export function safeExpediaConfig(): ExpediaConfig | null {
  try {
    return loadExpediaConfig();
  } catch {
    return null;
  }
}
