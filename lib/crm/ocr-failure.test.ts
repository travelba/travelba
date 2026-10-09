import assert from "node:assert/strict";
import test from "node:test";
import { ocrRequestFailure } from "./ocr-failure";

test("une photo illisible n’est pas une panne du service", () => {
  assert.match(ocrRequestFailure(400, false) || "", /photo ne contient pas une pièce lisible/);
  assert.match(ocrRequestFailure(400, true) || "", /PDF ne contient pas une pièce lisible/);
  assert.match(ocrRequestFailure(503, false) || "", /indisponible temporairement/);
  assert.match(ocrRequestFailure(undefined, false) || "", /indisponible temporairement/);
  assert.equal(ocrRequestFailure(404, false), null);
});
