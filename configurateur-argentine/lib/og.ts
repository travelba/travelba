import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { officialUrlSet } from "./catalog";
import { isPublicHttpUrl, parseOfficialHtml, type FicheMedia } from "./fiche";

const CACHE_DIR = path.join(process.cwd(), "cache");
const inflight = new Map<string, Promise<FicheMedia>>();
const FAILURE_TTL_MS = 10 * 60 * 1000;
const HTML_LIMIT = 1_500_000;
const IMAGE_LIMIT = 5_000_000;

export function isAllowedOfficialUrl(raw: string): boolean {
  return officialUrlSet.has(raw);
}

function pageFile(url: string): string {
  const key = createHash("sha256").update(url).digest("hex");
  return path.join(CACHE_DIR, "fiches", `${key}.json`);
}

function imageId(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

function imageFile(id: string): string | null {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const root = path.resolve(CACHE_DIR, "images");
  const file = path.resolve(root, id);
  if (!file.startsWith(`${root}${path.sep}`)) return null;
  return file;
}

async function readLimited(response: Response, max: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > max) throw new Error("trop-volumineux");
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("trop-volumineux");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function fetchPublic(start: string, accept: string): Promise<{ response: Response; finalUrl: string; body: Buffer }> {
  let current = start;
  for (let hop = 0; hop < 4; hop += 1) {
    if (!isPublicHttpUrl(current)) throw new Error("url-refusee");
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "TravelbaConfigurateur/1.0 (+https://travelba.fr)",
        Accept: accept,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("redirect-vide");
      current = new URL(location, current).href;
      continue;
    }
    const limit = accept.startsWith("image") ? IMAGE_LIMIT : HTML_LIMIT;
    const body = await readLimited(response, limit);
    if (!response.ok) throw new Error(`http-${response.status}`);
    return { response, finalUrl: current, body };
  }
  throw new Error("trop-de-redirections");
}

async function storeImage(remoteUrl: string): Promise<{ id: string } | null> {
  try {
    const { response, body } = await fetchPublic(remoteUrl, "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8");
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/") || contentType.includes("svg")) return null;
    if (body.byteLength < 2048) return null;
    const id = imageId(remoteUrl);
    const file = imageFile(id);
    if (!file) return null;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.json`, JSON.stringify({ contentType }));
    return { id };
  } catch {
    return null;
  }
}

async function fetchAndCache(url: string): Promise<FicheMedia> {
  const file = pageFile(url);
  try {
    const fetched = await fetchPublic(url, "text/html,application/xhtml+xml");
    const html = fetched.body.toString("utf8");
    const parsed = parseOfficialHtml(html, fetched.finalUrl);
    const images: { id: string }[] = [];
    for (const imageUrl of parsed.imageUrls) {
      const stored = await storeImage(imageUrl);
      if (stored && !images.some((image) => image.id === stored.id)) images.push(stored);
      if (images.length >= 4) break;
    }
    const host = new URL(fetched.finalUrl).host;
    const media: FicheMedia = {
      url,
      title: parsed.title,
      description: parsed.description,
      images,
      sourceHost: host,
      fetchedAt: new Date().toISOString(),
      ok: Boolean(parsed.description || parsed.title || images.length),
      error: parsed.description || images.length ? undefined : "fiche-vide",
    };
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(media));
    return media;
  } catch (error) {
    const media: FicheMedia = {
      url,
      title: null,
      description: null,
      images: [],
      sourceHost: "",
      fetchedAt: new Date().toISOString(),
      ok: false,
      error: error instanceof Error ? error.message : "echec",
    };
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(media));
    return media;
  }
}

export async function getFiche(url: string, options?: { refresh?: boolean }): Promise<FicheMedia> {
  if (!isAllowedOfficialUrl(url)) {
    return {
      url,
      title: null,
      description: null,
      images: [],
      sourceHost: "",
      fetchedAt: new Date().toISOString(),
      ok: false,
      error: "url-non-autorisee",
    };
  }

  const file = pageFile(url);
  if (!options?.refresh) {
    try {
      const cached = JSON.parse(await readFile(file, "utf8")) as FicheMedia;
      const freshEnough =
        cached.ok || Date.now() - Date.parse(cached.fetchedAt) < FAILURE_TTL_MS;
      if (cached.url === url && freshEnough) return cached;
    } catch {
      /* pas de cache */
    }
  }

  const pending = inflight.get(url);
  if (pending && !options?.refresh) return pending;
  const job = fetchAndCache(url).finally(() => inflight.delete(url));
  inflight.set(url, job);
  return job;
}

export async function readCachedImage(id: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const file = imageFile(id);
  if (!file) return null;
  try {
    const [bytes, metaRaw] = await Promise.all([readFile(file), readFile(`${file}.json`, "utf8")]);
    const meta = JSON.parse(metaRaw) as { contentType?: string };
    if (!meta.contentType?.startsWith("image/")) return null;
    return { bytes, contentType: meta.contentType };
  } catch {
    return null;
  }
}
