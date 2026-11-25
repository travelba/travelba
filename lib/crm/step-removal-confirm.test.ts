import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cardHasOnlineCheckin, removalConfirm, removalIsSensitive } from "./step-removal-confirm";

describe("confirmation avant de retirer des étapes", () => {
  it("liste les cartes, et avertit plus fort si l’enregistrement, la carte d’embarquement ou une pièce est là", () => {
    const plain = removalConfirm([{ id: "a", title: "Transfert aéroport", checkin: false, boardingPass: false, documents: 0 }]);
    assert.equal(plain.title, "Retirer cette étape du carnet ?");
    assert.deepEqual(plain.lines, ["Transfert aéroport"]);
    assert.equal(plain.warning, null);

    const flight = {
      id: "b",
      title: "Nice → Dubaï",
      checkin: true,
      boardingPass: true,
      documents: 1,
    };
    assert.equal(removalIsSensitive(flight), true);
    const warned = removalConfirm([
      flight,
      { id: "c", title: "Ocean Park", checkin: false, boardingPass: false, documents: 0 },
    ]);
    assert.equal(warned.title, "Retirer ces étapes du carnet ?");
    assert.match(warned.warning || "", /enregistrement en ligne/);
    assert.match(warned.lines[0], /Nice → Dubaï — enregistrement en ligne, carte d’embarquement, une pièce liée/);
    assert.equal(warned.lines[1], "Ocean Park");
  });

  it("un enregistrement encore « à faire », sans acteur, n’est pas un enregistrement posé", () => {
    assert.equal(cardHasOnlineCheckin(null), false);
    assert.equal(cardHasOnlineCheckin({ status: "a_faire", actor: null }), false);
    assert.equal(cardHasOnlineCheckin({ status: "fait", actor: "agence" }), true);
    assert.equal(cardHasOnlineCheckin({ status: "cartes_recues", actor: null }), true);
    assert.equal(cardHasOnlineCheckin({ status: "a_faire", actor: "bot" }), true);
  });

  it("l’écran demande confirmation avant d’enregistrer les retraits", () => {
    const panel = readFileSync(new URL("../../components/admin/BookingItemsPanel.tsx", import.meta.url), "utf8");
    assert.match(panel, /removalConfirm/);
    assert.match(panel, /cardHasOnlineCheckin/);
    assert.match(panel, /return "annule"/);
  });
});
