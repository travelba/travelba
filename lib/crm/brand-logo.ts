import { readFile } from "node:fs/promises";
import { join } from "node:path";

export function isPng(bytes: Uint8Array) {
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

/** Badge TBA (256 px) pour les PDF. Le fichier public prime ; le texte base64 sert si le binaire n’est pas dans le déploiement. */
export async function loadBrandLogoPng(): Promise<Uint8Array | null> {
  const png = join(process.cwd(), "public", "brand", "logo-tba-256.png");
  const b64 = join(process.cwd(), "lib", "crm", "brand-logo.b64");
  try {
    const bytes = await readFile(png);
    if (isPng(bytes)) return bytes;
  } catch {
    /* le PNG public peut manquer */
  }
  try {
    const bytes = Buffer.from((await readFile(b64, "utf8")).replace(/\s+/g, ""), "base64");
    return isPng(bytes) ? bytes : null;
  } catch {
    return null;
  }
}
