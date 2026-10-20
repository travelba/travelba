import assert from "node:assert/strict";
import test from "node:test";
import { HIDDEN_PRICE_LABEL } from "./carnet";
import { encoursCaption, formatDateRangeShort, tripDurationDays } from "./money";
import {
  CLIENT_ONBOARDING_STEPS,
  ONBOARDING_ENTER_LABEL,
  ONBOARDING_FIXTURE,
  ONBOARDING_FRAME,
  ONBOARDING_REPLAY_LABEL,
  ONBOARDING_RESTART_LABEL,
  ONBOARDING_SKIP_LABEL,
  PROFILE_ONBOARDING_HINTS,
  onboardingCopyBlob,
  onboardingStayPhrase,
} from "./onboarding";
import { CLIENT_PROFILE_NAV } from "./profile-nav";
import { onboardingReplayHref } from "./session";

test("la bienvenue parcourt l’accueil, le carnet, le livre et la fiche", () => {
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.id),
    ["accueil", "carnet", "transactions", "profil"]
  );
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.tab),
    ["Accueil", "Réservations", "Transactions", "Mon compte"]
  );
  assert.deepEqual(
    CLIENT_PROFILE_NAV.map((section) => section.label),
    ["Vous", "Pièces", "Voyageurs", "Facturation"]
  );
  const profile = CLIENT_ONBOARDING_STEPS.find((step) => step.id === "profil");
  assert.deepEqual(
    profile?.captions.map((caption) => caption.title),
    CLIENT_PROFILE_NAV.map((section) => section.label)
  );
  for (const section of CLIENT_PROFILE_NAV) {
    assert.equal(PROFILE_ONBOARDING_HINTS[section.label].length > 0, true);
  }
  for (const step of CLIENT_ONBOARDING_STEPS) {
    assert.equal(step.captions.length >= 3, true);
    assert.equal(step.title.length > 0, true);
    assert.equal(step.lead.length > 0, true);
  }
});

test("la bienvenue se passe et se relance, sans promettre un brouillon ni une carte", () => {
  const blob = onboardingCopyBlob();
  const lower = blob.toLowerCase();
  assert.equal(blob.includes(ONBOARDING_SKIP_LABEL), true);
  assert.equal(blob.includes(ONBOARDING_RESTART_LABEL), true);
  assert.equal(blob.includes(ONBOARDING_REPLAY_LABEL), true);
  assert.equal(blob.includes(ONBOARDING_ENTER_LABEL), true);
  assert.equal(lower.includes("brouillon"), false);
  assert.equal(lower.includes("carte"), false);
  assert.equal(lower.includes("draft"), false);
  assert.equal(onboardingReplayHref(), "/mon-compte/bienvenue?revoir=1");
  assert.equal(onboardingReplayHref("/exemple"), "/exemple/bienvenue?revoir=1");
});

test("les légendes ne citent que la ville du séjour, avec la préposition", () => {
  assert.equal(onboardingStayPhrase(), "à New York");
  const blob = onboardingCopyBlob();
  assert.equal(blob.includes("à New York"), true);
  assert.equal(blob.includes(ONBOARDING_FRAME.towardStay), true);
  assert.equal(ONBOARDING_FRAME.towardStay, "Vers New York");
  const lower = blob.toLowerCase();
  for (const banned of ["paris", "cdg", "lyon", "escale", "francfort", "frankfurt", "dubai", "jfk"]) {
    assert.equal(lower.includes(banned), false, banned);
  }
  assert.equal(ONBOARDING_FRAME.priceHidden, HIDDEN_PRICE_LABEL);
  assert.equal(encoursCaption(ONBOARDING_FIXTURE.balance), "Reste à régler");
  assert.equal(ONBOARDING_FIXTURE.receivedAmount - ONBOARDING_FIXTURE.stayAmount, ONBOARDING_FIXTURE.balance);
  assert.equal(tripDurationDays(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end), 3);
  assert.match(formatDateRangeShort(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end), /2026/);
  assert.match(formatDateRangeShort(ONBOARDING_FIXTURE.start, ONBOARDING_FIXTURE.end), /novembre/i);
});
