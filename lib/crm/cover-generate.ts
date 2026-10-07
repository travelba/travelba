import { generatedCityCoverSpec } from "@/lib/crm/cover-catalog";
import { readPublicCover, toCoverWebp, writePublicCover } from "@/lib/crm/cover-file";
import { catalogCachePath, generateCityCoverBytes } from "@/lib/crm/cover-retouch";
import { downloadCrmFile, uploadCrmFile } from "@/lib/crm/files";

const inflight = new Map<string, Promise<Buffer | null>>();

async function readCachedCover(photoId: string) {
  try {
    const file = await downloadCrmFile(catalogCachePath(photoId));
    if (file.bytes.byteLength) return Buffer.from(file.bytes);
  } catch {
    /* pas encore en cache */
  }
  return readPublicCover(photoId);
}

async function createCityCover(photoId: string) {
  const spec = generatedCityCoverSpec(photoId);
  if (!spec) return null;
  const cached = await readCachedCover(photoId);
  if (cached?.byteLength) return cached;
  const raw = await generateCityCoverBytes(spec.place, spec.country);
  if (!raw) return null;
  let webp: Buffer;
  try {
    webp = await toCoverWebp(raw);
  } catch (err) {
    console.error("[cover-generate] webp", err instanceof Error ? err.name : "error");
    return null;
  }
  if (!webp.byteLength) return null;
  try {
    await uploadCrmFile(catalogCachePath(photoId), webp, "image/webp", { upsert: true });
  } catch (err) {
    console.error("[cover-generate] cache", err instanceof Error ? err.name : "error");
  }
  await writePublicCover(photoId, webp);
  return webp;
}

/** Fichier déjà là, sinon une seule génération pour cette ville. */
export function ensureCityCover(photoId: string) {
  if (!generatedCityCoverSpec(photoId)) return Promise.resolve(null);
  const pending = inflight.get(photoId);
  if (pending) return pending;
  const job = createCityCover(photoId).finally(() => {
    inflight.delete(photoId);
  });
  inflight.set(photoId, job);
  return job;
}
