export type FicheMedia = {
  url: string;
  title: string | null;
  description: string | null;
  images: { id: string }[];
  sourceHost: string;
  fetchedAt: string;
  ok: boolean;
  error?: string;
};

export type ParsedPage = {
  title: string | null;
  description: string | null;
  imageUrls: string[];
};

const SKIP_IMAGE = /logo|icon|sprite|pixel|favicon|badge|spinner|arrow|button|placeholder|blank|1x1|tracking/i;

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "0.0.0.0" || host === "::1" || host === "::") return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return false;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0 || a === 169) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 700 ? `${text.slice(0, 697).trimEnd()}…` : text;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, "i"));
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? null;
}

function resolveAgainst(value: string, pageUrl: string): string | null {
  try {
    const url = new URL(decodeEntities(value), pageUrl);
    if (!isPublicHttpUrl(url.href)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function walkJsonLd(node: unknown, acc: { descriptions: string[]; images: string[] }, depth: number) {
  if (!node || depth > 8) return;
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, acc, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  if (typeof record.description === "string") acc.descriptions.push(record.description);
  const image = record.image;
  if (typeof image === "string") acc.images.push(image);
  else if (Array.isArray(image)) {
    for (const item of image) {
      if (typeof item === "string") acc.images.push(item);
      else if (item && typeof item === "object" && typeof (item as { url?: string }).url === "string") {
        acc.images.push((item as { url: string }).url);
      }
    }
  } else if (image && typeof image === "object" && typeof (image as { url?: string }).url === "string") {
    acc.images.push((image as { url: string }).url);
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") walkJsonLd(value, acc, depth + 1);
  }
}

export function parseOfficialHtml(html: string, pageUrl: string): ParsedPage {
  const metas: { prop: string; content: string }[] = [];
  for (const tag of html.match(/<meta\s+[^>]*>/gi) ?? []) {
    const prop = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop") || "").toLowerCase();
    const content = attr(tag, "content");
    if (prop && content) metas.push({ prop, content });
  }

  const jsonLd = { descriptions: [] as string[], images: [] as string[] };
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkJsonLd(JSON.parse(block[1]), jsonLd, 0);
    } catch {
      /* bloc illisible */
    }
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const ogTitle = cleanText(metas.find((meta) => meta.prop === "og:title")?.content || titleTag);

  const description = cleanText(
    metas.find((meta) => meta.prop === "og:description")?.content ||
      metas.find((meta) => meta.prop === "description")?.content ||
      jsonLd.descriptions[0],
  );

  const rawImages = [
    ...metas
      .filter((meta) => ["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(meta.prop))
      .map((meta) => meta.content),
    ...jsonLd.images,
  ];

  for (const tag of html.match(/<img\s+[^>]*>/gi) ?? []) {
    const src = attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-lazy-src");
    if (!src) continue;
    const hint = `${src} ${attr(tag, "alt") ?? ""} ${attr(tag, "class") ?? ""}`;
    if (SKIP_IMAGE.test(hint)) continue;
    if (/\.svg($|\?)/i.test(src)) continue;
    rawImages.push(src);
    if (rawImages.length > 24) break;
  }

  const imageUrls: string[] = [];
  for (const raw of rawImages) {
    if (SKIP_IMAGE.test(raw)) continue;
    const absolute = resolveAgainst(raw, pageUrl);
    if (!absolute || imageUrls.includes(absolute)) continue;
    imageUrls.push(absolute);
    if (imageUrls.length >= 5) break;
  }

  return { title: ogTitle, description, imageUrls };
}
