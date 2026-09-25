import assert from "node:assert/strict";
import test from "node:test";
import { clientShellHome, isClientShellUserAgent } from "./client-shell";

test("le navigateur n’est pas la coque", () => {
  assert.equal(isClientShellUserAgent("Mozilla/5.0"), false);
  assert.equal(clientShellHome("/admin", "Mozilla/5.0"), null);
});

test("la coque renvoie l’admin vers l’espace", () => {
  const ua = "Mozilla/5.0 TravelbaEspace";
  assert.equal(clientShellHome("/admin", ua), "/mon-compte");
  assert.equal(clientShellHome("/admin/clients", ua), "/mon-compte");
  assert.equal(clientShellHome("/mon-compte/reservations", ua), null);
});
