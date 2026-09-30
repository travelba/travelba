import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WHATSAPP_IMAGE_KINDS, type WhatsappImageKind } from "./concierge-notices";

export function whatsappImageKind(name: string): WhatsappImageKind | null {
  const kind = name.endsWith(".jpg") ? name.slice(0, -4) : "";
  return (WHATSAPP_IMAGE_KINDS as readonly string[]).includes(kind) ? (kind as WhatsappImageKind) : null;
}

export function isJpeg(bytes: Uint8Array) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** JPEG du sujet. Le fichier public prime ; le texte base64 sert si le binaire n’est pas dans le déploiement. */
export async function loadWhatsappImage(kind: WhatsappImageKind): Promise<Uint8Array | null> {
  const jpg = join(process.cwd(), "public", "whatsapp", `${kind}.jpg`);
  const b64 = join(process.cwd(), "lib", "crm", "whatsapp-images", `${kind}.b64`);
  try {
    const bytes = await readFile(jpg);
    if (isJpeg(bytes)) return bytes;
  } catch {
    /* le JPEG public peut manquer */
  }
  try {
    const bytes = Buffer.from((await readFile(b64, "utf8")).replace(/\s+/g, ""), "base64");
    return isJpeg(bytes) ? bytes : null;
  } catch {
    return null;
  }
}
