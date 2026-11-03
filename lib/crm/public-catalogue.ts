/**
 * Vitrine publique : classements, guides, données fournisseur, images catalogue.
 * Le connecteur CRM (`/api/mcp`) n’est jamais concerné.
 */

export const PUBLIC_CONTENT_REVALIDATE = 3600;

export const PUBLIC_CONTENT_TAGS = {
  classements: "editorial-rankings",
  guides: "editorial-guides",
  fournisseurs: "supplier-data",
} as const;

export type PublicContentTarget = keyof typeof PUBLIC_CONTENT_TAGS;

export const RANKING_LIST_COLUMNS =
  "slug, title_fr, title_en, kind, hero_image, reviewed_at, updated_at";

export const RANKING_DETAIL_COLUMNS =
  "id, slug, title_fr, title_en, kind, intro_fr, intro_en, outro_fr, outro_en, faq, factual_summary_fr, factual_summary_en, editorial_sections, hero_image, reviewed_at, author_name";

export const RANKING_ENTRY_COLUMNS =
  "rank, justification_fr, justification_en, badge_fr, badge_en, hotels!inner(slug, name, city, hero_image, is_published)";

export const GUIDE_LIST_COLUMNS =
  "slug, name_fr, name_en, scope, country_code, summary_fr, summary_en, hero_image, reviewed_at, updated_at";

export const GUIDE_DETAIL_COLUMNS =
  "slug, name_fr, name_en, scope, country_code, summary_fr, summary_en, summary_long_fr, sections, faq, highlights, practical_info, hero_image, reviewed_at, author_name";

/** Pas d’images, pas de clé fournisseur, pas de brut. */
export const SUPPLIER_ROOM_COLUMNS =
  "supplier, room_name, room_amenities, hotels!inner(slug, name, city, is_published)";

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

const CATALOGUE_PREFIXES = [
  "/classement",
  "/guide",
  "/donnees-fournisseur",
  "/hotels",
  "/hotel",
  "/lieux",
  "/lieu",
  "/itineraires",
  "/itineraire",
];

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

const IMAGE_PREFIX = /^(covers|editorial|catalogue|hotels)\//;
const IMAGE_EXT = /\.(webp|jpe?g|png|avif)$/i;
const STORAGE_URL =
  /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/(?:public|sign|authenticated)\/crm-files\/(.+)$/i;

export function isMcpPath(path: string) {
  const bare = path.split("?")[0] || "/";
  return bare === "/api/mcp" || bare.startsWith("/api/mcp/");
}

export function isCataloguePath(path: string) {
  const bare = stripLocale(path.split("?")[0] || "/");
  if (bare === "/api/media/catalogue" || bare.startsWith("/api/media/catalogue/")) return true;
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
 * Limite les robots sur les pages catalogue. Google et Bing passent.
 * `/api/mcp` passe toujours, y compris avec un user-agent de robot.
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

export function isPublicCatalogueImagePath(path: string) {
  if (!path || path.length > 240 || path.includes("..") || path.includes("\\") || path.includes("\0")) return false;
  if (!IMAGE_PREFIX.test(path) || !IMAGE_EXT.test(path)) return false;
  return !/passport|identity|customers\/|bookings\/|documents\//i.test(path);
}

export function catalogueImageSegments(segments: string[]) {
  if (!segments.length || segments.length > 6) return null;
  if (segments.some((part) => !part || part === "." || part === ".." || /[\\/?#]/.test(part))) return null;
  const path = segments.map((part) => decodeURIComponent(part)).join("/");
  return isPublicCatalogueImagePath(path) ? path : null;
}

/** URL du CDN maison. Une adresse Storage directe n’est jamais renvoyée. */
export function catalogueImageSrc(value: string | null | undefined) {
  const raw = (value || "").trim();
  if (!raw || raw.includes("..") || raw.includes("\\")) return null;
  if (raw.startsWith("/covers/") || raw.startsWith("/brand/")) return raw.split("?")[0] || null;
  if (raw.startsWith("https://images.unsplash.com/")) return raw;

  const withoutQuery = raw.split("#")[0]?.split("?")[0] || "";
  let path: string | null = null;
  const storage = withoutQuery.match(STORAGE_URL);
  if (storage?.[1]) path = safeDecode(storage[1]);
  else if (IMAGE_PREFIX.test(withoutQuery)) path = withoutQuery;
  else if (/supabase\.co\/storage\//i.test(raw)) return null;

  if (!path || !isPublicCatalogueImagePath(path)) return null;
  return `/api/media/catalogue/${path.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function contentSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 120;
}

export function pickLocale(locale: string, fr: string | null | undefined, en: string | null | undefined) {
  const french = (fr || "").trim();
  const english = (en || "").trim();
  if (locale === "en") return english || french;
  return french || english;
}

export function textBlocks(value: unknown) {
  const blocks: { title: string; body: string }[] = [];
  const push = (title: string, body: string) => {
    const cleanTitle = clip(title);
    const cleanBody = clip(body);
    if (cleanTitle || cleanBody) blocks.push({ title: cleanTitle, body: cleanBody });
  };
  if (typeof value === "string") push("", value);
  else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") push("", item);
      else if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        push(
          firstString(row, ["title", "heading", "question", "q", "name", "label"]),
          firstString(row, ["body", "text", "answer", "a", "content", "description", "value"])
        );
      }
      if (blocks.length >= 40) break;
    }
  }
  return blocks.slice(0, 40);
}

function firstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function clip(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 4_000);
}

export type SupplierHotel = {
  slug: string;
  name: string;
  city: string | null;
  rooms: { supplier: string; roomName: string; amenities: string[] }[];
};

export function groupSupplierRooms(rows: unknown[]): SupplierHotel[] {
  const hotels = new Map<string, SupplierHotel>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const hotel = oneRecord(record.hotels);
    const slug = typeof hotel?.slug === "string" ? hotel.slug : "";
    const name = typeof hotel?.name === "string" ? hotel.name.trim() : "";
    if (!contentSlug(slug) || !name || hotel?.is_published === false) continue;
    const roomName = clip(typeof record.room_name === "string" ? record.room_name : "");
    if (!roomName) continue;
    const current = hotels.get(slug) || {
      slug,
      name: name.slice(0, 160),
      city: typeof hotel?.city === "string" ? hotel.city.slice(0, 80) : null,
      rooms: [],
    };
    if (current.rooms.length < 40) {
      current.rooms.push({
        supplier: clip(typeof record.supplier === "string" ? record.supplier : "").slice(0, 40),
        roomName: roomName.slice(0, 160),
        amenities: amenityList(record.room_amenities),
      });
    }
    hotels.set(slug, current);
  }
  return [...hotels.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function oneRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return value[0] && typeof value[0] === "object" ? (value[0] as Record<string, unknown>) : null;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function amenityList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    const label =
      typeof item === "string"
        ? item
        : item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string"
          ? (item as { name: string }).name
          : "";
    const clean = clip(label).slice(0, 80);
    if (clean) names.push(clean);
    if (names.length >= 12) break;
  }
  return names;
}
