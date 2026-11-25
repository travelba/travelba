/**
 * Icône App Store (1024, sans transparence) et splash.
 * Le mot TBA vient du logo du dépôt, sans le filet ni la mention
 * « Travel Business Agency », agrandi et centré dans le cercle.
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const logoPath = join(root, "public/brand/logo-tba.png");
const out = join(root, "mobile/store-assets");
const NAVY = { r: 11, g: 25, b: 44 };

const ICON_PIXELS = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024];

/** Bande des lettres TBA dans logo-tba.png (1280). Le filet est vers y 744, la mention vers y 804. */
const LETTERS = { left: 290, top: 436, width: 710, height: 270 };

function isGold(r, g, b, a) {
  return a > 40 && r > 150 && g > 120 && b < 190 && r > b + 20;
}

async function tbaGlyph() {
  const source = await sharp(logoPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, channels } = source.info;
  const pixels = Buffer.alloc(LETTERS.width * LETTERS.height * 4);
  for (let y = 0; y < LETTERS.height; y += 1) {
    for (let x = 0; x < LETTERS.width; x += 1) {
      const sourceIndex = ((y + LETTERS.top) * width + (x + LETTERS.left)) * channels;
      const target = (y * LETTERS.width + x) * 4;
      const red = source.data[sourceIndex];
      const green = source.data[sourceIndex + 1];
      const blue = source.data[sourceIndex + 2];
      const alpha = source.data[sourceIndex + 3];
      if (!isGold(red, green, blue, alpha)) continue;
      pixels[target] = 197;
      pixels[target + 1] = 168;
      pixels[target + 2] = 128;
      pixels[target + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width: LETTERS.width, height: LETTERS.height, channels: 4 } })
    .trim()
    .png()
    .toBuffer();
}

const glyph = await tbaGlyph();
const glyphMeta = await sharp(glyph).metadata();

async function mark(size) {
  const ringInset = size * 0.055;
  const stroke = Math.max(1, Math.round(size * 0.011));
  const radius = size / 2 - ringInset - stroke / 2;
  const inner = radius * 2 - stroke * 2;
  const targetW = Math.round(inner * 0.8);
  const targetH = Math.round((glyphMeta.height / glyphMeta.width) * targetW);
  const letters = await sharp(glyph).resize(targetW, targetH, { fit: "fill" }).png().toBuffer();
  const left = Math.round((size - targetW) / 2);
  const top = Math.round((size - targetH) / 2 - size * 0.018);
  const ring = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#C5A880" stroke-width="${stroke}"/></svg>`
  );
  return sharp({ create: { width: size, height: size, channels: 3, background: NAVY } })
    .composite([
      { input: ring, top: 0, left: 0 },
      { input: letters, top, left },
    ])
    .flatten({ background: NAVY })
    .removeAlpha()
    .png()
    .toBuffer();
}

async function splash(width, height) {
  const markSize = Math.round(Math.min(width, height) * 0.72);
  const icon = await mark(markSize);
  return sharp({ create: { width, height, channels: 3, background: NAVY } })
    .composite([{ input: icon, gravity: "centre" }])
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
const square = await splash(2732, 2732);
const splashDir = join(root, "mobile/ios/App/App/Assets.xcassets/Splash.imageset");
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await writeFile(join(splashDir, name), square);
}
await copyFile(join(out, "icon-1024.png"), join(root, "mobile/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
await save(join(out, "splash", "splash-1320x2868.png"), await splash(1320, 2868));
await save(join(out, "splash", "splash-1284x2778.png"), await splash(1284, 2778));
await save(join(out, "splash", "splash-logo.png"), icon1024);
const meta = await sharp(join(out, "icon-1024.png")).metadata();
console.log("icon", meta.width, meta.height, "alpha", meta.hasAlpha);
