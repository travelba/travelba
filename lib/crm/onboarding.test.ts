import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_ONBOARDING_STEPS, PROFILE_ONBOARDING_HINTS, onboardingCopyBlob } from "./onboarding";
import { CLIENT_PROFILE_NAV } from "./profile-nav";

test("la bienvenue suit les quatre onglets de l’espace client", () => {
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.id),
    ["accueil", "carnet", "transactions", "profil"]
  );
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.kicker),
    ["Accueil", "Réservations", "Transactions", "Mon compte"]
  );
  assert.deepEqual(
    CLIENT_PROFILE_NAV.map((section) => section.label),
    ["Vous", "Pièces", "Voyageurs", "Facturation"]
  );
  for (const section of CLIENT_PROFILE_NAV) {
    assert.ok(PROFILE_ONBOARDING_HINTS[section.label]);
  }
});

test("la bienvenue nomme l’accueil, le carnet, l’encours et la fiche", () => {
  const blob = onboardingCopyBlob().toLowerCase();
  assert.equal(blob.includes("prochain séjour"), true);
  assert.equal(blob.includes("whatsapp"), true);
  assert.equal(blob.includes("agenda"), true);
  assert.equal(blob.includes("formalité"), true);
  assert.equal(blob.includes("encours"), true);
  assert.equal(blob.includes("relevé"), true);
  assert.equal(blob.includes("passeports"), true);
});

test("la bienvenue ne promet ni brouillon ni carte", () => {
  const blob = onboardingCopyBlob().toLowerCase();
  assert.equal(blob.includes("brouillon"), false);
  assert.equal(blob.includes("carte"), false);
  assert.equal(blob.includes("draft"), false);
});
