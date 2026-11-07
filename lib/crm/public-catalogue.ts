/**
 * Robots du site public et cache des couvertures (`/api/covers`).
 * Les pages catalogue My Concierge (classements, guides, données fournisseur)
 * ne sont plus servies ici : ces chemins ne sont pas limités, Next répond 404.
 * Le connecteur CRM (`/api/mcp`) n’est jamais concerné.
 */

const AI_CRAWLER_TOKENS = [
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "ccbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "bytespider",
  "perplexitybot",
  "perplexity-user",
  "google-extended",
  "applebot-extended",
  "amazonbot",
  "facebookbot",
  "meta-externalagent",
  "diffbot",
  "omgili",
  "youbot",
  "cohere-ai",
  "ai2bot",
  "petalbot",
  "imagesiftbot",
  "timpibot",
] as const;

export const AI_CRAWLER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "CCBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Bytespider",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "FacebookBot",
  "meta-externalagent",
  "Diffbot",
  "Omgilibot",
  "YouBot",
  "cohere-ai",
  "AI2Bot",
  "PetalBot",
  "ImagesiftBot",
  "Timpibot",
] as const;

/** Anciens préfixes de vitrine sans page dans cette app. Les couvertures CRM restent. */
const CATALOGUE_PREFIXES = ["/hotels", "/hotel", "/lieux", "/lieu", "/itineraires", "/itineraire"];

const PRIVATE_ROBOT_PATHS = [
  "/api/",
  "/e/",
  "/k/",
  "/v/",
  "/exemple",
  "/apercu",
  "/admin",
  "/mon-compte",
  "/connexion",
  "/auth",
];

const CRAWLER_WINDOW_MS = 60_000;
const CRAWLER_MAX_HITS = 30;

export function isMcpPath(path: string) {
  const bare = path.split("?")[0] || "/";
  return bare === "/api/mcp" || bare.startsWith("/api/mcp/");
}

export function isCataloguePath(path: string) {
  const bare = stripLocale(path.split("?")[0] || "/");
  if (bare === "/api/covers" || bare.startsWith("/api/covers/")) return true;
  return CATALOGUE_PREFIXES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

function stripLocale(path: string) {
  const stripped = path.replace(/^\/(fr|en)(?=\/)/, "");
  return stripped || "/";
}

export function isSearchCrawler(userAgent: string | null | undefined) {
  const ua = (userAgent || "").toLowerCase();
  if (!ua || ua.includes("google-extended") || ua.includes("applebot-extended")) return false;
  return ua.includes("googlebot") || ua.includes("bingbot") || ua.includes("adsbot-google") || /\bmsnbot\b/.test(ua);
}

export function isAiCrawler(userAgent: string | null | undefined) {
  const ua = (userAgent || "").toLowerCase();
  return AI_CRAWLER_TOKENS.some((token) => ua.includes(token));
}

export function isGenericCrawler(userAgent: string | null | undefined) {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return true;
  return /bot|spider|crawler|scrape|slurp|archiver|httpclient|python-requests|go-http-client|\bcurl\/|\bwget\/|headless/.test(ua);
}

export type CrawlerDecision = { action: "pass" | "limit"; retryAfter: number };

/**
 * Limite les robots sur les couvertures et les anciens préfixes de vitrine.
 * Google et Bing passent. `/api/mcp` passe toujours, y compris avec un user-agent de robot.
 * Classements, guides et données fournisseur ne sont plus concernés : la page est un 404.
 */
export function catalogueCrawlerDecision(
  input: { path: string; userAgent: string | null | undefined; ip?: string | null; now: number },
  store: Map<string, number[]> = crawlerHits
): CrawlerDecision {
  if (isMcpPath(input.path)) return { action: "pass", retryAfter: 0 };
  if (input.path.split("?")[0]?.startsWith("/api/") && !isCataloguePath(input.path)) {
    return { action: "pass", retryAfter: 0 };
  }
  if (!isCataloguePath(input.path)) return { action: "pass", retryAfter: 0 };
  if (isSearchCrawler(input.userAgent)) return { action: "pass", retryAfter: 0 };
  if (isAiCrawler(input.userAgent)) return { action: "limit", retryAfter: 86_400 };
  if (!isGenericCrawler(input.userAgent)) return { action: "pass", retryAfter: 0 };

  if (store.size > 5_000) store.clear();
  const key = (input.ip || "unknown").slice(0, 80);
  const recent = (store.get(key) || []).filter((stamp) => input.now - stamp < CRAWLER_WINDOW_MS);
  if (recent.length >= CRAWLER_MAX_HITS) {
    store.set(key, recent);
    return { action: "limit", retryAfter: 60 };
  }
  recent.push(input.now);
  store.set(key, recent);
  return { action: "pass", retryAfter: 0 };
}

const crawlerHits = new Map<string, number[]>();

export function publicRobots(sitemap: string, host: string) {
  const search = {
    userAgent: ["Googlebot", "Bingbot"],
    allow: "/",
    disallow: PRIVATE_ROBOT_PATHS,
  };
  const visitors = {
    userAgent: "*",
    allow: "/",
    disallow: PRIVATE_ROBOT_PATHS,
  };
  const blocked = AI_CRAWLER_AGENTS.map((userAgent) => ({
    userAgent,
    disallow: "/",
  }));
  return {
    rules: [search, visitors, ...blocked],
    sitemap,
    host,
  };
}

export function publicImageCacheHeaders(contentType: string) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Vercel-CDN-Cache-Control": "public, s-maxage=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
}
