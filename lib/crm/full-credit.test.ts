import assert from "node:assert/strict";
import test from "node:test";
import { fullCreditCardSpec } from "./full-credit-card";
import { formatMoney } from "./money";
import {
  eurosToCents,
  fullCreditAgencyNotice,
  fullCreditArrival,
  fullCreditCeilingCents,
  fullCreditClientMode,
  fullCreditExternalId,
  fullCreditHotelLetter,
  fullCreditInTime,
  fullCreditLedgerLabel,
  fullCreditRefusal,
  fullCreditShouldClose,
  fullCreditTransactionCount,
  parisMidnight,
  redactFullCreditText,
  statusAfterCard,
  statusAfterSend,
  usableHotelEmail,
  usablePaymentUrl,
} from "./full-credit";

const PAN = "4242424242424242";

test("minuit à Paris suit l’heure d’été et l’heure d’hiver", () => {
  assert.equal(parisMidnight("2026-07-15")?.toISOString(), "2026-07-14T22:00:00.000Z");
  assert.equal(parisMidnight("2026-01-15")?.toISOString(), "2026-01-14T23:00:00.000Z");
});

test("sans horaire, l’échéance est 48 h avant minuit à Paris", () => {
  const start = "2026-07-15T00:00:00.000Z";
  assert.equal(fullCreditArrival(start)?.toISOString(), "2026-07-14T22:00:00.000Z");
  assert.equal(fullCreditInTime(start, new Date("2026-07-12T21:59:00.000Z")), true);
  assert.equal(fullCreditInTime(start, new Date("2026-07-12T22:00:00.000Z")), false);
});

test("un horaire réel compte à partir de cet instant", () => {
  const start = "2026-07-15T16:00:00.000Z";
  assert.equal(fullCreditArrival(start)?.toISOString(), start);
  assert.equal(fullCreditInTime(start, new Date("2026-07-13T15:59:00.000Z")), true);
  assert.equal(fullCreditInTime(start, new Date("2026-07-13T16:00:00.000Z")), false);
});

test("le plafond est 500 € par nuit, pas par chambre", () => {
  assert.equal(fullCreditCeilingCents(2), 100_000);
  assert.equal(fullCreditCeilingCents(0), null);
  const letter = fullCreditHotelLetter({
    guestName: "Camille Martin",
    hotelName: "Hôtel des Dromonts",
    city: "Avoriaz",
    reference: "TBA-1042",
    confirmationRef: "H-88",
    startAt: "2026-12-20",
    endAt: "2026-12-22",
    nights: 2,
    ceilingCents: 100_000,
    rooms: [
      { room: "Chambre 12", confirmation_ref: "A" },
      { room: "Chambre 14", confirmation_ref: "B" },
    ],
  });
  assert.match(letter.text, /déjà réglée/);
  assert.match(letter.text, /restaurant, bar, room service et spa/);
  assert.match(letter.text, /lien de paiement/);
  assert.match(letter.text, /canal sûr/);
  assert.match(letter.text, /Chambre 12/);
  assert.match(letter.text, /Chambre 14/);
  assert.match(letter.subject, /extras seulement/);
  assert.ok(letter.text.includes(formatMoney(1000, "EUR")));
  assert.equal(letter.text.includes(formatMoney(2000, "EUR")), false);
  assert.equal(letter.text.includes(PAN), false);
});

test("un numéro de carte dans le courrier est retiré", () => {
  const letter = fullCreditHotelLetter({
    guestName: `Camille ${PAN}`,
    hotelName: "Ranch",
    reference: "TBA-1",
    startAt: "2026-12-20",
    endAt: "2026-12-22",
    nights: 2,
    ceilingCents: 100_000,
  });
  assert.equal(letter.subject.includes(PAN), false);
  assert.equal(letter.text.includes(PAN), false);
  assert.match(letter.text, /•••/);
  assert.equal(redactFullCreditText(`Carte ${PAN}`).includes(PAN), false);
});

test("l’agence est prévenue, l’hôtel ne l’est pas encore", () => {
  const note = fullCreditAgencyNotice({ reference: "TBA-9", hotelName: "Ranch" });
  assert.match(note.text, /n’a pas été contacté/);
  assert.match(note.subject, /TBA-9/);
});

test("le client ne voit le bouton que dans la fenêtre, et jamais deux fois", () => {
  const base = {
    visible: true,
    status: "confirmed",
    clientSettles: false,
    kind: "hotel",
    startAt: "2026-07-15T00:00:00.000Z",
    endAt: "2026-07-18",
    now: new Date("2026-07-10T12:00:00.000Z"),
  };
  assert.equal(fullCreditClientMode(base), "ask");
  assert.equal(fullCreditClientMode({ ...base, clientSettles: true }), "hidden");
  assert.equal(fullCreditClientMode({ ...base, visible: false }), "hidden");
  assert.equal(fullCreditClientMode({ ...base, status: "quoted" }), "hidden");
  assert.equal(fullCreditClientMode({ ...base, kind: "flight" }), "hidden");
  assert.equal(fullCreditClientMode({ ...base, endAt: "2026-07-15" }), "hidden");
  assert.equal(fullCreditClientMode({ ...base, now: new Date("2026-07-14T12:00:00.000Z") }), "late");
  assert.equal(fullCreditClientMode({ ...base, existingStatus: "demandee", now: new Date("2026-07-14T12:00:00.000Z") }), "asked");
  assert.equal(fullCreditRefusal({ ...base, now: new Date("2026-07-14T12:00:00.000Z") }), "La demande se fait au moins 48 heures avant l’arrivée.");
});

test("la carte couvre les nuits sans multiplier les chambres, et se ferme après le départ", () => {
  assert.equal(fullCreditTransactionCount(2), 8);
  assert.equal(fullCreditTransactionCount(3), 12);
  const spec = fullCreditCardSpec({
    firstName: "Camille",
    lastName: "Martin",
    hotelName: "Des Dromonts",
    nights: 3,
    ceilingCents: 150_000,
    endAt: "2026-07-18",
    today: "2026-07-10",
    organizationId: "org",
  });
  assert.equal(spec.body.limit.value, 150_000);
  assert.equal(spec.body.maxTransactionCount, 12);
  assert.equal(spec.body.limitRenewFrequency, "TOTAL");
  assert.equal(spec.body.validTo, "2026-07-18");
  assert.ok(spec.label.length <= 40);
  assert.equal(spec.label.includes("Dromonts"), true);
  assert.equal(statusAfterSend("demandee"), "envoyee");
  assert.equal(statusAfterSend("carte"), "carte");
  assert.equal(statusAfterSend("cloturee"), null);
  assert.equal(statusAfterCard("envoyee"), "carte");
  assert.equal(fullCreditShouldClose("2026-07-18", new Date("2026-07-19T08:00:00.000Z"), null), true);
  assert.equal(fullCreditShouldClose("2026-07-18", new Date("2026-07-19T06:00:00.000Z"), null), false);
  assert.equal(fullCreditShouldClose("2026-07-18", new Date("2026-07-20T12:00:00.000Z"), "2026-07-20"), false);
});

test("le montant réel est une dépense stable, le lien et l’e-mail sont contrôlés", () => {
  assert.equal(fullCreditExternalId("abc"), "full-credit:abc");
  assert.match(fullCreditLedgerLabel("Ranch", "TBA-1"), /Extras hôtel/);
  assert.equal(eurosToCents("1 234,50"), 123450);
  assert.equal(eurosToCents("0"), null);
  assert.equal(usableHotelEmail("desk@hotel.fr"), "desk@hotel.fr");
  assert.equal(usableHotelEmail("pas-un-email"), null);
  assert.equal(usablePaymentUrl("https://pay.hotel.fr/auth"), "https://pay.hotel.fr/auth");
  assert.equal(usablePaymentUrl("http://pay.hotel.fr/auth"), null);
});
