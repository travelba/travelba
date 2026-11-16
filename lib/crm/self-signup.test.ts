import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ACCOUNT_SELF,
  SELF_SERVICE_DEFAULTS,
  completeSignupDecision,
  decideSelfServiceSettings,
  emailSignupDecision,
  ficheSignupFields,
  googleNameParts,
  googleSignupDecision,
  identityDecision,
  inscriptionRedirect,
  normalizeSignupPhone,
  passwordDecision,
  selfServiceBookingBlock,
  selfServiceMetadata,
  signupStep,
} from "./self-signup";

const root = join(import.meta.dirname, "../..");

test("Google propose le nom, l’inscrit le confirme", () => {
  assert.deepEqual(googleNameParts({ given: "Ada", family: "Martin" }), { firstName: "Ada", lastName: "Martin" });
  assert.deepEqual(googleNameParts({ full: "Ada Martin" }), { firstName: "Ada", lastName: "Martin" });
  assert.equal(identityDecision({ firstName: "A", lastName: "Martin" }).ok, false);
  assert.equal(identityDecision({ firstName: "Ada", lastName: "Martin" }).ok, true);
});

test("le téléphone français devient un numéro international", () => {
  assert.equal(normalizeSignupPhone("06 12 34 56 78").ok && normalizeSignupPhone("06 12 34 56 78").e164, "+33612345678");
  assert.equal(normalizeSignupPhone("+1 202 555 0143").ok, true);
  assert.equal(normalizeSignupPhone("123").ok, false);
});

test("une adresse de l’agence ou une fiche invitée ne devient pas autonome", () => {
  assert.equal(googleSignupDecision({ email: "ada@travelba.fr", staff: false, userId: "u1", existing: null }).action, "refuse");
  assert.equal(googleSignupDecision({ email: "ada@gmail.com", staff: true, userId: "u1", existing: null }).action, "refuse");
  const invited = googleSignupDecision({
    email: "ada@gmail.com",
    staff: false,
    userId: "u1",
    existing: { id: "c1", authUserId: null, origin: "invited" },
  });
  assert.equal(invited.action, "enter");
  assert.equal(invited.action === "enter" && invited.selfService, false);
  assert.equal(invited.action === "enter" && invited.link, true);
  const taken = googleSignupDecision({
    email: "ada@gmail.com",
    staff: false,
    userId: "u2",
    existing: { id: "c1", authUserId: "u1", origin: "invited" },
  });
  assert.equal(taken.action, "refuse");
  assert.equal(googleSignupDecision({ email: "ada@gmail.com", staff: false, userId: "u1", existing: null }).action, "create");
  assert.equal(emailSignupDecision({ email: "ada@gmail.com", staff: false, taken: true }).ok, false);
  assert.equal(emailSignupDecision({ email: "ada@gmail.com", staff: false, taken: false }).ok, true);
  assert.equal(passwordDecision("court").ok, false);
  assert.equal(passwordDecision("motdepasse").ok, true);
});

test("l’ouverture attend le nom, le téléphone, la carte et les conditions", () => {
  const empty = { firstName: "", lastName: "", phoneVerifiedAt: null, hasCard: false, termsAt: null, completedAt: null };
  assert.equal(signupStep(empty), "identite");
  assert.equal(signupStep({ ...empty, firstName: "Ada", lastName: "Martin" }), "telephone");
  assert.equal(signupStep({ ...empty, firstName: "Ada", lastName: "Martin", phoneVerifiedAt: "2026-11-14" }), "carte");
  assert.equal(
    signupStep({ ...empty, firstName: "Ada", lastName: "Martin", phoneVerifiedAt: "2026-11-14", hasCard: true }),
    "conditions"
  );
  const ready = { ...empty, firstName: "Ada", lastName: "Martin", phoneVerifiedAt: "2026-11-14", hasCard: true, termsAt: "2026-11-14" };
  assert.equal(completeSignupDecision(ready).ok, true);
  assert.equal(completeSignupDecision({ ...ready, hasCard: false }).ok, false);
  assert.equal(selfServiceMetadata(false).signup_complete, false);
  assert.equal(selfServiceMetadata(true).account_origin, ACCOUNT_SELF);
});

test("un inscrit autonome ne réserve pas sans carte, au-dessus du plafond, ou si l’agence a coupé", () => {
  const base = {
    origin: ACCOUNT_SELF,
    onHold: false,
    phoneVerified: true,
    hasCard: true,
    sellCents: 20_000,
    currency: "EUR",
    bookingsToday: 0,
    settings: { ...SELF_SERVICE_DEFAULTS },
  };
  assert.equal(selfServiceBookingBlock({ ...base, origin: "invited" }), null);
  assert.equal(selfServiceBookingBlock(base), null);
  assert.match(selfServiceBookingBlock({ ...base, hasCard: false }) || "", /carte/);
  assert.match(selfServiceBookingBlock({ ...base, settings: { ...base.settings, enabled: false } }) || "", /suspendues/);
  assert.match(selfServiceBookingBlock({ ...base, sellCents: base.settings.maxStayCents + 1 }) || "", /plafond/);
  assert.match(selfServiceBookingBlock({ ...base, bookingsToday: base.settings.bookingsPerDay }) || "", /jour/);
  assert.match(selfServiceBookingBlock({ ...base, currency: "USD" }) || "", /euros/);
  const saved = decideSelfServiceSettings({ actor: "admin", value: { enabled: false, maxStayCents: 50_000, searchesPerHour: 5, bookingsPerDay: 1 } });
  assert.equal(saved.ok && saved.settings.enabled, false);
  assert.equal(saved.ok && saved.settings.maxStayCents, 50_000);
  assert.equal(decideSelfServiceSettings({ actor: "agent", value: {} }).ok, false);
});

test("la fiche nomme l’origine, le proxy garde l’inscrit sur l’inscription", () => {
  assert.deepEqual(ficheSignupFields({ account_origin: "invited", phone_verified_at: null }), { origine: "invite" });
  assert.deepEqual(ficheSignupFields({ account_origin: ACCOUNT_SELF, phone_verified_at: "2026-11-14" }), {
    origine: "autonome",
    telephone_verifie: true,
  });
  const self = { origin: ACCOUNT_SELF, signupComplete: false, staff: false };
  assert.equal(inscriptionRedirect({ pathname: "/mon-compte", signupCookie: "pending", ...self }), "/inscription");
  assert.equal(
    inscriptionRedirect({ pathname: "/inscription", signupCookie: "done", ...self }),
    "/mon-compte/hotels"
  );
  assert.equal(inscriptionRedirect({ pathname: "/mon-compte", signupCookie: "pending", ...self, staff: true }), null);
  assert.equal(
    inscriptionRedirect({ pathname: "/mon-compte/hotels", signupCookie: null, origin: "invited", signupComplete: false, staff: false }),
    null
  );
  assert.equal(
    inscriptionRedirect({ pathname: "/mon-compte", signupCookie: "done", origin: ACCOUNT_SELF, signupComplete: true, staff: false }),
    "/mon-compte/hotels"
  );
  assert.equal(
    inscriptionRedirect({
      pathname: "/mon-compte/profil/documents",
      signupCookie: "done",
      origin: ACCOUNT_SELF,
      signupComplete: true,
      staff: false,
    }),
    "/mon-compte/profil"
  );
});

test("la migration pose l’origine et protège les colonnes", () => {
  const sql = readFileSync(join(root, "supabase/migrations/20261114120000_self_service_signup.sql"), "utf8");
  assert.match(sql, /account_origin text not null default 'invited'/);
  assert.match(sql, /phone_verified_at timestamptz/);
  assert.match(sql, /signup_completed_at timestamptz/);
  assert.match(sql, /signup_terms_at timestamptz/);
  assert.match(sql, /new.account_origin := old.account_origin/);
  assert.match(sql, /kind in \([\s\S]*'signup'/);
});
