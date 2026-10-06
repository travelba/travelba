import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderAfterChange, spliceCardsByDate, stepChronoKey } from "./item-order";

function card(id: string, kind: string, start_at: string, sort_order = 0) {
  return { id, kind, start_at, sort_order };
}

describe("ordre des cartes", () => {
  it("place deux vols du même jour par l’heure, l’hôtel sans heure après", () => {
    const early = card("early", "flight", "2026-12-04T15:55:00+00:00", 1);
    const late = card("late", "flight", "2026-12-04T20:55:00+00:00", 0);
    const hotel = card("hotel", "hotel", "2026-12-04T00:00:00+00:00", 2);
    assert.ok(stepChronoKey(early) < stepChronoKey(late));
    assert.ok(stepChronoKey(late) < stepChronoKey(hotel));
    const plan = orderAfterChange({ custom: false, existing: [late, early, hotel], created: [] });
    assert.deepEqual(plan.ids, ["early", "late", "hotel"]);
    assert.equal(plan.custom, false);
  });

  it("glisse une carte nouvelle à sa date sans permuter un rangement", () => {
    const kept = [
      card("a", "flight", "2026-12-04T15:55:00+00:00", 0),
      card("c", "flight", "2026-12-13T16:00:00+00:00", 1),
      card("b", "rail", "2026-12-08T17:35:00+00:00", 2),
    ];
    const incoming = card("d", "rail", "2026-12-09T08:58:00+00:00", 9);
    const spliced = spliceCardsByDate(kept, [incoming]);
    assert.deepEqual(
      spliced.map((item) => item.id),
      ["a", "d", "c", "b"]
    );
    const plan = orderAfterChange({ custom: true, existing: kept, created: [incoming] });
    assert.deepEqual(plan.ids, ["a", "d", "c", "b"]);
    assert.equal(plan.custom, true);
  });

  it("un glisser qui suit les dates enlève le rangement manuel", () => {
    const existing = [
      card("late", "flight", "2026-12-04T20:55:00+00:00", 0),
      card("early", "flight", "2026-12-04T15:55:00+00:00", 1),
    ];
    const plan = orderAfterChange({
      custom: true,
      existing,
      created: [],
      submittedIds: ["early", "late"],
    });
    assert.deepEqual(plan.ids, ["early", "late"]);
    assert.equal(plan.custom, false);
  });
});
