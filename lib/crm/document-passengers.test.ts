import assert from "node:assert/strict";
import test from "node:test";
import { guestPerson, peopleNotOnStay, passengersFromDetails, planTravelerInsert, printedStayTravelers, ticketPartyKeys, ticketTravelerNames, uniquePeople } from "./document-passengers";
import { roomOccupancyLabel } from "./hotel-party";

test("les passagers du document s’ajoutent s’ils ne sont pas déjà sur le séjour", () => {
  const details = {
    passengers: [
      { first_name: "Paul", last_name: "Martin" },
      { first_name: "PAUL", last_name: "MARTIN" },
      { first_name: "Anne", last_name: "Martin" },
      { first_name: "Adulte", last_name: "1" },
    ],
  };
  assert.deepEqual(uniquePeople(passengersFromDetails(details)).map((row) => row.first_name), [
    "Paul",
    "Anne",
  ]);
  const missing = peopleNotOnStay(passengersFromDetails(details), [
    { first_name: "Paul", last_name: "Martin" },
  ]);
  assert.deepEqual(
    missing.map((row) => row.first_name),
    ["Anne"]
  );
  assert.equal(peopleNotOnStay(passengersFromDetails(details), passengersFromDetails(details)).length, 0);
  const loose = peopleNotOnStay(
    [{ first_name: "Lea", last_name: undefined }, { first_name: null, last_name: null }],
    [{ first_name: "Paul", last_name: "Martin" }]
  );
  assert.deepEqual(loose, [{ first_name: "Lea", last_name: null }]);
});

test("la création ne garde que le passager imprimé, pas les autres compagnons", () => {
  const printed = printedStayTravelers({
    items: [
      {
        kind: "flight",
        title: "Nice → Dubaï",
        supplier: "Emirates",
        confirmation_ref: "KDP4AS",
        start_at: "2027-04-13T10:00:00",
        end_at: null,
        amount: null,
        details: { passengers: [{ first_name: "Raphael", last_name: "Boukris" }] },
      },
    ],
  });
  assert.deepEqual(printed, [{ first_name: "Raphael", last_name: "Boukris" }]);
});

test("un libellé d’occupation ne devient pas un voyageur", () => {
  const occupancy = [
    "2 adultes, 2 enfants (1 an, 5 ans)",
    "1 Adult",
    "2 Adults",
    "2 Adulte(s)",
    "1 personne(s)",
    "1 Enfant",
    roomOccupancyLabel({ adults: 2, children: [{ age: 1 }, { age: 5 }] }),
    roomOccupancyLabel({ adults: 1, children: [{ age: 0 }] }),
  ];
  for (const label of occupancy) {
    for (const part of label.split(/[,;]/)) assert.equal(guestPerson(part), null, part);
  }
  assert.deepEqual(guestPerson("Benjamin Boukris"), { first_name: "Benjamin", last_name: "Boukris" });
  assert.deepEqual(guestPerson("Jean-Pierre D'Arc"), { first_name: "Jean-Pierre", last_name: "D'Arc" });

  const onlyCounts = printedStayTravelers({
    items: occupancy.map((guests) => ({
      kind: "hotel",
      title: "Hôtel",
      supplier: null,
      confirmation_ref: null,
      start_at: null,
      end_at: null,
      amount: null,
      details: { rooms: [{ guests }] },
    })),
  });
  assert.deepEqual(onlyCounts, []);

  const named = printedStayTravelers({
    items: [
      {
        kind: "flight",
        title: "Paris → Tel Aviv",
        supplier: null,
        confirmation_ref: null,
        start_at: null,
        end_at: null,
        amount: null,
        details: { passengers: [{ first_name: "Benjamin", last_name: "Boukris" }] },
      },
      {
        kind: "hotel",
        title: "Hôtel",
        supplier: null,
        confirmation_ref: null,
        start_at: null,
        end_at: null,
        amount: null,
        details: {
          rooms: [
            { guests: "2 adultes, 2 enfants (1 an, 5 ans)" },
            { guests: "Benjamin Boukris, Anne Martin" },
          ],
          ...({ guest_names: ["Jean-Pierre D'Arc"] } as { guest_names: string[] }),
        } as NonNullable<Parameters<typeof printedStayTravelers>[0]["items"][number]["details"]>,
      },
    ],
  });
  assert.deepEqual(named, [
    { first_name: "Benjamin", last_name: "Boukris" },
    { first_name: "Jean-Pierre", last_name: "D'Arc" },
    { first_name: "Anne", last_name: "Martin" },
  ]);
});

test("un compagnon déjà sur le dossier n’est pas recréé", () => {
  const victoria = {
    id: "t-victoria",
    first_name: "Victoria",
    last_name: "D",
    companion_id: "comp-victoria",
    is_account_holder: false,
  };
  assert.deepEqual(
    planTravelerInsert([victoria], {
      first_name: "Victoria",
      last_name: "Boukris",
      companion_id: "comp-victoria",
      is_account_holder: false,
    }),
    { action: "reuse", id: "t-victoria", first_name: "Victoria", last_name: "Boukris" }
  );
  assert.deepEqual(
    planTravelerInsert(
      [{ ...victoria, last_name: "Boukris" }],
      { first_name: "Victoria", last_name: "D", companion_id: "comp-victoria", is_account_holder: false }
    ),
    { action: "skip" }
  );
  assert.deepEqual(
    planTravelerInsert([victoria], {
      first_name: "2",
      last_name: "adultes",
      companion_id: "comp-victoria",
    }),
    { action: "skip" }
  );
  assert.deepEqual(
    planTravelerInsert(
      [{ id: "t-li", first_name: "Mei", last_name: "Li", companion_id: "comp-li", is_account_holder: false }],
      { first_name: "Mei", last_name: "Boukris", companion_id: "comp-li", is_account_holder: false }
    ),
    { action: "skip" }
  );
  assert.deepEqual(
    planTravelerInsert(
      [{ id: "t-holder", first_name: "Victoria", last_name: "D", companion_id: null, is_account_holder: true }],
      { first_name: "Victoria", last_name: "Boukris", companion_id: null, is_account_holder: true }
    ),
    { action: "reuse", id: "t-holder", first_name: "Victoria", last_name: "Boukris" }
  );
  assert.deepEqual(
    planTravelerInsert([], { first_name: "Benjamin", last_name: "Boukris", companion_id: null }),
    { action: "insert" }
  );
  assert.deepEqual(
    planTravelerInsert(
      [{ id: "t-benjamin", first_name: "Benjamin", last_name: "Boukris", companion_id: "comp-benjamin" }],
      { first_name: "Benjamin", last_name: "Boukris", companion_id: null }
    ),
    { action: "skip" }
  );
  assert.deepEqual(
    planTravelerInsert([{ id: "a1", first_name: "Adulte", last_name: "1" }], { first_name: "Adulte", last_name: "2" }),
    { action: "insert" }
  );
});

test("un billet affiche les voyageurs concernés et retrouve leur case", () => {
  const details = {
    passengers: [
      { first_name: "Judith", last_name: "Charbit" },
      { first_name: "Judith", last_name: "Charbit" },
    ],
  };
  assert.deepEqual(ticketTravelerNames(details), ["Judith Charbit"]);
  assert.deepEqual(
    ticketPartyKeys(details, [
      { key: "holder", first_name: "Arnaud", last_name: "Vinciguerra" },
      { key: "companion:j", first_name: "Judith", last_name: "Charbit" },
    ]),
    ["companion:j"]
  );
  assert.deepEqual(ticketPartyKeys({ party_keys: ["holder"] }, [{ key: "holder", first_name: "Arnaud", last_name: "Vinciguerra" }]), [
    "holder",
  ]);
});
