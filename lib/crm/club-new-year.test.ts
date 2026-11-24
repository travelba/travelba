import assert from "node:assert/strict";
import test from "node:test";
import {
  CLUB_NEW_YEAR_AT,
  newYearGreeting,
  newYearMessage,
  planNewYearExtension,
  whatsappNewYearPayload,
} from "./club-new-year";

test("le 1er janvier salue une fois, et la prolongation reste listée tant que le flag est éteint", () => {
  assert.equal(newYearGreeting("Camille"), "Bonjour Camille.");
  assert.equal(newYearGreeting("  "), "Bonjour.");
  assert.equal(newYearMessage("").startsWith("Bonjour. Le Travel Club TBA"), true);
  assert.equal(newYearMessage("Camille").includes("Bonjour Bonjour"), false);
  assert.doesNotMatch(newYearMessage("Camille"), /€|gestionnaire/);
  const before = planNewYearExtension({
    now: new Date("2026-12-31T23:29:00.000Z"),
    enabled: true,
    alreadySent: new Set(),
    members: [{ id: "a", firstName: "Camille", phone: "+33612345678", clubRank: "platinum", endsOn: "2026-12-31" }],
  });
  assert.equal(before.due, false);
  assert.equal(before.dryRun, true);
  assert.equal(before.recipients.length, 1);
  const due = planNewYearExtension({
    now: new Date(CLUB_NEW_YEAR_AT),
    enabled: false,
    alreadySent: new Set(),
    members: [
      { id: "a", firstName: "", phone: "+33612345678", clubRank: "platinum", endsOn: "2026-12-31" },
      { id: "b", firstName: "Léa", phone: null, clubRank: "platinum", endsOn: "2026-12-31" },
      { id: "c", firstName: "Paul", phone: "+33600000000", clubRank: "platinum", endsOn: "2027-12-31" },
    ],
  });
  assert.equal(due.dryRun, true);
  assert.deepEqual(
    due.recipients.map((row) => row.id),
    ["a", "b"]
  );
  assert.equal(due.recipients[0]?.greeting, "Bonjour.");
  assert.equal(due.recipients[1]?.send, false);
  const again = planNewYearExtension({
    now: new Date(CLUB_NEW_YEAR_AT),
    enabled: true,
    alreadySent: new Set(["a"]),
    members: [{ id: "a", firstName: "Camille", phone: "+33612345678", clubRank: "platinum", endsOn: "2026-12-31" }],
  });
  assert.equal(again.dryRun, false);
  assert.equal(again.recipients.length, 0);
  const payload = whatsappNewYearPayload({
    to: "+33 6 12 34 56 78",
    template: "bonne_annee_prolongation",
    lang: "fr",
    firstName: "Camille",
  });
  assert.equal(payload.template.name, "bonne_annee_prolongation");
  assert.equal(payload.template.components[0]?.parameters[0]?.text, "Bonjour Camille.");
});
