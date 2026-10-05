import assert from "node:assert/strict";
import test from "node:test";
import { securityHeaders } from "./security-headers";

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
