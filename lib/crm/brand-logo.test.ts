import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { isPng, loadBrandLogoPng } from "./brand-logo";

function pngSize(bytes: Buffer) {
  assert.equal(bytes[0], 0x89);
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test("le badge TBA des PDF est un PNG, et sa copie base64 suit le fichier public", async () => {
  const bytes = await loadBrandLogoPng();
  assert.ok(bytes);
  assert.equal(isPng(bytes), true);
  const fromPublic = await readFile("public/brand/logo-tba-256.png");
  const fromB64 = Buffer.from((await readFile("lib/crm/brand-logo.b64", "utf8")).replace(/\s+/g, ""), "base64");
  assert.equal(Buffer.compare(fromPublic, fromB64), 0);
  assert.deepEqual(pngSize(fromPublic), { width: 256, height: 256, colorType: 6 });
});

test("le médaillon source reste le PNG 1280 fourni, coins compris", async () => {
  const master = await readFile("public/brand/logo-tba.png");
  assert.equal(
    createHash("sha256").update(master).digest("hex"),
    "1f54eef35f3b856b6b68842be76033c4d9afa46caa6c38e137ced348796a68c7",
  );
  assert.deepEqual(pngSize(master), { width: 1280, height: 1280, colorType: 6 });
  for (const [file, size] of [
    ["public/favicon-32.png", 32],
    ["public/favicon-48.png", 48],
    ["public/apple-touch-icon.png", 180],
    ["public/icon-192.png", 192],
    ["public/icon-512.png", 512],
  ] as const) {
    assert.deepEqual(pngSize(await readFile(file)), { width: size, height: size, colorType: 6 });
  }
});
