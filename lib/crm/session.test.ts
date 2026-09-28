import assert from "node:assert/strict";
import test from "node:test";
import {
  ONBOARDING_PATH,
  SET_PASSWORD_PATH,
  clientAreaRedirect,
  destinationAfterPassword,
  mustSetPassword,
  needsClientOnboarding,
  pathAfterPassword,
  pathAfterKnownPassword,
  signedInClientDestination,
  shouldForcePasswordSetup,
  withoutMustSetPassword,
  withOnboardingDone,
  withOnboardingPending,
} from "./session";

test("must_set_password only from app_metadata", () => {
  assert.equal(mustSetPassword({ app_metadata: { must_set_password: true } }), true);
  assert.equal(mustSetPassword({ app_metadata: { must_set_password: false } }), false);
  assert.equal(mustSetPassword({ app_metadata: {} }), false);
});

test("recovery and invite always force the password screen", () => {
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: "recovery", next: "/mon-compte" }),
    true
  );
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: "invite", next: "/mon-compte" }),
    true
  );
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: "magiclink", next: "/mon-compte" }),
    false
  );
});

test("après le mot de passe, l’accueil s’ouvre même sans téléphone", () => {
  assert.equal(pathAfterPassword("+33600000000"), "/mon-compte");
  assert.equal(pathAfterPassword("  "), "/mon-compte");
  assert.equal(pathAfterPassword(null), "/mon-compte");
});

test("un collègue arrive dans l’espace agence", () => {
  assert.equal(pathAfterPassword(null, "staff"), "/admin");
  assert.equal(pathAfterPassword("+33600000000", "staff"), "/admin");
});

test("onboarding lives only in app_metadata and only until it is dismissed", () => {
  assert.equal(needsClientOnboarding({ app_metadata: {} }), false);
  assert.equal(needsClientOnboarding({ app_metadata: { client_onboarding_pending: true } }), true);
  assert.equal(
    needsClientOnboarding({
      app_metadata: { client_onboarding_pending: true, client_onboarding_done: true },
    }),
    false
  );
  assert.equal(needsClientOnboarding({ app_metadata: { client_onboarding_done: true } }), false);
});

test("le mot de passe ouvre la bienvenue une fois, puis l’accueil ou la fiche", () => {
  const first = withOnboardingPending({ must_set_password: false });
  assert.equal(destinationAfterPassword(first, "+33600000000"), ONBOARDING_PATH);
  assert.equal(destinationAfterPassword(first, null), ONBOARDING_PATH);

  const again = withOnboardingPending(withOnboardingDone({}));
  assert.equal(again.client_onboarding_pending, false);
  assert.equal(again.client_onboarding_done, true);
  assert.equal(destinationAfterPassword(again, "+33600000000"), "/mon-compte");
  assert.equal(destinationAfterPassword(again, ""), "/mon-compte");
});

test("l’espace client force la bienvenue tant qu’elle n’est pas passée", () => {
  assert.equal(
    clientAreaRedirect("/mon-compte", { mustSetPassword: false, needsOnboarding: true }),
    ONBOARDING_PATH
  );
  assert.equal(
    clientAreaRedirect("/mon-compte/profil", { mustSetPassword: false, needsOnboarding: true }),
    ONBOARDING_PATH
  );
  assert.equal(
    clientAreaRedirect(ONBOARDING_PATH, { mustSetPassword: false, needsOnboarding: true }),
    null
  );
  assert.equal(
    clientAreaRedirect(ONBOARDING_PATH, { mustSetPassword: false, needsOnboarding: false }),
    "/mon-compte"
  );
  assert.equal(
    clientAreaRedirect("/mon-compte/reservations", { mustSetPassword: true, needsOnboarding: true }),
    SET_PASSWORD_PATH
  );
});

test("un staff ne voit pas la bienvenue, même si le drapeau mot de passe est encore là", () => {
  assert.equal(
    signedInClientDestination({ mustSetPassword: false, needsOnboarding: true, staff: true }),
    "/admin"
  );
  assert.equal(
    signedInClientDestination({ mustSetPassword: true, needsOnboarding: true, staff: true }),
    "/admin"
  );
  assert.equal(
    signedInClientDestination({ mustSetPassword: true, needsOnboarding: true, staff: false }),
    SET_PASSWORD_PATH
  );
  assert.equal(
    signedInClientDestination({ mustSetPassword: false, needsOnboarding: true, staff: false }),
    ONBOARDING_PATH
  );
  assert.equal(
    signedInClientDestination({ mustSetPassword: false, needsOnboarding: false, staff: false }),
    "/mon-compte"
  );
});

test("un mot de passe déjà accepté ouvre l’espace, pas la page de définition", () => {
  assert.equal(
    pathAfterKnownPassword({ staff: false, needsOnboarding: false, next: "/mon-compte" }),
    "/mon-compte"
  );
  assert.equal(
    pathAfterKnownPassword({
      staff: false,
      needsOnboarding: false,
      next: SET_PASSWORD_PATH,
    }),
    "/mon-compte"
  );
  assert.equal(
    pathAfterKnownPassword({ staff: false, needsOnboarding: true, next: "/mon-compte" }),
    ONBOARDING_PATH
  );
  assert.equal(
    pathAfterKnownPassword({ staff: true, needsOnboarding: true, next: SET_PASSWORD_PATH }),
    "/admin"
  );
  assert.equal(
    pathAfterKnownPassword({
      staff: false,
      needsOnboarding: false,
      next: "/mon-compte/reservations/TB-1",
    }),
    "/mon-compte/reservations/TB-1"
  );
});

test("retirer le drapeau ne réécrit pas le mot de passe", () => {
  const cleared = withoutMustSetPassword({
    must_set_password: true,
    crm_role: "client",
    client_onboarding_done: true,
  });
  assert.equal(cleared.must_set_password, false);
  assert.equal(cleared.crm_role, "client");
  assert.equal(cleared.client_onboarding_done, true);
  assert.equal("password" in cleared, false);
  assert.equal(withoutMustSetPassword({ crm_role: "admin" }).must_set_password, undefined);
});

test("PKCE reset without type still forces password when next is the set-password page", () => {
  assert.equal(
    shouldForcePasswordSetup({
      flagged: false,
      type: null,
      next: SET_PASSWORD_PATH,
    }),
    true
  );
  assert.equal(
    shouldForcePasswordSetup({ flagged: false, type: null, next: "/mon-compte" }),
    false
  );
});
