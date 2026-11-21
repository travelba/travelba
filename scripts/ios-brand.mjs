/**
 * Icône App Store (1024, sans transparence), tailles iOS et splash marine.
 * Source : public/brand/logo-tba.png. Aucune donnée client.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const logoPath = join(root, "public/brand/logo-tba.png");
const out = join(root, "mobile/store-assets");
const NAVY = { r: 11, g: 25, b: 44, alpha: 1 };

const ICON_PIXELS = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

async function mark(size) {
  const source = await sharp(logoPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(source.data);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (r < 18 && g < 18 && b < 18) {
      pixels[i] = NAVY.r;
      pixels[i + 1] = NAVY.g;
      pixels[i + 2] = NAVY.b;
      pixels[i + 3] = 255;
    }
  }
  const painted = await sharp(pixels, {
    raw: { width: source.info.width, height: source.info.height, channels: 4 },
  })
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
  return sharp(painted).flatten({ background: NAVY }).png().toBuffer();
}

async function splash(width, height) {
  const logo = Math.round(Math.min(width, height) * 0.42);
  const markPng = await mark(logo);
  return sharp({
    create: { width, height, channels: 3, background: NAVY },
  })
    .composite([{ input: markPng, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function save(path, buffer) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
}

const icon1024 = await mark(1024);
await save(join(out, "icon-1024.png"), icon1024);
for (const size of ICON_PIXELS) {
  const file = size === 1024 ? icon1024 : await mark(size);
  await save(join(out, "icons", `icon-${size}.png`), file);
}
await save(join(out, "splash", "splash-1320x2868.png"), await splash(1320, 2868));
await save(join(out, "splash", "splash-1284x2778.png"), await splash(1284, 2778));
await save(join(out, "splash", "splash-logo.png"), await mark(800));
console.log("ios brand assets written");
