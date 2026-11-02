import assert from "node:assert/strict";
import test from "node:test";
import { maskAuditText, toAuditRow } from "./audit-events";

test("le journal masque la MRZ, le passeport et la carte", () => {
  const mrz = "P<FRADUPONT<<LEA<<<<<<<<<<<<<<<<<<<<<<<<";
  const text = maskAuditText(`${mrz}\nPasseport AB3456789\nCarte 4242424242424242`);
  assert.equal(text.includes(mrz), false);
  assert.match(text, /MRZ •••/);
  assert.equal(text.includes("AB3456789"), false);
  assert.match(text, /•••789/);
  assert.equal(text.includes("4242424242424242"), false);
  assert.match(text, /\[carte\]|masqué/);
});

test("une décision d’import n’écrit que le résumé masqué", () => {
  const row = toAuditRow({
    actorKind: "auto",
    action: "ignore",
    summary: "Code de connexion",
    detail: { passport: "AB3456789", tier: "human" },
  });
  assert.equal(row.actor_kind, "auto");
  assert.equal(String(row.detail.passport).includes("AB3456789"), false);
  assert.match(String(row.detail.passport), /•••789/);
  assert.equal(row.detail.tier, "human");
});
