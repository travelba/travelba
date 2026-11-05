import assert from "node:assert/strict";
import test from "node:test";
import { GUARANTEE_COPY, GUARANTEE_VARIANTS, guaranteeFrameState, guaranteeVariant } from "./hotel-guarantee";

test("les trois cadres restent dans la voix de l’agence", () => {
  assert.deepEqual(
    GUARANTEE_VARIANTS.map((item) => item.option),
    ["A", "B", "C"]
  );
  const text = JSON.stringify({ GUARANTEE_COPY, GUARANTEE_VARIANTS });
  assert.doesNotMatch(text, /little\s*emperors/i);
  assert.match(GUARANTEE_COPY.title, /Garantie de la réservation/);
  assert.match(GUARANTEE_COPY.trust, /garantie/);
  assert.equal(guaranteeVariant("salon"), "salon");
  assert.equal(guaranteeVariant("autre"), "nuit");
  assert.equal(guaranteeFrameState("enregistree"), "enregistree");
  assert.equal(guaranteeFrameState(undefined), "prete");
});
