import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  identityFromJournalDiff,
  removedStepSummary,
  removedStepsFromJournal,
  stepJournalDiff,
  updatedStepSummary,
} from "./step-journal";

describe("journal des étapes enregistrées", () => {
  it("nomme chaque carte retirée et chaque carte modifiée", () => {
    assert.equal(removedStepSummary("Nice → Dubaï"), "Étape retirée du carnet : Nice → Dubaï");
    assert.equal(updatedStepSummary("Ocean Park"), "Étape du carnet modifiée : Ocean Park");
    assert.equal(removedStepSummary("  "), "Étape retirée du carnet : Étape");
  });

  it("retrouve une carte retirée à partir du journal, sans les voyageurs", () => {
    const diff = stepJournalDiff({
      kind: "flight",
      title: "Nice → Dubaï",
      confirmation_ref: "KDP4AS",
      start_at: "2026-11-20T10:00:00",
      supplier: "Emirates",
      details: {
        flight_number: "EK 78",
        pnr: "KDP4AS",
        passengers: [{ first_name: "A", last_name: "B" }],
      },
    });
    assert.equal("passengers" in diff, false);
    const steps = removedStepsFromJournal([
      { action: "create", summary: "Étape ajoutée au carnet.", diff: null },
      { action: "delete", summary: "Étape retirée du carnet.", diff: null },
      { action: "delete", summary: removedStepSummary("Nice → Dubaï"), diff },
    ]);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].confirmation_ref, "KDP4AS");
    assert.equal(identityFromJournalDiff(diff)?.details?.flight_number, "EK 78");
    assert.equal(identityFromJournalDiff(null), null);
  });

  it("l’enregistrement groupé et le retrait unitaire écrivent ces lignes", () => {
    const route = readFileSync(new URL("../../app/api/admin/bookings/[id]/items/route.ts", import.meta.url), "utf8");
    const trip = readFileSync(new URL("./mcp-trip.ts", import.meta.url), "utf8");
    assert.match(route, /recordStepJournals/);
    assert.match(route, /deleted: deletedRows/);
    assert.match(route, /updated: updatedRows/);
    assert.match(trip, /recordStepJournals/);
  });
});
