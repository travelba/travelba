import { clientAuthCookieOptions } from "@/lib/supabase/cookie-options";

/**
 * On ne fait tourner le jeton que lorsqu’il approche de sa fin.
 * Le faire à chaque visite révoque la session : deux requêtes parallèles
 * présentent l’ancien jeton, et le client se retrouve déconnecté au retour.
 */
export const CLIENT_SESSION_REFRESH_WINDOW_SECONDS = 15 * 60;

const AUTH_SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;
const STAFF_COOKIE_ROLES = new Set(["admin", "manager", "agent", "comptable", "lecture", "partner"]);

export type CookieRecord = { name: string; value: string };
export type SessionAudience = "client" | "staff" | "unknown";
export type AccessTiming = { audience: SessionAudience; iat: number | null; exp: number | null };

type ClientCookieOptions = ReturnType<typeof clientAuthCookieOptions>;

/** Cookie de session Supabase (`sb-…-auth-token`, éventuellement `.0`). Pas le vérificateur PKCE. */
export function isAuthSessionCookieName(name: string) {
  return AUTH_SESSION_COOKIE.test(name);
}

export function audienceFromRole(role: unknown): SessionAudience {
  if (role === "client") return "client";
  if (typeof role === "string" && STAFF_COOKIE_ROLES.has(role)) return "staff";
  return "unknown";
}

function decodeBase64Url(value: string) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? padded : padded + "=".repeat(4 - (padded.length % 4));
    const binary = atob(pad);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function decodeSessionPayload(raw: string | null | undefined) {
  if (!raw) return null;
  const jsonText = raw.startsWith("base64-") ? decodeBase64Url(raw.slice("base64-".length)) : raw;
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function storageKey(name: string) {
  const match = name.match(/^(sb-[a-z0-9]+-auth-token)(?:\.\d+)?$/);
  return match?.[1] ?? null;
}

/** Session décodée du cookie, ou null. Ne vérifie pas la signature : le serveur Auth le fait. */
export function readAuthSession(cookies: readonly CookieRecord[]) {
  const keys = new Set<string>();
  for (const cookie of cookies) {
    const key = storageKey(cookie.name);
    if (key) keys.add(key);
  }
  for (const key of keys) {
    const direct = cookies.find((cookie) => cookie.name === key && cookie.value)?.value;
    let raw = direct ?? "";
    if (!raw) {
      const chunks: string[] = [];
      for (let index = 0; ; index += 1) {
        const chunk = cookies.find((cookie) => cookie.name === `${key}.${index}`)?.value;
        if (!chunk) break;
        chunks.push(chunk);
      }
      raw = chunks.join("");
    }
    const session = decodeSessionPayload(raw);
    if (session) return session;
  }
  return null;
}

function jwtPayload(token: unknown) {
  if (typeof token !== "string") return null;
  const part = token.split(".")[1];
  if (!part) return null;
  const json = decodeBase64Url(part);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function sessionAudienceFromCookies(cookies: readonly CookieRecord[]): SessionAudience {
  const session = readAuthSession(cookies);
  if (!session) return "unknown";
  const payload = jwtPayload(session.access_token);
  const meta = payload?.app_metadata;
  const role = meta && typeof meta === "object" ? (meta as Record<string, unknown>).crm_role : undefined;
  return audienceFromRole(role);
}

export function accessTimingFromCookies(cookies: readonly CookieRecord[]): AccessTiming {
  const session = readAuthSession(cookies);
  const payload = jwtPayload(session?.access_token);
  return {
    audience: sessionAudienceFromCookies(cookies),
    iat: typeof payload?.iat === "number" ? payload.iat : null,
    exp: typeof payload?.exp === "number" ? payload.exp : null,
  };
}

/** Renouvelle seulement si le jeton d’accès est expiré ou dans le dernier quart d’heure. */
export function shouldRefreshClientSession(timing: AccessTiming, nowSeconds: number) {
  if (timing.audience !== "client" || timing.exp == null) return false;
  return timing.exp - nowSeconds <= CLIENT_SESSION_REFRESH_WINDOW_SECONDS;
}

export function isRouterPrefetch(header: (name: string) => string | null) {
  return header("next-router-prefetch") === "1" || header("purpose") === "prefetch";
}

/** Production : toujours Secure. En local, seulement si la requête est en HTTPS. */
export function requestIsSecure(input: { nodeEnv?: string; forwardedProto?: string | null; protocol?: string }) {
  if ((input.nodeEnv ?? process.env.NODE_ENV) === "production") return true;
  const proto = input.forwardedProto?.split(",")[0]?.trim();
  return proto === "https" || input.protocol === "https:";
}

/** Réécrit les cookies de session client avec la durée longue. L’agence n’est pas touchée. */
export function clientSessionCookieWrites(cookies: readonly CookieRecord[], secure: boolean) {
  if (sessionAudienceFromCookies(cookies) !== "client") return [];
  const options = clientAuthCookieOptions(secure);
  const seen = new Set<string>();
  const writes: { name: string; value: string; options: ClientCookieOptions }[] = [];
  for (const cookie of cookies) {
    if (!isAuthSessionCookieName(cookie.name) || !cookie.value || seen.has(cookie.name)) continue;
    seen.add(cookie.name);
    writes.push({ name: cookie.name, value: cookie.value, options });
  }
  return writes;
}

export function clearAuthSessionCookieWrites(cookies: readonly CookieRecord[], secure: boolean) {
  const options = { ...clientAuthCookieOptions(secure), maxAge: 0, expires: new Date(0) };
  const names = new Set<string>();
  for (const cookie of cookies) {
    if (isAuthSessionCookieName(cookie.name)) names.add(cookie.name);
  }
  return [...names].map((name) => ({ name, value: "", options }));
}

/** Les cookies réécrits par Supabase remplacent ceux de la requête. Une suppression (maxAge 0) retire. */
export function mergeCookieValues(
  incoming: readonly CookieRecord[],
  written: readonly { name: string; value: string; options?: { maxAge?: number } }[],
) {
  const map = new Map<string, string>();
  for (const cookie of incoming) map.set(cookie.name, cookie.value);
  for (const cookie of written) {
    if (!cookie.value || cookie.options?.maxAge === 0) map.delete(cookie.name);
    else map.set(cookie.name, cookie.value);
  }
  return [...map].map(([name, value]) => ({ name, value }));
}

export function stampClientSession<
  T extends { cookies: { set: (name: string, value: string, options: ClientCookieOptions) => void } },
>(response: T, cookies: readonly CookieRecord[], secure: boolean) {
  for (const write of clientSessionCookieWrites(cookies, secure)) {
    response.cookies.set(write.name, write.value, write.options);
  }
  return response;
}
