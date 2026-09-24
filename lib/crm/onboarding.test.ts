import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_ONBOARDING_STEPS, PROFILE_ONBOARDING_HINTS, onboardingCopyBlob } from "./onboarding";
import { CLIENT_PROFILE_NAV } from "./profile-nav";

test("la bienvenue décrit le carnet publié, le livre comptabilisé et les quatre onglets", () => {
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.id),
    ["carnet", "transactions", "profil"]
  );
  assert.deepEqual(
    CLIENT_PROFILE_NAV.map((section) => section.label),
    ["Vous", "Pièces", "Voyageurs", "Facturation"]
  );
  for (const section of CLIENT_PROFILE_NAV) {
    assert.ok(PROFILE_ONBOARDING_HINTS[section.label]);
  }
});

test("la bienvenue ne promet ni brouillon ni carte", () => {
  const blob = onboardingCopyBlob().toLowerCase();
  assert.equal(blob.includes("brouillon"), false);
  assert.equal(blob.includes("carte"), false);
  assert.equal(blob.includes("draft"), false);
});
