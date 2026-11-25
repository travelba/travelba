import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import {
  accessTokenFromAuthCookies,
  applySignOut,
  browserAuthCookieNames,
  browserCookieDeletion,
  buildSignOutResponse,
  parseSignOutFields,
  revokeAuthSession,
  signOutCookieWrites,
  signOutPublicOrigin,
  signOutRedirectPath,
  signOutWantsNavigation,
} from "./sign-out";
import { nativeEndSessionSteps } from "../native/end-session";

function part(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sessionCookie(name: string) {
  const session = JSON.stringify({
    access_token: `${part({ alg: "none" })}.${part({ sub: "user" })}.sig`,
    refresh_token: "refresh",
  });
  return { name, value: `base64-${Buffer.from(session).toString("base64url")}` };
}

test("la déconnexion agence ouvre la connexion agence, le client la sienne", () => {
  assert.equal(signOutRedirectPath({ requested: null, audience: "staff" }), "/admin/login");
  assert.equal(signOutRedirectPath({ requested: null, audience: "client" }), "/connexion");
  assert.equal(signOutRedirectPath({ requested: null, audience: "unknown" }), "/connexion");
  assert.equal(
    signOutRedirectPath({ requested: "/admin/login?espace=myler", audience: "staff" }),
    "/admin/login?espace=myler",
  );
  assert.equal(signOutRedirectPath({ requested: "/connexion", audience: "staff" }), "/connexion");
  assert.equal(signOutRedirectPath({ requested: "/compte-supprime", audience: "client" }), "/compte-supprime");
  assert.equal(
    signOutRedirectPath({ requested: "/connexion?error=application", audience: "staff" }),
    "/connexion?error=application",
  );
});

test("un chemin hors connexion ne sert pas de redirection", () => {
  for (const requested of ["/admin", "/admin/reservations", "https://evil.example/admin/login", "//evil.example", "/\\evil.example"]) {
    assert.equal(signOutRedirectPath({ requested, audience: "staff" }), "/admin/login", requested);
  }
  assert.equal(signOutRedirectPath({ requested: "/admin/login?next=/admin", audience: "client" }), "/admin/login");
});

test("le corps n’accepte que local ou global", () => {
  assert.deepEqual(parseSignOutFields({ scope: "global", next: "/admin/login" }), {
    scope: "global",
    next: "/admin/login",
  });
  assert.deepEqual(parseSignOutFields({ scope: "ailleurs", next: 12 }), { scope: "local", next: null });
});

test("la déconnexion efface la session, ses morceaux, le vérificateur et le desk", () => {
  const writes = signOutCookieWrites(
    [
      { name: "sb-ref-auth-token.0", value: "a" },
      { name: "sb-ref-auth-token.1", value: "b" },
      { name: "sb-ref-auth-token-code-verifier", value: "pkce" },
      { name: "tb_desk", value: "desk" },
      { name: "autre", value: "non" },
    ],
    true,
  );
  const names = writes.map((cookie) => cookie.name).sort();
  assert.deepEqual(names, [
    "sb-ref-auth-token",
    "sb-ref-auth-token-code-verifier",
    "sb-ref-auth-token.0",
    "sb-ref-auth-token.1",
    "tb_desk",
  ]);
  for (const cookie of writes) {
    assert.equal(cookie.value, "");
    assert.equal(cookie.options.maxAge, 0);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.secure, true);
    assert.equal(cookie.options.path, "/");
    assert.equal(cookie.options.expires.toISOString(), "1970-01-01T00:00:00.000Z");
  }
});

test("la réponse de déconnexion n’est pas mise en cache et expire le cookie", () => {
  const response = NextResponse.json({ ok: true, redirect: "/admin/login" });
  applySignOut(response, [sessionCookie("sb-ref-auth-token")], true);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("CDN-Cache-Control"), "no-store");
  assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), "no-store");
  const setCookie = response.headers.getSetCookie().join("\n");
  assert.match(setCookie, /sb-ref-auth-token=;/);
  assert.match(setCookie, /Max-Age=0/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.doesNotMatch(setCookie, /Max-Age=34560000/);
});

test("le navigateur peut effacer le cookie agence, pas un nom arbitraire", () => {
  assert.deepEqual(
    browserAuthCookieNames("sb-ref-auth-token.0=aa; autre=bb; sb-ref-auth-token-code-verifier=cc"),
    ["sb-ref-auth-token.0", "sb-ref-auth-token", "sb-ref-auth-token-code-verifier"],
  );
  const deletion = browserCookieDeletion("sb-ref-auth-token");
  assert.ok(deletion);
  assert.match(deletion, /Max-Age=0/);
  assert.doesNotMatch(deletion, /Secure/);
  assert.doesNotMatch(deletion, /HttpOnly/);
  assert.equal(browserCookieDeletion("autre"), null);
  assert.equal(browserCookieDeletion("sb-ref-auth-token; evil"), null);
});

test("le jeton lu sert à la révocation, un cookie vide non", () => {
  const cookie = sessionCookie("sb-ref-auth-token");
  const token = accessTokenFromAuthCookies([cookie]);
  assert.equal(typeof token, "string");
  assert.ok(token && token.split(".").length === 3);
  assert.equal(accessTokenFromAuthCookies([{ name: "autre", value: "x" }]), null);
});

test("la révocation appelle logout et un réseau coupé n’empêche pas l’effacement", async () => {
  const seen: { url: string; authorization: string }[] = [];
  const ok = await revokeAuthSession({
    supabaseUrl: "https://example.supabase.co/",
    anonKey: "anon",
    accessToken: "jeton",
    scope: "local",
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      seen.push({ url: String(url), authorization: headers.get("authorization") || "" });
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(ok, true);
  assert.equal(seen[0]?.url, "https://example.supabase.co/auth/v1/logout?scope=local");
  assert.equal(seen[0]?.authorization, "Bearer jeton");

  const failed = await revokeAuthSession({
    supabaseUrl: "https://example.supabase.co",
    anonKey: "anon",
    accessToken: "jeton",
    scope: "global",
    fetch: async () => {
      throw new Error("réseau");
    },
  });
  assert.equal(failed, false);
  assert.equal(
    await revokeAuthSession({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "anon",
      accessToken: null,
      scope: "local",
      fetch: async () => {
        throw new Error("ne doit pas être appelé");
      },
    }),
    false,
  );
});

test("un formulaire ouvre la connexion et retire le cookie, un JSON ne change pas de page", () => {
  assert.equal(signOutWantsNavigation("application/x-www-form-urlencoded"), true);
  assert.equal(signOutWantsNavigation("application/json"), false);
  assert.equal(signOutWantsNavigation(null), false);
  const cookies = [sessionCookie("sb-ref-auth-token.0")];
  const navigated = buildSignOutResponse({
    origin: "https://travelba.fr",
    fields: { next: "/connexion" },
    cookies,
    secure: true,
    navigate: true,
  });
  assert.equal(navigated.status, 303);
  assert.equal(navigated.headers.get("location"), "https://travelba.fr/connexion");
  const cleared = navigated.headers.getSetCookie();
  assert.ok(cleared.some((line) => line.startsWith("sb-ref-auth-token.0=") && /Max-Age=0/i.test(line)));
  const json = buildSignOutResponse({
    origin: "https://travelba.fr",
    fields: { next: "/connexion" },
    cookies,
    secure: true,
    navigate: false,
  });
  assert.equal(json.status, 200);
  assert.equal(json.headers.get("location"), null);
});

test("la déconnexion ne suit pas un hôte inconnu", () => {
  assert.equal(
    signOutPublicOrigin({
      url: "http://internal:3000/api/auth/sign-out",
      headers: { get: (name) => (name === "x-forwarded-host" ? "evil.example" : "https") },
    }),
    "http://internal:3000",
  );
  assert.equal(
    signOutPublicOrigin({
      url: "http://internal:3000/api/auth/sign-out",
      headers: { get: (name) => (name === "x-forwarded-host" ? "travelba.fr" : name === "x-forwarded-proto" ? "https" : null) },
    }),
    "https://travelba.fr",
  );
});

test("la déconnexion de l’application coupe Face ID, le repli mot de passe le garde", () => {
  assert.deepEqual(nativeEndSessionSteps(false), ["biometric-off", "push", "unlock", "offline"]);
  assert.deepEqual(nativeEndSessionSteps(true), ["push"]);
  const button = readFileSync(new URL("../../components/account/SignOutButton.tsx", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../../components/account/AccountUserMenu.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("./account-sign-out.ts", import.meta.url), "utf8");
  assert.match(button, /onPointerDown/);
  assert.match(menu, /onPointerDown/);
  assert.match(client, /submitSignOutForm/);
  assert.doesNotMatch(client, /location\.replace/);
  assert.match(client, /SIGN_OUT_NATIVE_DEADLINE_MS/);
});

test("le menu agence passe par la route, pas par signOut du navigateur", () => {
  const nav = readFileSync(new URL("../../components/admin/AdminNav.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/auth/sign-out/route.ts", import.meta.url), "utf8");
  assert.match(nav, /signOutAccount\("local"/);
  assert.doesNotMatch(nav, /auth\.signOut/);
  assert.match(route, /force-dynamic/);
  assert.match(route, /buildSignOutResponse/);
  assert.match(route, /signOutWantsNavigation/);
  assert.doesNotMatch(route, /status:\s*400/);
});
