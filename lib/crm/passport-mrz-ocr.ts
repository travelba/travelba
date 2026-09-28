import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { parseMrzFromOcrAll } from "./mrz-parse";
import type { ExtractedIdentity } from "./identity";

function runTesseract(imagePath: string) {
  return new Promise<string>((resolve) => {
    const child = spawn(
      "tesseract",
      [imagePath, "stdout", "-l", "eng", "--psm", "6", "-c", "tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve("");
    }, 12_000);
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? Buffer.concat(chunks).toString("utf8") : "");
    });
  });
}

let tesseractReady: Promise<boolean> | null = null;

function hasTesseract() {
  if (!tesseractReady) {
    tesseractReady = new Promise((resolve) => {
      const child = spawn("tesseract", ["--version"], { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }
  return tesseractReady;
}

/** OCR local de la page redressée. Vide si le binaire tesseract est absent (Vercel). */
export async function ocrUprightPassport(jpeg: Buffer): Promise<{ text: string; identities: ExtractedIdentity[] }> {
  if (!(await hasTesseract())) return { text: "", identities: [] };
  const meta = await sharp(jpeg, { failOn: "none" }).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width < 40 || height < 40) return { text: "", identities: [] };
  const top = Math.floor(height * 0.68);
  const band = await sharp(jpeg, { failOn: "none" })
    .extract({ left: 0, top, width, height: height - top })
    .resize({ width: Math.min(width * 2, 2000) })
    .greyscale()
    .normalise()
    .png()
    .toBuffer();
  const dir = await mkdtemp(join(tmpdir(), "tb-mrz-"));
  try {
    const bandPath = join(dir, "band.png");
    await writeFile(bandPath, band);
    const text = await runTesseract(bandPath);
    const identities = parseMrzFromOcrAll(text).filter(
      (identity) => Boolean(identity.expires_on) || (identity.valid && Boolean(identity.birth_date))
    );
    return { text, identities };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
