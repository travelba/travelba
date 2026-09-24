import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export async function toCoverJpeg(bytes: Buffer) {
  const sharp = (await import("sharp")).default;
  return sharp(bytes, { failOn: "none" }).rotate().jpeg({ quality: 90 }).toBuffer();
}

export async function toCoverWebp(bytes: Buffer) {
  const sharp = (await import("sharp")).default;
  return sharp(bytes, { failOn: "none" })
    .rotate()
    .resize({ width: 1600, height: 900, fit: "cover", position: "attention" })
    .webp({ quality: 82 })
    .toBuffer();
}

export function coverSourceId(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 32);
}

export function publicCoverPath(photoId: string) {
  return path.join(process.cwd(), "public", "covers", `${photoId}.webp`);
}

export async function readPublicCover(photoId: string) {
  try {
    return await readFile(publicCoverPath(photoId));
  } catch {
    return null;
  }
}

export async function writePublicCover(photoId: string, bytes: Buffer) {
  try {
    const file = publicCoverPath(photoId);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return true;
  } catch (err) {
    console.error("[cover] public write", err instanceof Error ? err.name : "error");
    return false;
  }
}
