import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_CRAWLER_AGENTS,
  catalogueCrawlerDecision,
  isMcpPath,
  isSearchCrawler,
  publicImageCacheHeaders,
  publicRobots,
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
    const decision = catalogueCrawlerDecision({ path, userAgent: "GPTBot", ip: "1.1.1.1", now: 1_000 }, new Map());
    assert.equal(decision.action, "pass");
  }
  const home = catalogueCrawlerDecision({ path: "/fr", userAgent: "GPTBot", now: 1 }, new Map());
  assert.equal(home.action, "pass");
});

test("les pages catalogue My Concierge ne sont plus limitées : elles répondent 404", () => {
  for (const path of [
    "/fr/classement",
    "/fr/classement/top-four-seasons-palaces-monde",
    "/en/guide",
    "/en/guide/paris",
    "/guide",
    "/fr/donnees-fournisseur",
    "/donnees-fournisseur/hotel-paris",
    "/api/media/catalogue/covers/a.webp",
  ]) {
    const decision = catalogueCrawlerDecision({ path, userAgent: "ClaudeBot", ip: "2.2.2.2", now: 5 }, new Map());
    assert.equal(decision.action, "pass");
  }
});

test("les robots d’IA sont limités sur les couvertures, Google passe", () => {
  const cover = catalogueCrawlerDecision({ path: "/api/covers/photo-paris", userAgent: "GPTBot", now: 5 }, new Map());
  assert.equal(cover.action, "limit");
  assert.equal(cover.retryAfter, 86_400);

  const coverSearch = catalogueCrawlerDecision({ path: "/api/covers/photo-paris", userAgent: GOOGLE, now: 5 }, new Map());
  assert.equal(coverSearch.action, "pass");

  const reader = catalogueCrawlerDecision({ path: "/fr/hotels/crillon", userAgent: BROWSER, now: 5 }, new Map());
  assert.equal(reader.action, "pass");

  const client = catalogueCrawlerDecision(
    { path: "/api/client/hotels/search", userAgent: "python-requests/2", now: 5 },
    new Map()
  );
  assert.equal(client.action, "pass");
});

test("un robot générique est limité après trente lectures des couvertures", () => {
  const store = new Map<string, number[]>();
  const ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0)";
  for (let index = 0; index < 30; index += 1) {
    const decision = catalogueCrawlerDecision(
      { path: "/api/covers/photo-paris", userAgent: ua, ip: "9.9.9.9", now: 10_000 + index },
      store
    );
    assert.equal(decision.action, "pass");
  }
  const blocked = catalogueCrawlerDecision(
    { path: "/en/hotels/crillon", userAgent: ua, ip: "9.9.9.9", now: 10_040 },
    store
  );
  assert.equal(blocked.action, "limit");
  assert.equal(blocked.retryAfter, 60);
});

test("les couvertures publiques restent en cache long", () => {
  const headers = publicImageCacheHeaders("image/webp");
  assert.equal(headers["Content-Type"], "image/webp");
  assert.match(headers["Cache-Control"], /max-age=31536000/);
  assert.match(headers["Vercel-CDN-Cache-Control"], /s-maxage=31536000/);
});
