import assert from "node:assert/strict";
import test from "node:test";
import {
  apiKeyUsable,
  hashMcpApiKey,
  isPersonalApiKey,
  issueMcpApiKey,
  mcpActorSlug,
  mcpApiKeyHashEquals,
  mcpKeyLabelError,
  mcpMemberEmailError,
  memberNameFromEmail,
  parseKeyExpiry,
  parseMcpMemberRole,
  personalKeyPrefix,
  staffKeyName,
} from "./mcp-api-key";
import { previewMcpTool } from "./mcp-registry";

test("une clé nominative n’est gardée qu’en empreinte", () => {
  const issued = issueMcpApiKey();
  assert.match(issued.prefix, /^tbk_[a-f0-9]{8}$/);
  assert.equal(personalKeyPrefix(issued.token), issued.prefix);
  assert.equal(isPersonalApiKey(issued.token), true);
  assert.equal(issued.hash, hashMcpApiKey(issued.token));
  assert.equal(issued.hash.includes(issued.token), false);
  assert.equal(mcpApiKeyHashEquals(issued.token, issued.hash), true);
  assert.equal(mcpApiKeyHashEquals(`${issued.token}x`, issued.hash), false);
  assert.equal(mcpApiKeyHashEquals(issued.token, "ab"), false);
  assert.equal(isPersonalApiKey("secret-general"), false);
  assert.equal(personalKeyPrefix("tbk_short"), null);
});

test("une clé révoquée, expirée ou d’un accès coupé est refusée", () => {
  const now = Date.parse("2026-11-02T12:00:00.000Z");
  assert.equal(apiKeyUsable({ revokedAt: null, expiresAt: null, staffActive: true }, now), true);
  assert.equal(apiKeyUsable({ revokedAt: "2026-11-01T00:00:00.000Z", expiresAt: null, staffActive: true }, now), false);
  assert.equal(apiKeyUsable({ revokedAt: null, expiresAt: "2026-11-02T12:00:00.000Z", staffActive: true }, now), false);
  assert.equal(apiKeyUsable({ revokedAt: null, expiresAt: "2026-11-03T00:00:00.000Z", staffActive: true }, now), true);
  assert.equal(apiKeyUsable({ revokedAt: null, expiresAt: null, staffActive: false }, now), false);
});

test("l’expiration et le membre @travelba.fr", () => {
  const now = Date.parse("2026-11-02T12:00:00.000Z");
  assert.deepEqual(parseKeyExpiry("", now), { expiresAt: null });
  assert.deepEqual(parseKeyExpiry("2026-11-01", now), { error: "La date d’expiration est déjà passée." });
  assert.equal("error" in parseKeyExpiry("02/11/2026", now), true);
  const later = parseKeyExpiry("2026-12-01", now);
  assert.equal("expiresAt" in later && later.expiresAt?.startsWith("2026-12-01"), true);
  assert.equal(mcpMemberEmailError("raphael@travelba.fr"), null);
  assert.match(mcpMemberEmailError("raphael@gmail.com") || "", /travelba\.fr/);
  assert.equal(memberNameFromEmail("raphael@travelba.fr"), "Raphael");
  assert.equal(parseMcpMemberRole("admin"), "admin");
  assert.equal(parseMcpMemberRole("manager"), null);
  assert.equal(mcpKeyLabelError("  "), "Indiquez un libellé.");
  assert.equal(staffKeyName("Raphael Cohen", "raphael@travelba.fr"), "Raphael");
  assert.equal(mcpActorSlug("Raphaël"), "raphael");
});

test("la réponse de création garde la clé une fois et rien d’autre de secret", () => {
  const token = issueMcpApiKey().token;
  const shown = JSON.parse(
    previewMcpTool("creer_cle_api", { cle: token, api_key: token, token }).content[0].text
  ) as Record<string, unknown>;
  assert.equal(shown.cle, token);
  assert.equal("api_key" in shown, false);
  assert.equal("token" in shown, false);
});
