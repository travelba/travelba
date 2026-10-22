import assert from "node:assert/strict";
import test from "node:test";
import {
  frenchCancellation,
  frenchCity,
  frenchHotelLine,
  frenchHotelProse,
  groupAdvantages,
  readStayRate,
  rememberHotelFrench,
} from "./hotel-fr";

test("chambre, pension et annulation se lisent en français", () => {
  assert.equal(frenchHotelLine("Deluxe King Room with City View"), "Chambre deluxe, lit king, vue ville");
  assert.equal(frenchHotelLine("Junior Suite"), "Suite junior");
  assert.equal(frenchHotelLine("Room only"), "Chambre seule");
  assert.equal(frenchHotelLine("Flexible Rate, Bed and Breakfast"), "Tarif flexible · Petit-déjeuner inclus");
  assert.equal(frenchCancellation("Free cancellation until 18:00 on 12 Mar 2026"), "Gratuite jusqu’au 12 mars 2026, 18 h");
  assert.equal(frenchCancellation("Non-refundable"), "Non remboursable");
  assert.equal(frenchCancellation("Room"), "Confirmée par l’agence avant tout paiement");
  assert.equal(frenchHotelLine("Room"), "Room");
  assert.equal(frenchCity("London, United Kingdom"), "Londres");
  assert.equal(frenchHotelLine("Chambre deluxe, lit king"), "Chambre deluxe, lit king");
  const read = readStayRate({
    title: "Tarif flexible · Petit-déjeuner inclus",
    cancellation: "Gratuite jusqu’au 12 mars 2026, 18 h",
    benefits: ["Surclassement"],
  });
  assert.equal(read.title, "Tarif flexible");
  assert.equal(read.board, "Petit-déjeuner inclus");
  assert.equal(read.cancellation, "Gratuite jusqu’au 12 mars 2026, 18 h");
  const firm = readStayRate({ title: "Non-refundable", cancellation: "Room", benefits: [] });
  assert.equal(firm.title, "Non remboursable");
  assert.equal(firm.cancellation, "Non remboursable");
  const shown = readStayRate({
    title: "Non remboursable",
    cancellation: "Confirmée par l’agence avant tout paiement",
    benefits: [],
  });
  assert.equal(shown.cancellation, "Non remboursable");
  const kept = readStayRate({
    title: "Non-refundable",
    cancellation: "Free cancellation until 18:00 on 12 Mar 2026",
    benefits: [],
  });
  assert.equal(kept.cancellation, "Gratuite jusqu’au 12 mars 2026, 18 h");
  assert.deepEqual(
    groupAdvantages(["Petit-déjeuner offert", "Surclassement"]).map((group) => group.title),
    ["Table", "Chambre"]
  );
});

test("un paragraphe reconnu reste en cache", () => {
  const source = "A quiet house overlooking the river, with rooms dressed in linen and a long garden.";
  assert.equal(frenchHotelProse(source).includes(source), true);
  rememberHotelFrench(source, "Une maison calme, au bord du fleuve, chambres de lin et un long jardin.");
  assert.equal(frenchHotelProse(source), "Une maison calme, au bord du fleuve, chambres de lin et un long jardin.");
  rememberHotelFrench(source, "The room stays in English with breakfast");
  assert.equal(frenchHotelProse(source), "Une maison calme, au bord du fleuve, chambres de lin et un long jardin.");
});
