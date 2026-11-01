import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_OPTIONS, clientAuthCookieOptions } from "../supabase/cookie-options";
import {
  CLIENT_SESSION_REFRESH_GRACE_SECONDS,
  accessTimingFromCookies,
  clearAuthSessionCookieWrites,
  clientSessionCookieWrites,
  isAuthSessionCookieName,
  isRouterPrefetch,
  mergeCookieValues,
  requestIsSecure,
  sessionAudienceFromCookies,
  shouldRefreshClientSession,
} from "./client-session-cookie";

function part(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(role: string, timing: { iat: number; exp: number }) {
  return `${part({ alg: "none" })}.${part({ app_metadata: { crm_role: role }, ...timing })}.sig`;
}

function sessionCookie(name: string, role: string, timing: { iat: number; exp: number }) {
  const session = JSON.stringify({
    access_token: token(role, timing),
    refresh_token: "refresh",
    expires_at: timing.exp,
  });
  return { name, value: `base64-${Buffer.from(session).toString("base64url")}` };
}

test("le cookie agence reste lisible par le navigateur, 400 jours", () => {
  assert.equal(AUTH_COOKIE_OPTIONS.maxAge, AUTH_COOKIE_MAX_AGE);
  assert.equal(AUTH_COOKIE_OPTIONS.maxAge, 400 * 24 * 60 * 60);
  assert.equal(AUTH_COOKIE_OPTIONS.sameSite, "lax");
  assert.equal(AUTH_COOKIE_OPTIONS.path, "/");
  assert.equal("httpOnly" in AUTH_COOKIE_OPTIONS, false);
  assert.equal("secure" in AUTH_COOKIE_OPTIONS, false);
});

test("le cookie client est HttpOnly, Secure selon l’appel, SameSite Lax, 400 jours", () => {
  assert.deepEqual(clientAuthCookieOptions(true), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: true,
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  assert.equal(clientAuthCookieOptions(false).secure, false);
  assert.equal(clientAuthCookieOptions(false).httpOnly, true);
});

test("seul le cookie de session est reconnu", () => {
  assert.equal(isAuthSessionCookieName("sb-fsmfozxgujskluxakeoq-auth-token"), true);
  assert.equal(isAuthSessionCookieName("sb-fsmfozxgujskluxakeoq-auth-token.0"), true);
  assert.equal(isAuthSessionCookieName("sb-fsmfozxgujskluxakeoq-auth-token.1"), true);
  assert.equal(isAuthSessionCookieName("sb-fsmfozxgujskluxakeoq-auth-token-code-verifier"), false);
  assert.equal(isAuthSessionCookieName("tb_desk"), false);
});

test("un client est réécrit, l’agence et le partenaire non", () => {
  const now = 1_700_000_000;
  const timing = { iat: now - 3600, exp: now + 3600 };
  const client = sessionCookie("sb-ref-auth-token", "client", timing);
  const writes = clientSessionCookieWrites([client, { name: "tb_desk", value: "1" }], true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.name, client.name);
  assert.equal(writes[0]?.value, client.value);
  assert.equal(writes[0]?.options.httpOnly, true);
  assert.equal(writes[0]?.options.maxAge, AUTH_COOKIE_MAX_AGE);
  assert.equal(clientSessionCookieWrites([sessionCookie("sb-ref-auth-token", "agent", timing)], true).length, 0);
  assert.equal(clientSessionCookieWrites([sessionCookie("sb-ref-auth-token", "partner", timing)], false).length, 0);
  assert.equal(sessionAudienceFromCookies([client]), "client");
  assert.equal(sessionAudienceFromCookies([sessionCookie("sb-ref-auth-token", "lecture", timing)]), "staff");
});

test("un cookie découpé se lit et se réécrit", () => {
  const now = 1_700_000_000;
  const whole = sessionCookie("sb-ref-auth-token", "client", { iat: now, exp: now + 10 });
  const mid = Math.floor(whole.value.length / 2);
  const chunks = [
    { name: "sb-ref-auth-token.0", value: whole.value.slice(0, mid) },
    { name: "sb-ref-auth-token.1", value: whole.value.slice(mid) },
  ];
  const writes = clientSessionCookieWrites(chunks, true);
  assert.deepEqual(writes.map((cookie) => cookie.name), ["sb-ref-auth-token.0", "sb-ref-auth-token.1"]);
  assert.equal(accessTimingFromCookies(chunks).audience, "client");
  assert.equal(accessTimingFromCookies(chunks).exp, now + 10);
});

test("renouvellement à chaque visite, pas dans les deux minutes, pas pour l’agence", () => {
  const now = 1_800_000_000;
  const client = { audience: "client" as const, iat: now - 10, exp: now + 3500 };
  assert.equal(shouldRefreshClientSession(client, now), false);
  assert.equal(
    shouldRefreshClientSession({ ...client, iat: now - CLIENT_SESSION_REFRESH_GRACE_SECONDS }, now),
    true,
  );
  assert.equal(shouldRefreshClientSession({ ...client, exp: now - 1 }, now), true);
  assert.equal(shouldRefreshClientSession({ audience: "staff", iat: now - 10_000, exp: now + 10 }, now), false);
  assert.equal(shouldRefreshClientSession({ audience: "unknown", iat: null, exp: null }, now), false);
});

test("une suppression de cookie n’est pas réécrite par l’ancienne valeur", () => {
  const merged = mergeCookieValues(
    [
      { name: "sb-ref-auth-token.0", value: "ancien" },
      { name: "sb-ref-auth-token.1", value: "suite" },
    ],
    [{ name: "sb-ref-auth-token.0", value: "", options: { maxAge: 0 } }],
  );
  assert.deepEqual(merged, [{ name: "sb-ref-auth-token.1", value: "suite" }]);
});

test("la déconnexion efface le cookie HttpOnly", () => {
  const clears = clearAuthSessionCookieWrites(
    [
      { name: "sb-ref-auth-token.0", value: "a" },
      { name: "autre", value: "b" },
    ],
    true,
  );
  assert.equal(clears.length, 1);
  assert.equal(clears[0]?.options.maxAge, 0);
  assert.equal(clears[0]?.options.httpOnly, true);
  assert.equal(clears[0]?.options.secure, true);
  assert.equal(clears[0]?.value, "");
});

test("Secure en production, et le préchargement ne renouvelle pas", () => {
  assert.equal(requestIsSecure({ nodeEnv: "production", protocol: "http:" }), true);
  assert.equal(requestIsSecure({ nodeEnv: "development", protocol: "http:" }), false);
  assert.equal(requestIsSecure({ nodeEnv: "development", forwardedProto: "https,http" }), true);
  const headers = new Map<string, string>([["next-router-prefetch", "1"]]);
  assert.equal(isRouterPrefetch((name) => headers.get(name) ?? null), true);
  assert.equal(isRouterPrefetch(() => null), false);
});
