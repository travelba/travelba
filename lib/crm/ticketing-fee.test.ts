import assert from "node:assert/strict";
import test from "node:test";
import {
  TICKETING_FEE_EUR,
  ticketingFeeAmount,
  ticketingFeeExternalId,
  ticketingTicketCount,
} from "./ticketing-fee";

test("aucun vol → 0 €", () => {
  assert.equal(ticketingFeeAmount({ hasFlight: false, travelerCount: 2 }), 0);
  assert.equal(ticketingTicketCount({ hasFlight: false, travelerCount: 2 }), 0);
});

test("2 voyageurs + 2 segments → 25 € pour l’aller-retour, pas par billet", () => {
  assert.equal(TICKETING_FEE_EUR, 25);
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 2 }), 25);
  assert.equal(ticketingTicketCount({ hasFlight: true, travelerCount: 2 }), 1);
});

test("vol sans voyageur nommé → 25 €", () => {
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 0 }), 25);
});

test("external_id stable par dossier", () => {
  assert.equal(ticketingFeeExternalId("abc"), "booking:abc:ticketing-fee");
});
