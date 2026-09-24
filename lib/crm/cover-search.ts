import { lookup } from "node:dns/promises";

const OPENVERSE = "https://api.openverse.org/v1/images/";
const USER_AGENT = "Travelba/1.0 (https://travelba.fr; cover)";
const PHOTO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LICENSES = new Set(["cc0", "pdm", "by"]);
const SKIP_TITLE =
  /\b(logo|drapeau|blason|locator|flag|coat of arms|icon|diagram|svg)\b/i;
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export type CoverSearchHit = {
  id: string;
  title: string;
  thumb: string;
  credit: string | null;
};

export function normalizeCoverSearchQuery(raw: string) {
  const cleaned = raw.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (cleaned.length < 2) return null;
  return cleaned;
}

export function isCoverPhotoId(value: string) {
  return PHOTO_ID.test(value);
}

export function coverCreditLabel(license: string, creator: unknown) {
  if (license === "cc0" || license === "pdm") return null;
  if (license !== "by") return null;
  const name = typeof creator === "string" ? creator.trim() : "";
  if (name.length < 2 || !/[0-9A-Za-zÀ-ÿ]/.test(name) || /^[*_\s.-]+$/.test(name)) {
    return "Photo · CC BY";
  }
  return `Photo : ${name.slice(0, 60)} · CC BY`;
}

export function coverSearchUrl(query: string, wide = true) {
  const params = new URLSearchParams({
    q: query,
    license: "cc0,pdm,by",
    category: "photograph",
    mature: "false",
    page_size: "20",
  });
  if (wide) params.set("aspect_ratio", "wide");
  return `${OPENVERSE}?${params.toString()}`;
}

function plainTitle(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function hitFromRow(row: unknown, minWidth: number): CoverSearchHit | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!isCoverPhotoId(id)) return null;
  const license = typeof record.license === "string" ? record.license : "";
  if (!LICENSES.has(license)) return null;
  const width = typeof record.width === "number" ? record.width : 0;
  const height = typeof record.height === "number" ? record.height : 0;
  if (width < minWidth || height < 400 || width < height * 1.15) return null;
  const title = plainTitle(record.title);
  if (title && SKIP_TITLE.test(title)) return null;
  return {
    id,
    title: title || "Photo",
    thumb: `${OPENVERSE}${id}/thumb/`,
    credit: coverCreditLabel(license, record.creator),
  };
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/** La ville dans le titre passe devant les séries « challenge / unpublished ». */
export function rankCoverHits(hits: CoverSearchHit[], query: string) {
  const q = fold(query);
  function score(hit: CoverSearchHit) {
    const title = fold(hit.title);
    let value = 0;
    if (q && title.includes(q)) value += 2;
    if (/\b(challenge|unpublished)\b/i.test(hit.title)) value -= 3;
    return value;
  }
  return [...hits].sort((a, b) => score(b) - score(a));
}

export function coverHitsFromOpenverse(payload: unknown, minWidth = 900) {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: CoverSearchHit[] = [];
  const seen = new Set<string>();
  for (const row of results) {
    const hit = hitFromRow(row, minWidth);
    if (!hit || seen.has(hit.id)) continue;
    seen.add(hit.id);
    hits.push(hit);
    if (hits.length >= 12) break;
  }
  return hits;
}

function isPrivateIpv4(host: string) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isLocalIpv6(address: string) {
  const host = address.toLowerCase();
  if (host === "::1" || host === "::") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  return false;
}

function isPublicAddress(address: string) {
  const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
  if (mapped.includes(".")) return !isPrivateIpv4(mapped);
  return !isLocalIpv6(address);
}

/** HTTPS public hostname. No credentials, no IP literals, no link-local names. */
export function isSafeCoverImageUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "metadata.google.internal" || host.endsWith(".arpa")) return false;
  if (host.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}

async function hostIsPublic(hostname: string) {
  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => isPublicAddress(record.address));
  } catch {
    return false;
  }
}

async function readLimited(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("empty");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("size");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function getJson(fetchImpl: typeof fetch, url: string) {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 429) {
    const error = new Error("Recherche momentanément indisponible.");
    error.name = "CoverSearchError";
    throw error;
  }
  if (!response.ok) {
    const error = new Error("Recherche photo impossible.");
    error.name = "CoverSearchError";
    throw error;
  }
  return response.json();
}

export async function searchCoverPhotos(query: string, fetchImpl: typeof fetch = fetch) {
  const q = normalizeCoverSearchQuery(query);
  if (!q) return [];
  const wide = coverHitsFromOpenverse(await getJson(fetchImpl, coverSearchUrl(q, true)));
  if (wide.length >= 6) return rankCoverHits(wide, q);
  const loose = coverHitsFromOpenverse(await getJson(fetchImpl, coverSearchUrl(q, false)));
  const seen = new Set(wide.map((hit) => hit.id));
  const hits = [...wide];
  for (const hit of loose) {
    if (seen.has(hit.id)) continue;
    hits.push(hit);
    if (hits.length >= 12) break;
  }
  return rankCoverHits(hits, q);
}

export type CoverPhotoFile = {
  url: string;
  credit: string | null;
};

export function coverFileFromOpenverse(payload: unknown): CoverPhotoFile | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const license = typeof record.license === "string" ? record.license : "";
  if (!LICENSES.has(license)) return null;
  const url = typeof record.url === "string" ? record.url : "";
  if (!isSafeCoverImageUrl(url)) return null;
  return { url, credit: coverCreditLabel(license, record.creator) };
}

export async function loadCoverPhoto(id: string, fetchImpl: typeof fetch = fetch) {
  if (!isCoverPhotoId(id)) return null;
  const payload = await getJson(fetchImpl, `${OPENVERSE}${id}/`);
  return coverFileFromOpenverse(payload);
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/octet-stream",
  "binary/octet-stream",
]);

export async function downloadCoverImage(startUrl: string, fetchImpl: typeof fetch = fetch) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isSafeCoverImageUrl(current)) throw new Error("url");
    const host = new URL(current).hostname;
    if (!(await hostIsPublic(host))) throw new Error("url");
    const response = await fetchImpl(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg",
        "User-Agent": USER_AGENT,
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("url");
      current = new URL(location, current).href;
      continue;
    }
    if (!response.ok) throw new Error("http");
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type && !IMAGE_TYPES.has(type)) throw new Error("type");
    return readLimited(response, MAX_BYTES);
  }
  throw new Error("url");
}
