import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { mrzBandScore, uprightPassport } from "./passport-orient";

async function pageWithMrzAtBottom() {
  const width = 360;
  const height = 240;
  const raw = Buffer.alloc(width * height, 240);
  for (let y = 200; y < 230; y++) {
    for (let x = 0; x < width; x++) {
      raw[y * width + x] = x % 2 === 0 ? 0 : 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 1 } }).jpeg({ quality: 90 }).toBuffer();
}

test("a sideways scan is turned so the MRZ band sits at the bottom", async () => {
  const upright = await pageWithMrzAtBottom();
  const sideways = await sharp(upright).rotate(90).toBuffer();
  const before = await mrzBandScore(sideways);
  assert.ok(before.frac < 0.55);
  const fixed = await uprightPassport(new Uint8Array(sideways));
  const after = await mrzBandScore(fixed);
  assert.ok(after.frac >= 0.7);
  assert.ok(after.score > before.score);
});
