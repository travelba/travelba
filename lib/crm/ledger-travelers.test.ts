import assert from "node:assert/strict";
import test from "node:test";
import {
  cardTravelerNames,
  ledgerCardId,
  ledgerTravelerLabel,
  movementTravelerNames,
  type LedgerPartyCard,
  type LedgerPartyTraveler,
} from "./ledger-travelers";

const sid: LedgerPartyTraveler = {
  id: "t-sid",
  booking_id: "b1",
  first_name: "Sid Ahmed",
  last_name: "Badsi",
  companion_id: "c-sid",
  is_account_holder: false,
};

const holder: LedgerPartyTraveler = {
  id: "t-holder",
  booking_id: "b1",
  first_name: "Benjamin",
  last_name: "Amar",
  companion_id: null,
  is_account_holder: true,
};

const other: LedgerPartyTraveler = {
  id: "t-other",
  booking_id: "b2",
  first_name: "Camille",
  last_name: "Morel",
  is_account_holder: true,
};

const travelers = [holder, sid, other];

test("le libellé distingue un voyageur, deux noms, et le surplus", () => {
  assert.equal(ledgerTravelerLabel([]), null);
  assert.equal(ledgerTravelerLabel(["Sid Ahmed Badsi"]), "Voyageur : Sid Ahmed Badsi");
  assert.equal(ledgerTravelerLabel(["Amina Diop", "Lina Martin"]), "Voyageurs : Amina Diop, Lina Martin");
  assert.equal(
    ledgerTravelerLabel(["Amina Diop", "Lina Martin", "Nora Benali", "Yan Cohen"]),
    "Voyageurs : Amina Diop, Lina Martin +2"
  );
  assert.equal(
    ledgerTravelerLabel(["Amina Diop", "Lina Martin", "Nora Benali"], 0),
    "Voyageurs : Amina Diop, Lina Martin, Nora Benali"
  );
  assert.equal(ledgerTravelerLabel(["Sid Ahmed Badsi", "sid ahmed badsi"]), "Voyageur : Sid Ahmed Badsi");
});

test("l’écriture retrouve la carte, hôtel ou dépense", () => {
  assert.equal(ledgerCardId("booking:b1:item:hotel"), "hotel");
  assert.equal(ledgerCardId("exemple:item:exemple-hotel"), "exemple-hotel");
  assert.equal(ledgerCardId("booking:b1:expense:fee"), "fee");
  assert.equal(ledgerCardId(null), null);
  assert.equal(ledgerCardId("booking:b1:agency-commission"), null);
});

test("les cases cochées priment sur le dossier, puis les noms du billet", () => {
  const hotel: LedgerPartyCard = {
    id: "hotel",
    booking_id: "b1",
    details: {
      guests: "Tout le monde",
      rooms: [{ party_keys: ["companion:c-sid"], guests: "Sid Ahmed Badsi" }],
    },
  };
  assert.deepEqual(cardTravelerNames(hotel.details, travelers), ["Sid Ahmed Badsi"]);
  assert.deepEqual(
    movementTravelerNames({
      direction: "debit",
      bookingId: "b1",
      externalId: "booking:b1:item:hotel",
      cards: [hotel],
      travelers,
    }),
    ["Sid Ahmed Badsi"]
  );

  const flight: LedgerPartyCard = {
    id: "flight",
    booking_id: "b1",
    details: {
      party_keys: ["companion:absent"],
      passengers: [{ first_name: "Lina", last_name: "Martin" }],
    },
  };
  assert.deepEqual(cardTravelerNames(flight.details, travelers), ["Lina Martin"]);

  const named: LedgerPartyCard = {
    id: "flight-2",
    booking_id: "b1",
    details: { passengers: [{ first_name: "Sid Ahmed", last_name: "Badsi" }] },
  };
  assert.deepEqual(
    movementTravelerNames({
      direction: "debit",
      bookingId: "b1",
      externalId: "booking:b1:item:flight-2",
      cards: [named],
      travelers,
    }),
    ["Sid Ahmed Badsi"]
  );
});

test("sans case cochée, le débit reprend les voyageurs du dossier", () => {
  assert.deepEqual(
    movementTravelerNames({
      direction: "debit",
      bookingId: "b1",
      externalId: null,
      cards: [],
      travelers,
    }),
    ["Benjamin Amar", "Sid Ahmed Badsi"]
  );
  assert.deepEqual(
    movementTravelerNames({
      direction: "debit",
      bookingId: "b1",
      externalId: "booking:b1:item:inconnu",
      cards: [],
      travelers: [
        ...travelers,
        { booking_id: "b1", first_name: "Adulte", last_name: "2", is_account_holder: false },
      ],
    }),
    ["Benjamin Amar", "Sid Ahmed Badsi"]
  );
});

test("un crédit ou un mouvement sans séjour ne nomme personne", () => {
  assert.deepEqual(
    movementTravelerNames({
      direction: "credit",
      bookingId: "b1",
      externalId: null,
      cards: [],
      travelers,
    }),
    []
  );
  assert.deepEqual(
    movementTravelerNames({
      direction: "debit",
      bookingId: null,
      externalId: null,
      cards: [],
      travelers,
    }),
    []
  );
});

test("les voyageurs d’un hôtel se lisent dans la chambre", () => {
  assert.deepEqual(
    cardTravelerNames({ rooms: [{ guests: "Sid Ahmed Badsi, Lina Martin" }] }, []),
    ["Sid Ahmed Badsi", "Lina Martin"]
  );
  assert.deepEqual(cardTravelerNames({ guests: "Nora Benali" }, []), ["Nora Benali"]);
});
