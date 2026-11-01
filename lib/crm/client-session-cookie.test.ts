import assert from "node:assert/strict";
import test from "node:test";
import { serialize } from "cookie";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_MAX_AGE, AUTH_COOKIE_OPTIONS, clientAuthCookieOptions } from "../supabase/cookie-options";
import {
  CLIENT_SESSION_REFRESH_WINDOW_SECONDS,
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

test("le cookie client a une date Expires et Max-Age, HttpOnly, Secure", () => {
  const now = Date.parse("2026-11-01T18:00:00.000Z");
  const options = clientAuthCookieOptions(true, now);
  assert.equal(options.path, "/");
  assert.equal(options.sameSite, "lax");
  assert.equal(options.httpOnly, true);
  assert.equal(options.secure, true);
  assert.equal(options.maxAge, AUTH_COOKIE_MAX_AGE);
  assert.equal(options.expires.toISOString(), "2027-12-06T18:00:00.000Z");
  assert.equal(clientAuthCookieOptions(false, now).secure, false);
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

test("le jeton ne tourne pas au bout de quelques minutes, seulement près de la fin", () => {
  const now = 1_800_000_000;
  const fresh = { audience: "client" as const, iat: now - 180, exp: now + 3600 - 180 };
  assert.equal(shouldRefreshClientSession(fresh, now), false);
  assert.equal(
    shouldRefreshClientSession({ ...fresh, exp: now + CLIENT_SESSION_REFRESH_WINDOW_SECONDS }, now),
    true,
  );
  assert.equal(shouldRefreshClientSession({ ...fresh, exp: now - 1 }, now), true);
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

test("le mot de passe navigateur n’écrit pas de date, le serveur oui", () => {
  const now = Date.parse("2026-11-01T18:00:00.000Z");
  const browser = serialize("sb-ref-auth-token", "session", AUTH_COOKIE_OPTIONS);
  assert.match(browser, /Max-Age=34560000/);
  assert.doesNotMatch(browser, /Expires=/i);
  assert.doesNotMatch(browser, /Secure/i);
  assert.doesNotMatch(browser, /HttpOnly/i);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sb-ref-auth-token", "session", clientAuthCookieOptions(true, now));
  const header = response.headers.getSetCookie()[0] || "";
  assert.match(header, /Max-Age=34560000/);
  assert.match(header, /Expires=[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=lax/i);
  assert.doesNotMatch(header, /\([^)]+\)/);
});

test("Secure en production, et le préchargement ne renouvelle pas", () => {
  assert.equal(requestIsSecure({ nodeEnv: "production", protocol: "http:" }), true);
  assert.equal(requestIsSecure({ nodeEnv: "development", protocol: "http:" }), false);
  assert.equal(requestIsSecure({ nodeEnv: "development", forwardedProto: "https,http" }), true);
  const headers = new Map<string, string>([["next-router-prefetch", "1"]]);
  assert.equal(isRouterPrefetch((name) => headers.get(name) ?? null), true);
  assert.equal(isRouterPrefetch(() => null), false);
});
