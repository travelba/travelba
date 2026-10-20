import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  CLIENT_ONBOARDING_STEPS,
  ONBOARDING_BACK_LABEL,
  ONBOARDING_NEXT_LABEL,
  ONBOARDING_REPLAY_LABEL,
  ONBOARDING_SKIP_LABEL,
  onboardingCopyBlob,
} from "./onboarding";
import { onboardingReplayHref } from "./session";

test("la bienvenue suit les captures de l’espace client, dans l’ordre de la présentation", () => {
  assert.deepEqual(
    CLIENT_ONBOARDING_STEPS.map((step) => step.id),
    [
      "connexion",
      "accueil",
      "a-venir",
      "a-jour",
      "itineraire",
      "pieces",
      "whatsapp",
      "concierge",
      "encours",
      "paiement",
      "coffre",
    ]
  );
  for (const step of CLIENT_ONBOARDING_STEPS) {
    assert.match(step.image, /^\/onboarding\/.+\.webp$/);
    assert.equal(fs.existsSync(`public${step.image}`), true, step.image);
    assert.equal(step.title.length > 0, true);
    assert.equal(step.legend.length > 0, true);
  }
  assert.equal(
    CLIENT_ONBOARDING_STEPS[0].title,
    "Un espace client privé, ouvert sur invitation"
  );
  assert.equal(
    CLIENT_ONBOARDING_STEPS.at(-1)?.title,
    "Passeports, ESTA, ETA et visas : rien n’est oublié"
  );
});

test("la bienvenue se passe et se revoit, sans promettre un brouillon", () => {
  const blob = onboardingCopyBlob();
  const lower = blob.toLowerCase();
  assert.equal(blob.includes(ONBOARDING_SKIP_LABEL), true);
  assert.equal(blob.includes(ONBOARDING_BACK_LABEL), true);
  assert.equal(blob.includes(ONBOARDING_NEXT_LABEL), true);
  assert.equal(ONBOARDING_NEXT_LABEL, "Suivant");
  assert.equal(blob.includes(ONBOARDING_REPLAY_LABEL), true);
  assert.equal(lower.includes("brouillon"), false);
  assert.equal(lower.includes("draft"), false);
  assert.equal(onboardingReplayHref(), "/mon-compte/bienvenue?revoir=1");
  assert.equal(onboardingReplayHref("/exemple"), "/exemple/bienvenue?revoir=1");
});
