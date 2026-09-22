import assert from "node:assert/strict";
import test from "node:test";
import {
  bottomIdentityRects,
  halfRects,
  isTwoUpLandscape,
  multiPassportCrops,
} from "./passport-split";

test("a landscape A4 scan of two open passports is two-up", () => {
  // 3150×2174 ≈ deux livrets côte à côte, pas assez large pour l’ancien seuil 1.7
  assert.equal(isTwoUpLandscape(3150, 2174), true);
  assert.equal(isTwoUpLandscape(1800, 1800), false);
  const crops = multiPassportCrops(3150, 2174);
  assert.equal(crops.length, 4);
  const halves = halfRects(3150, 2174, "x");
  assert.equal(halves[0].left, 0);
  assert.ok(halves[1].left < 3150 / 2);
  assert.ok(halves[0].width + halves[1].width > 3150);
  const bottoms = bottomIdentityRects(3150, 2174);
  assert.ok(bottoms[0].top >= 2174 / 2 - 100);
  assert.ok(bottoms[1].left >= 3150 / 2 - 150);
  assert.ok(bottoms[0].height > 900);
});
