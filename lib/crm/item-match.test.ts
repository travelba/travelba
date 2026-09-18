import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchingItem, itemMatchKey } from "./item-match";

describe("itemMatchKey", () => {
  it("fusionne deux vols au même numéro et jour", () => {
    const a = {
      kind: "flight",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T10:25:00Z",
      details: { flight_number: "AF 123" },
    };
    const b = {
      kind: "flight",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T10:25:00+02:00",
      details: { flight_number: "AF123" },
    };
    assert.equal(itemMatchKey(a), itemMatchKey(b));
  });

  it("ne fusionne pas aller et retour", () => {
    const out = itemMatchKey({
      kind: "flight",
      start_at: "2026-08-12T10:00:00Z",
      details: { flight_number: "AF123" },
    });
    const back = itemMatchKey({
      kind: "flight",
      start_at: "2026-08-20T18:00:00Z",
      details: { flight_number: "AF124" },
    });
    assert.notEqual(out, back);
  });

  it("trouve l’hôtel existant par réf.", () => {
    const existing = [{ kind: "hotel", confirmation_ref: "97620170", title: "Andaz" }];
    const hit = findMatchingItem(existing, {
      kind: "hotel",
      confirmation_ref: "97620170",
      title: "Andaz Papagayo",
    });
    assert.equal(hit?.title, "Andaz");
  });

  it("n’invente pas de clé sans réf. ni dates", () => {
    assert.equal(itemMatchKey({ kind: "activity", title: "Spa" }), null);
  });
});
