import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PassFile } from "./wallet-sign";

const NAVY = { r: 11, g: 25, b: 44, alpha: 1 };

let cached: Promise<PassFile[]> | null = null;

/** Icône et logo du passe, depuis le visuel App Store. Marine si le fichier manque. */
export function walletPassImages() {
  if (!cached) {
    cached = build().catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

async function sourceIcon() {
  try {
    return await readFile(path.join(process.cwd(), "mobile/store-assets/icons/icon-180.png"));
  } catch {
    return sharp({ create: { width: 180, height: 180, channels: 4, background: NAVY } }).png().toBuffer();
  }
}

async function build(): Promise<PassFile[]> {
  const source = await sourceIcon();
  const [icon, icon2, logo, logo2] = await Promise.all([
    sharp(source).resize(29, 29, { fit: "cover" }).png().toBuffer(),
    sharp(source).resize(58, 58, { fit: "cover" }).png().toBuffer(),
    sharp(source).resize(160, 50, { fit: "contain", background: NAVY }).png().toBuffer(),
    sharp(source).resize(320, 100, { fit: "contain", background: NAVY }).png().toBuffer(),
  ]);
  return [
    { name: "icon.png", data: icon },
    { name: "icon@2x.png", data: icon2 },
    { name: "logo.png", data: logo },
    { name: "logo@2x.png", data: logo2 },
  ];
}
