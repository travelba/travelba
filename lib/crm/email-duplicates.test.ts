import assert from "node:assert/strict";
import test from "node:test";
import { dismissEmailWarnings, groupAttachedEmails, isDismissedEmail } from "./email-duplicates";

test("un transfert et l’original du même billet ne font qu’un doublon", () => {
  const grouped = groupAttachedEmails([
    {
      id: "fwd",
      subject: "Fw: Votre reçu de billet électronique : MARTIN/LUCIE 04DEC2026 PARIS ROME",
      received_at: "2026-09-30T16:31:00.000Z",
    },
    {
      id: "orig",
      subject: "Votre reçu de billet électronique : MARTIN/LUCIE 04DEC2026 PARIS ROME",
      received_at: "2026-09-30T14:08:00.000Z",
    },
    {
      id: "other",
      subject: "Votre reçu de billet électronique : DURAND/PAUL 04DEC2026 PARIS ROME",
      received_at: "2026-09-30T14:08:00.000Z",
    },
  ]);
  assert.deepEqual(
    grouped.duplicates.map((row) => row.id),
    ["fwd"]
  );
  assert.match(grouped.duplicates[0]?.label || "", /MARTIN/);
  assert.equal(grouped.sources.some((row) => row.id === "orig"), true);
  assert.equal(grouped.sources.some((row) => row.id === "other"), true);
  assert.equal(grouped.duplicates.some((row) => row.id === "other"), false);
});

test("deux confirmations du même hôtel se regroupent, Milano et Milan compris", () => {
  const grouped = groupAttachedEmails([
    {
      id: "a",
      subject: "Four Seasons Hotel Milano",
      received_at: "2026-09-29T15:23:00.000Z",
      extract: { items: [{ kind: "hotel", title: "Four Seasons Hotel Milano", start_at: "2026-12-04" }] },
    },
    {
      id: "b",
      subject: "Four Seasons Hotel Milan",
      received_at: "2026-09-29T15:24:00.000Z",
      extract: { items: [{ kind: "hotel", title: "Four Seasons Hotel Milan", start_at: "2026-12-04" }] },
    },
  ]);
  assert.equal(grouped.duplicates.length, 1);
  assert.equal(grouped.sources.length, 1);
});

test("écarter marque le mail sans le retirer de la liste source", () => {
  const warnings = dismissEmailWarnings([]);
  assert.equal(isDismissedEmail({ warnings }), true);
  const grouped = groupAttachedEmails([
    {
      id: "gone",
      subject: "Fw: Votre reçu de billet électronique : MARTIN/LUCIE 04DEC2026 PARIS ROME",
      received_at: "2026-09-30T16:31:00.000Z",
      warnings,
    },
    {
      id: "kept",
      subject: "Votre reçu de billet électronique : MARTIN/LUCIE 04DEC2026 PARIS ROME",
      received_at: "2026-09-30T14:08:00.000Z",
    },
  ]);
  assert.equal(grouped.duplicates.length, 0);
  assert.equal(grouped.sources[0]?.id, "kept");
});
