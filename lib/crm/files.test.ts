import assert from "node:assert/strict";
import test from "node:test";
import { safeFileName } from "./files";
import { safeFileName as fromIngestStorage } from "./ingest-storage";

test("safeFileName garde lettres, chiffres, point, tiret et souligné", () => {
  assert.equal(safeFileName("Billet_AF-123.pdf"), "Billet_AF-123.pdf");
  assert.equal(safeFileName("confirmation hôtel été.pdf"), "confirmation_h_tel_t_.pdf");
  assert.equal(safeFileName("photo (1).JPG"), "photo_1_.JPG");
});

test("safeFileName neutralise les séparateurs de chemin et les remontées", () => {
  assert.equal(safeFileName("../../etc/passwd"), ".._.._etc_passwd");
  assert.equal(safeFileName("dossier\\fichier.pdf"), "dossier_fichier.pdf");
  assert.equal(safeFileName("a/b/c.pdf").includes("/"), false);
  assert.equal(safeFileName("nul\u0000.pdf"), "nul_.pdf");
});

test("safeFileName tronque à 120 caractères et ne rend jamais vide", () => {
  const long = `${"a".repeat(200)}.pdf`;
  assert.equal(safeFileName(long).length, 120);
  assert.equal(safeFileName(""), "fichier");
  assert.equal(safeFileName("   ").length > 0, true);
});

test("ingest-storage réutilise la même fonction", () => {
  assert.equal(fromIngestStorage, safeFileName);
});
