import assert from "node:assert/strict";
import test from "node:test";
import { CLIENT_ONBOARDING_STEPS, onboardingCopyBlob } from "./onboarding";

test("la bienvenue présente passeport, itinéraire, services, dépenses et formalités", () => {
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.id),
    ["passeport", "carnet", "services", "depenses", "formalites"]
  );
  const blob = onboardingCopyBlob().toLowerCase();
  for (const word of ["passeport", "itinéraire", "chauffeur", "vip airport", "esta", "eta", "eta-il"]) {
    assert.equal(blob.includes(word), true, word);
  }
  assert.equal(
    CLIENT_ONBOARDING_STEPS.find((step) => step.id === "formalites")?.title,
    "ESTA, ETA, ETA-IL"
  );
});

test("la bienvenue ne promet ni brouillon, ni carte, ni montant", () => {
  const blob = onboardingCopyBlob().toLowerCase();
  assert.equal(blob.includes("brouillon"), false);
  assert.equal(blob.includes("carte"), false);
  assert.equal(blob.includes("draft"), false);
  assert.equal(blob.includes("montant"), false);
});
