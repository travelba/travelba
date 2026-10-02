import assert from "node:assert/strict";
import test from "node:test";
import {
  bearerAccessToken,
  callbackSecretsFromUrl,
  entryCodeFromPath,
  isRefreshToken,
  mobileClientGate,
  mobileNextPath,
  mobileScreenForPath,
  mobileSessionSnapshot,
  mobileSessionTokens,
} from "./mobile-auth";

test("le Bearer refuse les jetons vides ou trop courts", () => {
  assert.equal(bearerAccessToken(null), null);
  assert.equal(bearerAccessToken("Bearer "), null);
  assert.equal(bearerAccessToken("Basic abc"), null);
  assert.equal(bearerAccessToken("Bearer short"), null);
  const token = "a".repeat(40);
  assert.equal(bearerAccessToken(`Bearer ${token}`), token);
  assert.equal(bearerAccessToken(`bearer ${token}`), token);
  assert.equal(isRefreshToken(token), true);
  assert.equal(isRefreshToken("nope"), false);
});

test("un collègue n’entre pas dans l’app client", () => {
  const user = { id: "u1", email: "a@b.fr", app_metadata: {} };
  const customer = { id: "c1", first_name: "Ada", last_name: "Lovelace", phone: "+336", email: "a@b.fr" };
  assert.equal(mobileClientGate({ user: null, customer: null, staff: false }).status, 401);
  assert.equal(mobileClientGate({ user, customer, staff: true }).status, 403);
  assert.equal(mobileClientGate({ user, customer: null, staff: false }).status, 403);
  assert.equal(mobileClientGate({ user, customer, staff: false }).ok, true);
});

test("après mot de passe, l’app ouvre la bienvenue puis l’accueil", () => {
  const pending = {
    id: "u1",
    email: "a@b.fr",
    app_metadata: { client_onboarding_pending: true },
  };
  assert.equal(mobileNextPath({ staff: false, user: pending }), "/mon-compte/bienvenue");
  assert.equal(
    mobileNextPath({
      staff: false,
      user: { id: "u1", email: "a@b.fr", app_metadata: { must_set_password: true } },
    }),
    "/connexion/mot-de-passe"
  );
  assert.equal(
    mobileNextPath({
      staff: false,
      user: { id: "u1", email: "a@b.fr", app_metadata: { client_onboarding_done: true } },
    }),
    "/mon-compte"
  );
});

test("le snapshot n’expose pas le JWT", () => {
  const snap = mobileSessionSnapshot({
    user: { id: "u1", email: "a@b.fr", app_metadata: {} },
    customer: { id: "c1", first_name: "Ada", last_name: "Lovelace", phone: null, email: "a@b.fr" },
  });
  assert.equal(snap.customer.needs_phone, true);
  assert.equal(snap.screen, "home");
  assert.equal("access_token" in snap, false);
});

test("les Universal Links extraient le code et le jeton", () => {
  assert.equal(entryCodeFromPath("/e/AB23CD45"), "AB23CD45");
  assert.equal(entryCodeFromPath("/e/c/AB23CD45"), "AB23CD45");
  assert.equal(entryCodeFromPath("/e/not-a-code"), null);
  const secrets = callbackSecretsFromUrl(
    "https://travelba.fr/auth/callback?token_hash=hashedtokenvalue123&type=magiclink"
  );
  assert.equal(secrets.token_hash, "hashedtokenvalue123");
  assert.equal(secrets.type, "magiclink");
});

test("les tokens session exigent access et refresh", () => {
  assert.equal(mobileSessionTokens(null), null);
  assert.equal(mobileSessionTokens({ access_token: "x", refresh_token: "y" }), null);
  const tokens = mobileSessionTokens({
    access_token: "a".repeat(24),
    refresh_token: "b".repeat(24),
    expires_in: 120,
  });
  assert.equal(tokens?.token_type, "bearer");
  assert.equal(tokens?.expires_in, 120);
});

test("les chemins web correspondent aux écrans natifs", () => {
  assert.equal(mobileScreenForPath("/connexion/mot-de-passe"), "password");
  assert.equal(mobileScreenForPath("/mon-compte/bienvenue"), "welcome");
  assert.equal(mobileScreenForPath("/mon-compte/profil/documents"), "profile");
  assert.equal(mobileScreenForPath("/mon-compte/reservations/TB-1"), "bookings");
  assert.equal(mobileScreenForPath("/mon-compte/transactions"), "transactions");
});
