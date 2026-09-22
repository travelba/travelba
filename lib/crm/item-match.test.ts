import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchingItem, itemMatchKey, mergeExtractItems } from "./item-match";

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

  it("ne fusionne pas forfaits et cours maeva le même jour", () => {
    const merged = mergeExtractItems([
      {
        kind: "activity",
        title: "Forfaits Les Portes du Soleil",
        start_at: "2027-03-20",
        confirmation_ref: null,
      },
      {
        kind: "activity",
        title: "Cours collectifs journée",
        start_at: "2027-03-20",
        confirmation_ref: null,
      },
    ]);
    assert.equal(merged.length, 2);
    const hit = findMatchingItem(merged, {
      kind: "activity",
      title: "Forfaits Les Portes du Soleil",
      start_at: "2027-03-20",
    });
    assert.equal(hit?.title, "Forfaits Les Portes du Soleil");
  });

  it("fusionne une assurance réimportée par titre et jour", () => {
    const existing = [
      { kind: "insurance", title: "Assurance Multirisques", start_at: "2027-03-20" },
    ];
    const hit = findMatchingItem(existing, {
      kind: "insurance",
      title: "Assurance Multirisques",
      start_at: "2027-03-20",
    });
    assert.equal(hit?.title, "Assurance Multirisques");
  });

  it("fusionne cinq e-tickets du même segment", () => {
    const merged = mergeExtractItems(
      Array.from({ length: 5 }, () => ({
        kind: "flight",
        confirmation_ref: "XLDW2Z",
        start_at: "2026-08-12T09:50:00",
        details: { flight_number: "CM 18" },
      }))
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.details?.ticket_count, 5);
  });
});
