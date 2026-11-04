import { DESK_COOKIE } from "@/lib/crm/desk-mode";
import {
  isAuthSessionCookieName,
  readAuthSession,
  type CookieRecord,
  type SessionAudience,
} from "@/lib/crm/client-session-cookie";
import { safeInternalPath } from "@/lib/crm/safe-path";
import { clientAuthCookieOptions } from "@/lib/supabase/cookie-options";

/** La révocation Auth ne doit pas bloquer le clic. Le cookie part quand même. */
export const SIGN_OUT_REVOKE_MS = 2500;

const VERIFIER_COOKIE = /^sb-[a-z0-9]+-auth-token-code-verifier(?:\.\d+)?$/;
const AUTH_BROWSER_COOKIE = /^sb-[a-z0-9]+-auth-token(?:-code-verifier)?(?:\.\d+)?$/;

export type SignOutScope = "local" | "global";

type ClearOptions = ReturnType<typeof clientAuthCookieOptions> & { maxAge: 0 };

/**
 * Page de connexion autorisée après déconnexion.
 * Un chemin quelconque (`/admin`, une adresse externe) ne passe pas :
 * le proxy renverrait un collègue encore connecté dans l’agence.
 */
export function signOutRedirectPath(input: { requested: string | null; audience: SessionAudience }): string {
  const requested = loginPathOrNull(input.requested);
  if (requested) return requested;
  return input.audience === "staff" ? "/admin/login" : "/connexion";
}

export function parseSignOutFields(input: { scope?: unknown; next?: unknown }): { scope: SignOutScope; next: string | null } {
  return {
    scope: input.scope === "global" ? "global" : "local",
    next: typeof input.next === "string" ? input.next : null,
  };
}

export function accessTokenFromAuthCookies(cookies: readonly CookieRecord[]): string | null {
  const session = readAuthSession(cookies);
  const token = session?.access_token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/**
 * Noms `sb-…-auth-token` visibles par le navigateur (agence : pas HttpOnly).
 * Le cookie client HttpOnly n’apparaît pas ici : seul Set-Cookie peut l’effacer.
 */
export function browserAuthCookieNames(header: string): string[] {
  const names = new Set<string>();
  for (const part of header.split(";")) {
    const raw = part.trim();
    if (!raw) continue;
    const eq = raw.indexOf("=");
    const name = (eq === -1 ? raw : raw.slice(0, eq)).trim();
    if (!AUTH_BROWSER_COOKIE.test(name)) continue;
    names.add(name);
    const base = name.match(/^(sb-[a-z0-9]+-auth-token(?:-code-verifier)?)/);
    if (base?.[1] && base[1] !== name) names.add(base[1]);
  }
  return [...names];
}

/** Effacement `document.cookie` : pas de Secure, pour le cookie agence posé sans ce drapeau. */
export function browserCookieDeletion(name: string): string | null {
  if (!AUTH_BROWSER_COOKIE.test(name)) return null;
  return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/**
 * Cookies à retirer sur la réponse. Secure + HttpOnly en production :
 * ça expire le cookie client (HttpOnly, Secure) et, en HTTPS, le cookie agence.
 */
export function signOutCookieWrites(cookies: readonly CookieRecord[], secure: boolean) {
  const options: ClearOptions = { ...clientAuthCookieOptions(secure), maxAge: 0, expires: new Date(0) };
  const names = new Set<string>();
  for (const cookie of cookies) {
    if (!isSignOutCookie(cookie.name)) continue;
    names.add(cookie.name);
    const base = cookie.name.match(/^(sb-[a-z0-9]+-auth-token(?:-code-verifier)?)/);
    if (base?.[1]) names.add(base[1]);
  }
  return [...names].map((name) => ({ name, value: "", options }));
}

export function isSignOutCookie(name: string) {
  return isAuthSessionCookieName(name) || VERIFIER_COOKIE.test(name) || name === DESK_COOKIE;
}

type SignOutCarrier = {
  headers: { set: (name: string, value: string) => void };
  cookies: { set: (name: string, value: string, options: ClearOptions) => void };
};

/** Jamais en cache : un POST de déconnexion servi depuis le CDN laisserait la session. */
export function applySignOut<T extends SignOutCarrier>(response: T, cookies: readonly CookieRecord[], secure: boolean) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Vercel-CDN-Cache-Control", "no-store");
  for (const cookie of signOutCookieWrites(cookies, secure)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

/**
 * Révoque le jeton de rafraîchissement chez Supabase Auth.
 * N’écrit aucun cookie : l’appel client `signOut()` le ferait, et un rafraîchissement
 * en cours peut reposer la session après l’effacement.
 */
export async function revokeAuthSession(input: {
  supabaseUrl: string;
  anonKey: string;
  accessToken: string | null;
  scope: SignOutScope;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<boolean> {
  if (!input.accessToken) return false;
  const endpoint = `${input.supabaseUrl.replace(/\/$/, "")}/auth/v1/logout?scope=${input.scope}`;
  const fetcher = input.fetch ?? fetch;
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        apikey: input.anonKey,
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      signal: input.signal,
      redirect: "manual",
    });
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

function loginPathOrNull(raw: string | null): string | null {
  if (!raw) return null;
  const safe = safeInternalPath(raw, "");
  if (!safe) return null;
  let url: URL;
  try {
    url = new URL(safe, "https://travelba.fr");
  } catch {
    return null;
  }
  if (url.pathname === "/connexion") return "/connexion";
  if (url.pathname !== "/admin/login") return null;
  if (url.searchParams.get("espace") === "myler") return "/admin/login?espace=myler";
  return "/admin/login";
}
