import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  missingRematchColumn,
  pickRematchBatch,
  REMATCH_RETRY_AFTER_MS,
  rematchAttemptDue,
} from "./email-rematch-queue";

const NOW = Date.parse("2026-11-17T15:00:00.000Z");

function row(id: string, received: string, attempted: string | null = null) {
  return { id, received_at: received, rematch_attempted_at: attempted };
}

describe("file de reprise des mails", () => {
  it("prend d’abord les jamais tentés, du plus ancien au plus récent", () => {
    const khiari = [
      row("e3c5def5", "2026-11-12T08:00:00.000Z"),
      row("174ec8f4", "2026-11-12T09:00:00.000Z"),
      row("2f7218d4", "2026-11-12T10:00:00.000Z"),
    ];
    const recent = Array.from({ length: 40 }, (_, index) =>
      row(`recent-${index}`, `2026-11-16T${String(index % 24).padStart(2, "0")}:00:00.000Z`)
    );
    const picked = pickRematchBatch([...recent, ...khiari], 8, NOW).map((item) => item.id);
    assert.deepEqual(picked.slice(0, 3), ["e3c5def5", "174ec8f4", "2f7218d4"]);
    assert.equal(picked.length, 8);
    assert.equal(picked.includes("recent-39"), false);
  });

  it("laisse passer le délai avant de retenter, puis reprend la tentative la plus ancienne", () => {
    const fresh = new Date(NOW - 5 * 60 * 1000).toISOString();
    const stale = new Date(NOW - REMATCH_RETRY_AFTER_MS - 1000).toISOString();
    const older = new Date(NOW - 3 * REMATCH_RETRY_AFTER_MS).toISOString();
    assert.equal(rematchAttemptDue(fresh, NOW), false);
    assert.equal(rematchAttemptDue(stale, NOW), true);
    assert.equal(rematchAttemptDue(null, NOW), true);
    const picked = pickRematchBatch(
      [
        row("juste-tente", "2026-11-16T12:00:00.000Z", fresh),
        row("ancien-tente", "2026-11-14T12:00:00.000Z", stale),
        row("plus-ancien", "2026-11-13T12:00:00.000Z", older),
        row("jamais", "2026-11-12T12:00:00.000Z"),
      ],
      8,
      NOW
    ).map((item) => item.id);
    assert.deepEqual(picked, ["jamais", "plus-ancien", "ancien-tente"]);
  });

  it("reconnaît une colonne de reprise absente", () => {
    assert.equal(
      missingRematchColumn({ code: "42703", message: "column rematch_attempted_at does not exist" }),
      true
    );
    assert.equal(missingRematchColumn({ code: "PGRST204", message: "Could not find the 'rematch_attempts' column" }), true);
    assert.equal(missingRematchColumn({ code: "42703", message: "column received_at does not exist" }), false);
    assert.equal(missingRematchColumn(null), false);
  });
});
