import { generatedCityCoverSpec } from "@/lib/crm/cover-catalog";
import { describePlace } from "@/lib/crm/cover-geo";
import { readPublicCover, toCoverWebp, writePublicCover } from "@/lib/crm/cover-file";
import { catalogCachePath, cityCoverAuthFailed, generateCityCoverBytes } from "@/lib/crm/cover-retouch";
import { downloadCrmFile, uploadCrmFile } from "@/lib/crm/files";

const inflight = new Map<string, Promise<Buffer | null>>();
const failures = new Set<string>();
let chain: Promise<void> = Promise.resolve();

async function readCachedCover(photoId: string) {
  try {
    const file = await downloadCrmFile(catalogCachePath(photoId));
    if (file.bytes.byteLength) return Buffer.from(file.bytes);
  } catch {
    /* pas encore en cache */
  }
  return readPublicCover(photoId);
}

async function createCityCover(photoId: string, force: boolean) {
  const spec = generatedCityCoverSpec(photoId);
  if (!spec) return null;
  if (!force) {
    const cached = await readCachedCover(photoId);
    if (cached?.byteLength) return cached;
  }
  if (cityCoverAuthFailed()) return null;
  let geo: { country: string; state: string; type: string } | null = null;
  try {
    geo = await Promise.race([
      describePlace(spec.place),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
  } catch {
    geo = null;
  }
  const country = spec.country || geo?.country || "";
  const raw = await generateCityCoverBytes(spec.place, country, undefined, geo);
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

/** JPEG ou WebP déjà en cache ou dans le catalogue public. */
export async function cityCoverCached(photoId: string) {
  if (!generatedCityCoverSpec(photoId)) return false;
  const cached = await readCachedCover(photoId);
  return Boolean(cached?.byteLength);
}

/** La dernière génération de ce lieu a échoué, et aucune n'est en cours. */
export function cityCoverFailed(photoId: string) {
  return failures.has(photoId) && !inflight.has(photoId);
}

/**
 * Une génération à la fois, partagée par les vignettes.
 * Le fichier déjà là est rendu tout de suite. L'appelant n'a pas à attendre l'image.
 */
export function enqueueCityCover(photoId: string) {
  if (!generatedCityCoverSpec(photoId)) return Promise.resolve(null);
  if (failures.has(photoId) && cityCoverAuthFailed()) return Promise.resolve(null);
  const pending = inflight.get(photoId);
  if (pending) return pending;
  failures.delete(photoId);
  const job = chain.then(() => createCityCover(photoId, false));
  const tracked = job.then((bytes) => {
    if (!bytes?.byteLength) failures.add(photoId);
    else failures.delete(photoId);
    return bytes;
  });
  inflight.set(photoId, tracked);
  chain = tracked.then(
    () => undefined,
    () => undefined
  );
  void tracked.finally(() => {
    if (inflight.get(photoId) === tracked) inflight.delete(photoId);
  });
  return tracked;
}

/** Fichier déjà là, sinon une seule génération pour cette ville. */
export function ensureCityCover(photoId: string) {
  return enqueueCityCover(photoId);
}

/** Nouvelle image, même si un fichier existe. Geste explicite (script, Autre version). */
export async function rebuildCityCover(photoId: string) {
  if (!generatedCityCoverSpec(photoId)) return null;
  failures.delete(photoId);
  const bytes = await createCityCover(photoId, true);
  if (!bytes?.byteLength) failures.add(photoId);
  else failures.delete(photoId);
  return bytes;
}
