import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { isPng, loadBrandLogoPng } from "./brand-logo";

test("le badge TBA des PDF est un PNG, et sa copie base64 suit le fichier public", async () => {
  const bytes = await loadBrandLogoPng();
  assert.ok(bytes);
  assert.equal(isPng(bytes), true);
  const fromPublic = await readFile("public/brand/logo-tba-256.png");
  const fromB64 = Buffer.from((await readFile("lib/crm/brand-logo.b64", "utf8")).replace(/\s+/g, ""), "base64");
  assert.equal(Buffer.compare(fromPublic, fromB64), 0);
});
