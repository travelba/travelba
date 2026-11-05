import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedMapboxUpstream,
  fatalMapboxError,
  mapboxRefererFor,
  proxyMapboxGet,
  rewriteMapboxRequest,
  sameMapboxToken,
  sanitizeMapboxLog,
} from "./mapbox-proxy";

const TOKEN = `pk.${"a".repeat(24)}`;
const STYLE = `https://api.mapbox.com/styles/v1/mapbox/light-v11?access_token=${TOKEN}`;

test("le relais ne garde que les lectures Mapbox", () => {
  assert.equal(allowedMapboxUpstream(STYLE)?.hostname, "api.mapbox.com");
  assert.ok(allowedMapboxUpstream("https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/12/2048/1536.vector.pbf"));
  assert.ok(allowedMapboxUpstream("https://a.tiles.mapbox.com/v4/mapbox.mapbox-streets-v8/1/0/0.vector.pbf"));
  assert.ok(allowedMapboxUpstream("https://api.mapbox.com/fonts/v1/mapbox/Open%20Sans%20Regular/0-255.pbf"));
  assert.equal(allowedMapboxUpstream("https://api.mapbox.com/uploads/v1/secret"), null);
  assert.equal(allowedMapboxUpstream("https://evil.example/styles/v1/mapbox/light-v11"), null);
  assert.equal(allowedMapboxUpstream("http://api.mapbox.com/styles/v1/mapbox/light-v11"), null);
  assert.equal(allowedMapboxUpstream("https://api.mapbox.com/styles/v1/../../etc/passwd"), null);
  assert.equal(allowedMapboxUpstream("https://user:pw@api.mapbox.com/styles/v1/mapbox/x"), null);
});

test("l’appel du navigateur passe par notre origine, l’adresse Mapbox reste dans la requête", () => {
  const proxied = rewriteMapboxRequest(STYLE, "https://travelba.fr");
  assert.ok(proxied);
  const url = new URL(proxied || "");
  assert.equal(url.origin, "https://travelba.fr");
  assert.equal(url.pathname, "/api/mapbox");
  assert.equal(url.searchParams.get("url"), STYLE);
  assert.equal(rewriteMapboxRequest("https://evil.example/map", "https://travelba.fr"), null);
  assert.equal(rewriteMapboxRequest(STYLE, "javascript:alert(1)"), null);
});

test("le Referer envoyé à Mapbox est une adresse déjà autorisée", () => {
  assert.equal(mapboxRefererFor("https://travelba.fr"), "https://travelba.fr/");
  assert.equal(mapboxRefererFor("https://www.travelba.fr"), "https://www.travelba.fr/");
  assert.equal(mapboxRefererFor("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(mapboxRefererFor("http://127.0.0.1:3000"), "http://localhost:3000/");
  assert.equal(mapboxRefererFor("https://travelba-git-main-travelba.vercel.app"), "https://travelba.fr/");
});

test("le journal ne contient pas le jeton", () => {
  const cleaned = sanitizeMapboxLog(`Failed to fetch ${STYLE}`);
  assert.equal(cleaned.includes(TOKEN), false);
  assert.equal(/pk\.[A-Za-z0-9._-]{8,}/.test(cleaned), false);
  assert.match(cleaned, /access_token=\[redacted\]/);
  assert.equal(sameMapboxToken(TOKEN, TOKEN), true);
  assert.equal(sameMapboxToken(TOKEN, `${TOKEN}x`), false);
  assert.equal(sameMapboxToken(TOKEN, `pk.${"b".repeat(24)}`), false);
  assert.equal(sameMapboxToken("", TOKEN), false);
});

test("une tuile refusée ou un WebGL mort remplace la carte, pas un événement", () => {
  assert.equal(fatalMapboxError({ status: 401, message: "Unauthorized" }), "mapbox 401");
  assert.equal(fatalMapboxError({ status: 403, message: "Forbidden" }), "mapbox 403");
  assert.equal(fatalMapboxError(new Error("Failed to initialize WebGL")), "webgl");
  assert.equal(
    fatalMapboxError(new Error("A valid Mapbox access token is required to use Mapbox GL JS.")),
    "jeton refusé"
  );
  assert.equal(fatalMapboxError(new Error(`Failed to fetch ${STYLE}`)), "mapbox injoignable");
  assert.equal(fatalMapboxError(new Error("Failed to fetch https://events.mapbox.com/events/v2")), null);
  assert.equal(fatalMapboxError(new Error("Image missing")), null);
  assert.equal(fatalMapboxError(new Error(`Failed to fetch ${STYLE}`))?.includes(TOKEN), false);
});

test("le relais pose le Referer et refuse un autre jeton", async () => {
  const seen: { url?: string; referer?: string | null } = {};
  const ok = await proxyMapboxGet({
    requestUrl: `https://travelba.fr/api/mapbox?url=${encodeURIComponent(STYLE)}`,
    token: TOKEN,
    fetchImpl: async (input, init) => {
      seen.url = String(input);
      seen.referer = new Headers(init?.headers).get("Referer");
      return new Response(JSON.stringify({ layers: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  assert.equal(ok.status, 200);
  assert.equal(seen.url, STYLE);
  assert.equal(seen.referer, "https://travelba.fr/");
  assert.equal((await ok.json()).layers.length, 0);

  const foreign = await proxyMapboxGet({
    requestUrl: `https://travelba.fr/api/mapbox?url=${encodeURIComponent(STYLE)}`,
    token: `pk.${"b".repeat(24)}`,
    fetchImpl: async () => {
      throw new Error("ne doit pas partir");
    },
  });
  assert.equal(foreign.status, 404);

  const down = await proxyMapboxGet({
    requestUrl: `http://localhost:3000/api/mapbox?url=${encodeURIComponent(STYLE)}`,
    token: TOKEN,
    fetchImpl: async () => {
      throw new Error("réseau");
    },
  });
  assert.equal(down.status, 502);
});
