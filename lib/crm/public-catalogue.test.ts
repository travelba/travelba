import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_CRAWLER_AGENTS,
  catalogueCrawlerDecision,
  catalogueImageSegments,
  catalogueImageSrc,
  contentSlug,
  groupSupplierRooms,
  isMcpPath,
  isPublicCatalogueImagePath,
  isSearchCrawler,
  publicImageCacheHeaders,
  publicRobots,
  RANKING_ENTRY_COLUMNS,
  SUPPLIER_ROOM_COLUMNS,
  textBlocks,
} from "./public-catalogue";

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const GOOGLE = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BING = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

test("robots.txt bloque les robots d’IA et laisse Google et Bing", () => {
  const robots = publicRobots("https://travelba.fr/sitemap.xml", "https://travelba.fr");
  const rules = robots.rules as Array<{ userAgent: string | string[]; allow?: string; disallow?: string | string[] }>;
  const google = rules.find((rule) => Array.isArray(rule.userAgent) && rule.userAgent.includes("Googlebot"));
  if (!google || !Array.isArray(google.userAgent) || !Array.isArray(google.disallow)) throw new Error("règle Google manquante");
  assert.equal(google.allow, "/");
  assert.equal(google.userAgent.includes("Bingbot"), true);
  assert.equal(google.disallow.includes("/admin"), true);
  assert.equal(google.disallow.includes("/"), false);
  for (const name of ["GPTBot", "CCBot", "ClaudeBot", "Bytespider", "PerplexityBot", "Google-Extended"]) {
    const rule = rules.find((item) => item.userAgent === name);
    assert.equal(rule?.disallow, "/");
  }
  assert.equal(AI_CRAWLER_AGENTS.some((name) => name === "GPTBot"), true);
  assert.equal(AI_CRAWLER_AGENTS.some((name) => name.toLowerCase() === "bingbot"), false);
  assert.equal(isSearchCrawler(GOOGLE), true);
  assert.equal(isSearchCrawler(BING), true);
  assert.equal(isSearchCrawler("Mozilla/5.0 (compatible; Google-Extended)"), false);
});

test("le connecteur MCP n’est jamais limité, même pour GPTBot", () => {
  for (const path of ["/api/mcp", "/api/mcp/", "/api/mcp/tools"]) {
    assert.equal(isMcpPath(path), true);
    const decision = catalogueCrawlerDecision(
      { path, userAgent: "GPTBot", ip: "1.1.1.1", now: 1_000 },
      new Map()
    );
    assert.equal(decision.action, "pass");
  }
  const home = catalogueCrawlerDecision({ path: "/fr", userAgent: "GPTBot", now: 1 }, new Map());
  assert.equal(home.action, "pass");
});

test("les robots d’IA sont limités sur le catalogue, Google passe", () => {
  const blocked = catalogueCrawlerDecision(
    { path: "/fr/classement/meilleurs-palaces", userAgent: "ClaudeBot", ip: "2.2.2.2", now: 5 },
    new Map()
  );
  assert.equal(blocked.action, "limit");
  assert.equal(blocked.retryAfter, 86_400);

  const image = catalogueCrawlerDecision(
    { path: "/api/media/catalogue/covers/a.webp", userAgent: "Bytespider", now: 5 },
    new Map()
  );
  assert.equal(image.action, "limit");

  const cover = catalogueCrawlerDecision(
    { path: "/api/covers/photo-paris", userAgent: "GPTBot", now: 5 },
    new Map()
  );
  assert.equal(cover.action, "limit");
  const coverSearch = catalogueCrawlerDecision(
    { path: "/api/covers/photo-paris", userAgent: GOOGLE, now: 5 },
    new Map()
  );
  assert.equal(coverSearch.action, "pass");

  const google = catalogueCrawlerDecision({ path: "/en/guide/paris", userAgent: GOOGLE, now: 5 }, new Map());
  assert.equal(google.action, "pass");

  const reader = catalogueCrawlerDecision({ path: "/fr/hotels/crillon", userAgent: BROWSER, now: 5 }, new Map());
  assert.equal(reader.action, "pass");

  const client = catalogueCrawlerDecision(
    { path: "/api/client/hotels/search", userAgent: "python-requests/2", now: 5 },
    new Map()
  );
  assert.equal(client.action, "pass");
});

test("un robot générique est limité après trente lectures catalogue", () => {
  const store = new Map<string, number[]>();
  const ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0)";
  for (let index = 0; index < 30; index += 1) {
    const decision = catalogueCrawlerDecision({ path: "/guide", userAgent: ua, ip: "9.9.9.9", now: 10_000 + index }, store);
    assert.equal(decision.action, "pass");
  }
  const blocked = catalogueCrawlerDecision({ path: "/en/guide", userAgent: ua, ip: "9.9.9.9", now: 10_040 }, store);
  assert.equal(blocked.action, "limit");
  assert.equal(blocked.retryAfter, 60);
});

test("les images Storage passent par le CDN, jamais en adresse directe", () => {
  const src = catalogueImageSrc(
    "https://example.supabase.co/storage/v1/object/sign/crm-files/covers/catalog/photo-paris.webp?token=secret"
  );
  assert.equal(src, "/api/media/catalogue/covers/catalog/photo-paris.webp");
  assert.equal(src?.includes("supabase.co"), false);
  assert.equal(src?.includes("token"), false);

  assert.equal(
    catalogueImageSrc("https://example.supabase.co/storage/v1/object/public/crm-files/customers/a/passeport.jpg"),
    null
  );
  assert.equal(catalogueImageSrc("covers/../customers/a/photo.webp"), null);
  assert.equal(isPublicCatalogueImagePath("bookings/a/cover.webp"), false);
  assert.equal(catalogueImageSegments(["covers", "..", "secret.webp"]), null);
  assert.equal(catalogueImageSegments(["covers", "catalog", "photo.webp"]), "covers/catalog/photo.webp");
  assert.match(publicImageCacheHeaders("image/webp")["Vercel-CDN-Cache-Control"], /s-maxage=31536000/);
});

test("les lectures catalogue n’emportent ni description d’hôtel, ni clé, ni image fournisseur", () => {
  assert.equal(RANKING_ENTRY_COLUMNS.includes("description"), false);
  assert.equal(SUPPLIER_ROOM_COLUMNS.includes("images"), false);
  assert.equal(SUPPLIER_ROOM_COLUMNS.includes("raw"), false);
  assert.equal(SUPPLIER_ROOM_COLUMNS.includes("supplier_room_key"), false);
  assert.equal(contentSlug("../admin"), false);
  assert.deepEqual(textBlocks([{ question: "Quand partir ?", answer: "Au printemps." }]), [
    { title: "Quand partir ?", body: "Au printemps." },
  ]);
  const grouped = groupSupplierRooms([
    {
      supplier: "ratehawk",
      room_name: "Suite jardin",
      room_amenities: ["Bain", { name: "Vue" }],
      hotels: { slug: "hotel-paris", name: "Hôtel Paris", city: "Paris", is_published: true },
    },
  ]);
  assert.equal(grouped[0]?.rooms[0]?.roomName, "Suite jardin");
  assert.deepEqual(grouped[0]?.rooms[0]?.amenities, ["Bain", "Vue"]);
  assert.equal(JSON.stringify(grouped).includes("supplier_room_key"), false);
});
