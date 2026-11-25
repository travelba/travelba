import assert from "node:assert/strict";
import test from "node:test";
import { formatDateFr } from "./dates";
import { PDFDocument } from "pdf-lib";
import { overrideBoardingPassengers, readBoardingPassPages, slicePdfPages } from "./boarding-pass-pdf";

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

function airFrancePage(input: { name: string; seat: string; flight?: string }) {
  return [
    input.name,
    "CDG",
    "Paris",
    "13:50 / 11 Nov",
    "NCE",
    "Nice",
    "15:25",
    "Terminal 2F",
    "Porte",
    "-",
    "Siège",
    input.seat,
    "Vol",
    input.flight || "AF7308",
    "Effectué par AIR FRANCE",
    "N° billet : 000 0000000000",
    "Si votre carte d'embarquement n'indique pas les bagages autorisés",
  ].join("\n");
}

test("une page Air France est un passager, sans inventer l’année ni le numéro de billet", () => {
  const read = readBoardingPassPages([
    airFrancePage({ name: "MARTIN , Camille", seat: "21B" }),
    airFrancePage({ name: "MARTIN , Inès", seat: "21C" }),
    "Conditions de transport\nAir France",
  ]);
  assert.equal(read.recognized, true);
  assert.equal(read.passengers.length, 2);
  assert.deepEqual(
    read.passengers.map((row) => [row.firstName, row.seat, row.page]),
    [
      ["Camille", "21B", 1],
      ["Inès", "21C", 2],
    ]
  );
  assert.equal(read.passengers[0].flight, "AF 7308");
  assert.equal(read.passengers[0].route, "Paris → Nice");
  assert.equal(read.passengers[0].when, "11 nov. à 13h50");
  assert.equal(read.passengers[0].when.includes("2026"), false);
  assert.equal(JSON.stringify(read).includes("0000000000"), false);
});

test("une page Air France avec l’année la reprend", () => {
  const read = readBoardingPassPages([
    [
      "MARTIN , Camille",
      "CDG",
      "Paris",
      "13:50 / 11 Nov 2026",
      "NCE",
      "Nice",
      "Siège",
      "12A",
      "Vol",
      "AF 7308",
      "Effectué par AIR FRANCE",
    ].join("\n"),
  ]);
  assert.equal(read.passengers[0]?.when, `${formatDateFr("2026-11-11")} à 13h50`);
});

function elAlPage(input: { name: string; seat: string; pnr: string; seq: string; year?: string }) {
  return [
    "Boarding Pass",
    input.name,
    "From",
    "CDG",
    "Terminal",
    "2B",
    "To",
    "TLV",
    "Flight",
    "LY326",
    "Gate Opens",
    "21:35",
    "Departure",
    "22:30",
    input.year ? `26 Nov ${input.year}` : "26 Nov 26",
    "Seat",
    input.seat,
    "Aisle",
    "Class",
    "Business",
    "Zone",
    "2",
    `SEQ: ${input.seq}`,
    `PNR ${input.pnr}`,
    "Arrive at the airport 3 hours before the updated departure time",
  ].join("\n");
}

test("deux pages El Al donnent un passager chacune, sans le siège de l’autre ni le PNR", () => {
  const read = readBoardingPassPages([
    elAlPage({ name: "Durand Camille", seat: "6G", pnr: "AB12CD", seq: "0086" }),
    [
      "BOARDING PASS",
      "DURAND/LÉA",
      "From",
      "CDG",
      "To",
      "TLV",
      "Flight",
      "LY 326",
      "Departure",
      "22:30",
      "26 Nov 2026",
      "Seat",
      "6D",
      "PNR",
      "CD34EF",
      "SEQ 0087",
    ].join("\n"),
  ]);
  assert.equal(read.recognized, true);
  assert.equal(read.passengers.length, 2);
  assert.deepEqual(
    read.passengers.map((row) => [row.firstName, row.lastName, row.seat, row.page]),
    [
      ["Camille", "Durand", "6G", 1],
      ["Léa", "DURAND", "6D", 2],
    ]
  );
  assert.equal(read.passengers[0].flight, "LY 326");
  assert.equal(read.passengers[0].route, "Paris → Tel Aviv");
  assert.equal(read.passengers[0].when, `${formatDateFr("2026-11-26")} à 22h30`);
  assert.equal(read.passengers[0].when.includes("21h35"), false);
  assert.equal(read.passengers[1].when, `${formatDateFr("2026-11-26")} à 22h30`);
  const blob = JSON.stringify(read);
  assert.equal(blob.includes("AB12CD"), false);
  assert.equal(blob.includes("CD34EF"), false);
  assert.equal(blob.includes("0086"), false);
  assert.equal(blob.includes("6G / 6D"), false);
});

test("une page El Al reconnue sans siège n’envoie personne", () => {
  const read = readBoardingPassPages([
    elAlPage({ name: "Durand Camille", seat: "6G", pnr: "AB12CD", seq: "0086" }),
    elAlPage({ name: "Durand Léa", seat: "Aisle", pnr: "CD34EF", seq: "0087" }),
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

test("le PDF servi ne garde que les pages du passager", async () => {
  const src = await PDFDocument.create();
  for (let index = 0; index < 4; index += 1) src.addPage([200, 200]);
  const bytes = new Uint8Array(await src.save());
  const sliced = await slicePdfPages(bytes, [2, 4]);
  assert.ok(sliced);
  const out = await PDFDocument.load(sliced);
  assert.equal(out.getPageCount(), 2);
  assert.equal(await slicePdfPages(bytes, [5]), null);
  assert.equal(await slicePdfPages(bytes, []), null);
});
