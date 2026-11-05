import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LE_BOOKINGS_MAIL,
  LE_NON_REFUNDABLE,
  leGestureMailto,
  leHiddenCancel,
  lePolicyIsFullCost,
} from "./le-cancel-reason";
import { deadlineStillOpen, leDeadlineIsDateOnly, leDeadlineParisLabel } from "./le-self-book";

const FULL = ["Once booked, you will not be able to cancel the room without incurring the full cost of the booking."];
const now = new Date("2026-11-05T17:29:43.000Z");
const bookedAt = "2026-11-05T17:29:43.000Z";

describe("raison d’annulation Little Emperors", () => {
  it("reconnaît le tarif full cost, pas une date minuit", () => {
    assert.equal(lePolicyIsFullCost(FULL), true);
    assert.equal(leDeadlineIsDateOnly("2026-11-05T00:00:00.000000Z"), true);
    assert.equal(leDeadlineIsDateOnly("2026-11-05"), true);
    assert.equal(leDeadlineIsDateOnly("2027-02-09T18:00:00"), false);
    assert.equal(leDeadlineParisLabel("2026-11-05T00:00:00.000000Z"), "5 novembre 2026");
    assert.equal(deadlineStillOpen("2026-11-05T00:00:00.000000Z", "2026-11-05T17:29:00.000Z"), true);
    assert.equal(deadlineStillOpen("2026-11-05T00:00:00.000000Z", "2026-11-06T00:30:00.000Z"), false);
  });

  it("ne dit pas non remboursable sur la seule deadline de minuit", () => {
    const hidden = leHiddenCancel({
      isCancellable: false,
      deadline: "2026-11-05T00:00:00.000000Z",
      policies: [],
      bookedAt,
      now,
    });
    assert.equal(hidden.kind, "unknown");
  });

  it("nomme le tarif full cost, et la limite réelle déjà passée", () => {
    const firm = leHiddenCancel({
      isCancellable: false,
      deadline: "2026-11-05T00:00:00.000000Z",
      policies: FULL,
      bookedAt,
      now,
    });
    assert.equal(firm.kind, "non_refundable");
    if (firm.kind === "non_refundable") assert.equal(firm.text, LE_NON_REFUNDABLE);

    const late = leHiddenCancel({
      isCancellable: false,
      deadline: "2026-11-01T18:00:00",
      policies: ["Free cancellation until 1 November 2026, 18:00."],
      bookedAt: "2026-10-01T10:00:00.000Z",
      now,
    });
    assert.equal(late.kind, "deadline");
    if (late.kind === "deadline") assert.match(late.text, /heure de Paris/);
  });

  it("laisse le bouton si Little Emperors dit la réservation annulable", () => {
    const open = leHiddenCancel({
      isCancellable: true,
      deadline: "2027-02-09T18:00:00",
      policies: ["Free cancellation until 9 February 2027, 18:00."],
      bookedAt,
      now,
    });
    assert.equal(open.kind, "open");
  });

  it("prépare un mailto sans appeler l’annulation", () => {
    const href = leGestureMailto("Sofitel Biarritz Le Miramar");
    assert.match(href, new RegExp(`^mailto:${LE_BOOKINGS_MAIL}\\?`));
    assert.match(href, /Sofitel/);
    assert.doesNotMatch(href, /cancel/i);
  });
});
