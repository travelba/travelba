import assert from "node:assert/strict";
import test from "node:test";
import { etaIlPliantCard, pliantCardName } from "./eta-il-fee";
import { corridorCeilingCents, ECB_SNAPSHOT, centsToEur } from "./visa-fees";

test("le nom sur la carte Pliant n’a que les caractères acceptés", () => {
  assert.equal(pliantCardName("Simon, Iony"), "Simon-Iony");
});

test("la carte est au nom du client, plafonnée sur les 25 ILS au cours BCE", () => {
  const card = etaIlPliantCard({
    firstName: "Simon, Iony",
    lastName: "Albilila",
    travelerCount: 4,
    bookingReference: "TB-2026-0033",
    organizationId: "org",
    today: "2026-09-24",
    startDate: "2026-12-14",
    endDate: "2026-12-23",
  });
  assert.equal(card.holderFirstName, "Simon-Iony");
  assert.equal(card.holderLastName, "Albilila");
  const cents = corridorCeilingCents("IL", 4, ECB_SNAPSHOT.rates) || 0;
  assert.equal(card.feeIls, 100);
  assert.equal(card.ceilingEur, centsToEur(cents));
  assert.equal(card.body.customFirstName, "Simon-Iony");
  assert.equal(card.body.limit.value, cents);
  assert.equal(card.body.limit.currency, "EUR");
  assert.equal(card.body.transactionLimit.value, cents);
  assert.equal(card.body.maxTransactionCount, 4);
  assert.equal(card.body.limitRenewFrequency, "TOTAL");
  assert.equal(card.body.validFrom, "2026-12-14");
  assert.equal(card.body.validTo, "2026-12-23");
  assert.equal(JSON.stringify(card).includes("pan"), false);
});
