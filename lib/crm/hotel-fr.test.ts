import assert from "node:assert/strict";
import test from "node:test";
import {
  cancellationPhrase,
  clientRateTitle,
  frenchCancellation,
  frenchCity,
  frenchHotelLine,
  frenchClientProse,
  frenchHotelProse,
  groupAdvantages,
  readStayRate,
  rememberHotelFrench,
  roomFacts,
} from "./hotel-fr";
import { travelPrivileges } from "./hotel-journey";

test("chambre, pension et annulation se lisent en français", () => {
  assert.equal(frenchHotelLine("Deluxe King Room with City View"), "Chambre deluxe, lit king, vue ville");
  assert.equal(frenchHotelLine("Junior Suite"), "Suite junior");
  assert.equal(frenchHotelLine("Room only"), "Chambre seule");
  assert.equal(frenchHotelLine("Flexible Rate, Bed and Breakfast"), "Tarif flexible · Petit-déjeuner inclus");
  assert.equal(frenchHotelLine("Best Available Rate"), "Meilleur tarif disponible");
  assert.equal(frenchHotelLine("Best Available Rate (BAR)"), "Meilleur tarif disponible");
  assert.equal(frenchHotelLine("Preferential Rate"), "Tarif préférentiel");
  assert.equal(frenchHotelLine("Saver Rate"), "Tarif économique");
  assert.equal(frenchCancellation("Free cancellation until 18:00 on 12 Mar 2026"), "Gratuite jusqu’au 12 mars 2026, 18 h");
  assert.equal(frenchCancellation("Non-refundable"), "Non remboursable");
  assert.equal(frenchCancellation("Room"), "Confirmée par l’agence avant tout paiement");
  assert.equal(frenchHotelLine("Room"), "Room");
  assert.equal(frenchHotelLine("Executive Room"), "Chambre executive");
  assert.equal(frenchHotelLine("Guest Room"), "Chambre");
  assert.equal(frenchHotelLine("Three Bedroom Ryad"), "Ryad, trois chambres");
  assert.equal(frenchHotelLine("Ocean Deluxe"), "Chambre deluxe");
  assert.equal(frenchHotelLine("Ocean Deluxe Balcony"), "Chambre deluxe, balcon");
  assert.equal(frenchHotelLine("Ocean Family Club"), "Chambre club familiale");
  assert.equal(frenchHotelLine("One Bedroom Suite"), "Suite");
  const saver = readStayRate({ title: "Saver", cancellation: "Room", benefits: [] });
  assert.equal(saver.title, "Tarif économique");
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

test("la chambre et le tarif se lisent sans programme fournisseur", () => {
  const facts = roomFacts({
    name: "Deluxe Guest Room, King",
    size: "44 m2",
    bed: "King",
    view: "River",
    exterior: "Balcony",
  });
  assert.equal(facts.area, "44 m²");
  assert.equal(facts.bed, "lit king");
  assert.match(facts.outlook, /vue fleuve/);
  assert.match(facts.outlook, /balcon/);
  assert.equal(roomFacts({ name: "Chambre", description: "Calme." }).area, "");
  assert.equal(roomFacts({ bed: "2 Doubles" }).bed, "lits doubles");
  assert.equal(clientRateTitle("Marriott Luminous"), "Meilleur tarif disponible");
  assert.equal(clientRateTitle("Best Available Rate"), "Meilleur tarif disponible");
  assert.equal(clientRateTitle("Public"), "Meilleur tarif disponible");
  assert.equal(clientRateTitle("Saver"), "Tarif économique");
  assert.equal(clientRateTitle("Preferential Rate"), "Tarif préférentiel");
  assert.equal(
    cancellationPhrase("Gratuite jusqu’au 26 octobre 2026, 23 h 59"),
    "Annulation gratuite jusqu’au 26 octobre 2026, 23h59"
  );
  assert.equal(cancellationPhrase("Non remboursable"), "Non remboursable");
  assert.deepEqual(
    travelPrivileges(
      { breakfast: true, freeCancellation: true, upgrade: true, credit: true, earlyCheckIn: true, lateCheckOut: true },
      ["Breakfast for two", "Hotel credit"]
    ),
    ["Petit-déjeuner pour deux", "Surclassement prioritaire selon disponibilité", "Arrivée anticipée / départ tardif selon disponibilité"]
  );
  assert.deepEqual(
    travelPrivileges(
      { breakfast: true, freeCancellation: false, upgrade: false, credit: false, earlyCheckIn: false, lateCheckOut: false },
      ["Breakfast"]
    ),
    ["Petit-déjeuner offert"]
  );
});

test("une description encore anglaise ne s’affiche pas", () => {
  assert.equal(
    frenchClientProse("Located in the heart of the city with a swimming pool and complimentary breakfast for guests."),
    ""
  );
  assert.equal(frenchClientProse("Un palace sur la place Vendôme, avec son jardin intérieur."), "Un palace sur la place Vendôme, avec son jardin intérieur.");
});

test("un paragraphe reconnu reste en cache", () => {
  const source = "A quiet house overlooking the river, with rooms dressed in linen and a long garden.";
  assert.equal(frenchHotelProse(source).includes(source), true);
  rememberHotelFrench(source, "Une maison calme, au bord du fleuve, chambres de lin et un long jardin.");
  assert.equal(frenchHotelProse(source), "Une maison calme, au bord du fleuve, chambres de lin et un long jardin.");
  rememberHotelFrench(source, "The room stays in English with breakfast");
  assert.equal(frenchHotelProse(source), "Une maison calme, au bord du fleuve, chambres de lin et un long jardin.");
});
