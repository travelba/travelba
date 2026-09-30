import assert from "node:assert/strict";
import test from "node:test";
import {
  TICKETING_FEE_EUR,
  collectableTicketingFee,
  ticketingFeeAmount,
  ticketingFeeExternalId,
  ticketingFeeLabel,
  ticketingTicketCount,
} from "./ticketing-fee";

test("aucun vol → 0 €", () => {
  assert.equal(ticketingFeeAmount({ hasFlight: false, travelerCount: 4 }), 0);
  assert.equal(ticketingTicketCount({ hasFlight: false, travelerCount: 4 }), 0);
});

test("Paris, 4 billets → 100 €, même avec plusieurs segments", () => {
  assert.equal(TICKETING_FEE_EUR, 25);
  assert.equal(ticketingTicketCount({ hasFlight: true, travelerCount: 4 }), 4);
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 4 }), 100);
  assert.equal(ticketingFeeLabel(4), "Frais de billeterie (4 billets)");
});

test("vol sans voyageur nommé → 25 €", () => {
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 0 }), 25);
  assert.equal(ticketingFeeLabel(1), "Frais de billeterie (1 billet)");
});

test("le règlement reprend 25 € par billet seulement si le dossier est confirmé", () => {
  assert.equal(collectableTicketingFee({ status: "confirmed", hasFlight: true, travelerCount: 4 }), 100);
  assert.equal(collectableTicketingFee({ status: "quoted", hasFlight: true, travelerCount: 4 }), 0);
  assert.equal(collectableTicketingFee({ status: "confirmed", hasFlight: false, travelerCount: 4 }), 0);
});

test("external_id stable par dossier", () => {
  assert.equal(ticketingFeeExternalId("abc"), "booking:abc:ticketing-fee");
});
