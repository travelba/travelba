import assert from "node:assert/strict";
import test from "node:test";
import { sharePiece } from "./share-piece";

test("hors de l’app, le partage retombe sur le téléchargement", async () => {
  assert.equal(await sharePiece({ url: "https://travelba.fr/api/files?path=a", title: "Pièce" }), "download");
});
