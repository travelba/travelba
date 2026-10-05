import assert from "node:assert/strict";
import test from "node:test";
import {
  MANUAL_CARD_TX_MAX,
  bookingCardValidity,
  manualCardControls,
  manualStayCardBody,
  manualStayCardDraft,
  sameCardNameCount,
  stayCardCanBeShared,
  stayCardIsManual,
} from "./manual-stay-card";

test("carte manuelle : plafond reçu, transactions illimitées, transfert d’argent bloqué", () => {
  const body = manualStayCardBody({
    firstName: "Camille",
    lastName: "Martin",
    limitCents: 150050,
    validFrom: "2026-10-04",
    validTo: "2026-10-12",
    organizationId: "org",
  });
  assert.equal(body.label, "Camille Martin");
  assert.equal(body.customFirstName, "Camille");
  assert.equal(body.customLastName, "Martin");
  assert.deepEqual(body.limit, { value: 150050, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: 150050, currency: "EUR" });
  assert.equal(body.limitRenewFrequency, "TOTAL");
  assert.equal(body.maxTransactionCount, MANUAL_CARD_TX_MAX);
  assert.equal(body.validTimezone, "Europe/Paris");
  assert.equal(body.cardConfig, "PLIANT_VIRTUAL_TRAVEL");
  assert.equal(body.label.length <= 40, true);
  assert.deepEqual(body.cardControls, manualCardControls());
  assert.deepEqual(body.cardControls.categories.values, ["4829", "6012", "6051", "6536", "6537", "6538", "6540"]);
  assert.equal(Object.hasOwn(body.cardControls, "countries"), false);
  assert.equal(Object.hasOwn(body.cardControls, "currencies"), false);
});

test("carte manuelle : le libellé tient dans quarante caractères", () => {
  const body = manualStayCardBody({
    firstName: "A".repeat(30),
    lastName: "B".repeat(30),
    limitCents: 100,
    validFrom: "2026-10-04",
    validTo: "2026-10-04",
    organizationId: "org",
  });
  assert.equal(body.label.length, 40);
  assert.equal(body.customFirstName.length <= 50, true);
  assert.equal(body.customLastName.length <= 50, true);
});

test("carte manuelle : montant et nom obligatoires", () => {
  const base = { validFrom: "2026-10-04", validTo: "2026-10-07", organizationId: "org" };
  assert.equal("error" in manualStayCardDraft({ ...base, amount: "0", firstName: "Camille", lastName: "Martin" }), true);
  assert.equal("error" in manualStayCardDraft({ ...base, amount: "1 500,50", firstName: " ", lastName: "Martin" }), true);
  const ready = manualStayCardDraft({ ...base, amount: "1 500,50", firstName: " Camille ", lastName: " Martin " });
  if (!("body" in ready)) {
    assert.fail(ready.error);
    return;
  }
  assert.equal(ready.body.limit.value, 150050);
  assert.equal(ready.body.customFirstName, "Camille");
  assert.equal(ready.body.customLastName, "Martin");
});

test("une deuxième carte au même nom porte un numéro", () => {
  const count = sameCardNameCount(
    [
      { firstName: "Camille", lastName: "Martin" },
      { firstName: " camille ", lastName: "martin" },
    ],
    "Camille",
    "Martin"
  );
  assert.equal(count, 2);
  const body = manualStayCardBody({
    firstName: "Camille",
    lastName: "Martin",
    limitCents: 10000,
    validFrom: "2026-10-04",
    validTo: "2026-11-07",
    organizationId: "org",
    existingCards: count,
  });
  assert.equal(body.label, "Camille Martin 3");
  assert.equal(bookingCardValidity("2026-10-04", "2026-11-04").validTo, "2026-11-07");
  assert.equal(bookingCardValidity("2026-10-04", null).validTo, "2027-01-02");
  assert.equal(bookingCardValidity("2026-12-01", "2026-10-01").validTo, "2026-12-01");
});

test("une carte saisie n’est pas partagée avec un autre hôtel", () => {
  assert.equal(stayCardIsManual("Saisie agence"), true);
  assert.equal(stayCardIsManual("Pliant n'a pas créé la carte."), false);
  assert.equal(
    stayCardCanBeShared({
      pliant_card_id: "card-1",
      card_closed_at: null,
      status: "pending",
      task_note: "Saisie agence",
    }),
    false
  );
  assert.equal(
    stayCardCanBeShared({
      pliant_card_id: "card-1",
      card_closed_at: null,
      status: "pending",
      task_note: null,
    }),
    true
  );
});
