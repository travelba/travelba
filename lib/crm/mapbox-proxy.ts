/**
 * La carte Hôtels parle à Mapbox par notre origine.
 * Le jeton public est restreint par URL : Mapbox exige un en-tête Referer.
 * Safari (écran d’accueil, worker) l’omet. Le serveur le pose, sur une adresse déjà autorisée.
 * Le navigateur ne reçoit jamais la valeur du jeton dans une erreur.
 */

import { timingSafeEqual } from "node:crypto";
import { publicMapboxToken } from "./hotel-map";

const TOKEN_TEXT = /pk\.[A-Za-z0-9._-]{8,}/g;
const TOKEN_QUERY = /([?&]access_token=)[^&\s]+/gi;

const API_PREFIXES = [
  "/styles/v1/",
  "/fonts/v1/",
  "/v4/",
  "/raster/v1/",
  "/rasterarrays/v1/",
  "/map-sessions/v1",
  "/mapbox-gl-js/",
];

export function mapboxRefererFor(pageOrigin: string) {
  if (pageOrigin === "http://localhost:3000" || pageOrigin === "http://127.0.0.1:3000") return "http://localhost:3000/";
  if (pageOrigin === "https://www.travelba.fr") return "https://www.travelba.fr/";
  return "https://travelba.fr/";
}

function mapboxHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "api.mapbox.com" || host === "events.mapbox.com") return host;
  if (/^[a-z0-9-]+\.tiles\.mapbox\.com$/.test(host)) return host;
  return null;
}

function allowedPath(host: string, pathname: string) {
  if (!pathname.startsWith("/") || pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0")) return false;
  if (host === "events.mapbox.com") return pathname === "/events/v2" || pathname.startsWith("/events/v2/");
  if (host.endsWith(".tiles.mapbox.com")) return pathname.startsWith("/v4/") || pathname.startsWith("/styles/");
  return API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** URL Mapbox lisible (style, tuiles, polices). Null si l’adresse sort de cette liste. */
export function allowedMapboxUpstream(raw: string): URL | null {
  if (!raw || raw.length > 4000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = mapboxHost(url.hostname);
  if (!host || !allowedPath(host, url.pathname)) return null;
  return url;
}

export function sameMapboxToken(candidate: string | null, expected: string | null) {
  if (!candidate || !expected || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/** Réécrit un appel Mapbox vers `/api/mapbox`. Les autres adresses ne bougent pas. */
export function rewriteMapboxRequest(raw: string, pageOrigin: string): string | null {
  const upstream = allowedMapboxUpstream(raw);
  if (!upstream) return null;
  let origin: URL;
  try {
    origin = new URL(pageOrigin);
  } catch {
    return null;
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") return null;
  const proxied = new URL("/api/mapbox", origin.origin);
  proxied.searchParams.set("url", upstream.toString());
  return proxied.toString();
}

export function sanitizeMapboxLog(value: string) {
  return value.replace(TOKEN_TEXT, "pk.[redacted]").replace(TOKEN_QUERY, "$1[redacted]").slice(0, 240);
}

/** Raison courte, sans jeton. Null si l’erreur ne doit pas remplacer la carte. */
export function fatalMapboxError(error: unknown): string | null {
  const record = typeof error === "object" && error ? (error as { status?: unknown; message?: unknown; cause?: unknown }) : null;
  const status = typeof record?.status === "number" ? record.status : Number.NaN;
  const parts = [record?.message, error instanceof Error ? error.message : "", typeof error === "string" ? error : ""];
  const cause = record?.cause;
  if (cause instanceof Error) parts.push(cause.message);
  const raw = parts.filter(Boolean).join(" ");
  const lower = raw.toLowerCase();
  if (lower.includes("events.mapbox.com")) return null;
  if (status === 401 || status === 403) return `mapbox ${status}`;
  if (/failed to initialize webgl|webglcontextlost|webgl context/.test(lower)) return "webgl";
  if (/unauthorized|forbidden|access token|no_access_token/.test(lower)) return "jeton refusé";
  if (/failed to fetch|networkerror|load failed/.test(lower) && /mapbox\.com/.test(lower)) return "mapbox injoignable";
  return null;
}

export async function proxyMapboxGet(input: {
  requestUrl: string;
  token: string | null;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const request = new URL(input.requestUrl);
  const upstream = allowedMapboxUpstream(request.searchParams.get("url") || "");
  if (!upstream) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const expected = publicMapboxToken(input.token);
  const presented = upstream.searchParams.get("access_token");
  if (!expected || !sameMapboxToken(presented, expected)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const fetchImpl = input.fetchImpl || fetch;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstream.toString(), {
      method: "GET",
      redirect: "manual",
      headers: {
        Referer: mapboxRefererFor(request.origin),
        Accept: "*/*",
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const length = Number(upstreamResponse.headers.get("content-length") || "0");
  if (length > 8_000_000) return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  const body = await upstreamResponse.arrayBuffer();
  if (body.byteLength > 8_000_000) return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers();
  const type = upstreamResponse.headers.get("content-type");
  if (type) headers.set("Content-Type", type);
  headers.set("Cache-Control", upstreamResponse.ok ? "private, max-age=300" : "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(body, { status: upstreamResponse.status, headers });
}
