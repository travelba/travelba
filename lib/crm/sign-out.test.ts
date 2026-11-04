import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import {
  accessTokenFromAuthCookies,
  applySignOut,
  browserAuthCookieNames,
  browserCookieDeletion,
  parseSignOutFields,
  revokeAuthSession,
  signOutCookieWrites,
  signOutRedirectPath,
} from "./sign-out";

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

test("le menu agence passe par la route, pas par signOut du navigateur", () => {
  const nav = readFileSync(new URL("../../components/admin/AdminNav.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/auth/sign-out/route.ts", import.meta.url), "utf8");
  assert.match(nav, /signOutAccount\("local"/);
  assert.doesNotMatch(nav, /auth\.signOut/);
  assert.match(route, /force-dynamic/);
  assert.match(route, /applySignOut/);
  assert.doesNotMatch(route, /status:\s*400/);
});
