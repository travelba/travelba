import assert from "node:assert/strict";
import test from "node:test";
import { securityHeaders, staticCacheHeaders } from "./security-headers";

test("toutes les pages gardent l’encadrement same-origin : les aperçus PDF en iframe doivent s’ouvrir", () => {
  const rules = securityHeaders();
  const all = rules.find((rule) => rule.source === "/:path*");
  assert.ok(all);
  const frame = all.headers.find((header) => header.key === "X-Frame-Options");
  assert.equal(frame?.value, "SAMEORIGIN");
  const deny = rules.flatMap((rule) => rule.headers).filter((header) => header.value === "DENY");
  assert.equal(deny.length, 0);
  assert.equal(all.headers.find((h) => h.key === "Referrer-Policy")?.value, "strict-origin-when-cross-origin");
  assert.equal(all.headers.find((h) => h.key === "X-Content-Type-Options")?.value, "nosniff");
  assert.equal(
    all.headers.find((h) => h.key === "Permissions-Policy")?.value,
    "camera=(), microphone=(), geolocation=()"
  );
  assert.equal(rules.flatMap((rule) => rule.headers).some((h) => h.key === "Content-Security-Policy"), false);
});

test("la vidéo et le badge se cachent un an, le HTML n’est pas figé", () => {
  const rules = staticCacheHeaders();
  for (const source of ["/videos/:path*", "/brand/:path*"]) {
    const rule = rules.find((item) => item.source === source);
    assert.ok(rule);
    assert.equal(rule.headers.find((header) => header.key === "Cache-Control")?.value, "public, max-age=31536000, immutable");
  }
  assert.equal(
    rules.some((rule) => rule.source === "/:path*"),
    false
  );
});
