import assert from "node:assert/strict";
import test from "node:test";
import { formatDateFr } from "./dates";
import { overrideBoardingPassengers, readBoardingPassPages } from "./boarding-pass-pdf";

function transaviaPage(input: { seq: string; name: string; infant?: string; seat?: string }) {
  return [
    "Carte d’embarquement",
    `Seq. nr. TO3004:${input.seq}`,
    input.name,
    input.infant ? `Avec bébé (${input.infant})` : "",
    "Référence de réservation: AB1CDE",
    "Bagages en soute",
    "Les bagages en soute doivent être déposés au comptoir avant l'heure limite d'enregistrement.",
    "Ce bagage sera à placer à bord sous le siège devant vous.",
    "La porte d'embarquement ferme 20 minutes avant l’heure de départ.",
    `Seq. nr. TO3004:${input.seq}`,
    "Date/Date",
    "28-10-2026",
    "Boarding time/",
    "Heure d'embarquement",
    "07:10",
    "Departure time/",
    "Heure de départ",
    "07:55",
    "Flight number/Numéro de vol",
    "TO 3004",
    "Gate/Porte",
    "-",
    "Seat/Siège",
    input.seat ? `${input.seat} (Zone 3)` : "",
    "Terminal/Terminal",
    "3",
    "PARIS (ORLY) (ORY) AGADIR (AGA)",
    "Opéré par Transavia France S.A.S.",
  ]
    .filter(Boolean)
    .join("\n");
}

test("une page Transavia est un passager, le bébé reste sur la même page", () => {
  const read = readBoardingPassPages([
    transaviaPage({ seq: "4", name: "Camille MARTIN", infant: "Noah MARTIN", seat: "2F" }),
    transaviaPage({ seq: "5", name: "Léa MARTIN", infant: "Inès MARTIN", seat: "3A" }),
    transaviaPage({ seq: "6", name: "Adam Elie Jacob MARTIN", seat: "2E" }),
  ]);
  assert.equal(read.recognized, true);
  assert.equal(read.passengers.length, 3);
  assert.deepEqual(
    read.passengers.map((row) => row.firstName),
    ["Camille", "Léa", "Adam"]
  );
  assert.deepEqual(
    read.passengers.map((row) => row.seat),
    ["2F", "3A", "2E"]
  );
  assert.deepEqual(
    read.passengers.map((row) => row.page),
    [1, 2, 3]
  );
  assert.equal(read.passengers[0].flight, "TO 3004");
  assert.equal(read.passengers[0].route, "Paris (Orly) → Agadir");
  assert.equal(read.passengers[0].when, `${formatDateFr("2026-10-28")} à 07h55`);
  assert.equal(read.passengers[0].when.includes("07h10"), false);
  assert.equal(read.passengers[2].lastName, "MARTIN");
  assert.equal(JSON.stringify(read).includes("Noah"), false);
  assert.equal(JSON.stringify(read).includes("AB1CDE"), false);
});

test("une page reconnue sans siège n’envoie personne", () => {
  const read = readBoardingPassPages([
    transaviaPage({ seq: "4", name: "Camille MARTIN", seat: "2F" }),
    transaviaPage({ seq: "5", name: "Léa MARTIN" }),
  ]);
  assert.equal(read.recognized, true);
  assert.deepEqual(read.passengers, []);
});

test("un texte qui n’est pas une carte n’est pas reconnu", () => {
  const read = readBoardingPassPages(["Facture hôtel\nParis\n1200 EUR"]);
  assert.equal(read.recognized, false);
  assert.deepEqual(read.passengers, []);
});

test("les champs saisis ne complètent pas un trou", () => {
  const missing = overrideBoardingPassengers({ prenom: "Camille", vol: "TO 3004", trajet: "Paris → Agadir" });
  assert.equal(missing.provided, true);
  assert.deepEqual(missing.passengers, []);
  const group = overrideBoardingPassengers({
    passagers: [
      { prenom: "Camille", vol: "TO 3004", trajet: "Paris → Agadir", date_heure: "28 oct. 2026 à 07h55", siege: "2F" },
      { prenom: "Léa", nom: "Martin", vol: "TO 3004", trajet: "Paris → Agadir", date_heure: "28 oct. 2026 à 07h55", siege: "3A" },
    ],
  });
  assert.equal(group.passengers.length, 2);
  assert.equal(group.passengers[0].lastName, "");
  assert.equal(group.passengers[1].lastName, "Martin");
  assert.equal(group.passengers[0].seat, "2F");
  assert.equal(overrideBoardingPassengers({}).provided, false);
});
