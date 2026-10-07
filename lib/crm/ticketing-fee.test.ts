import assert from "node:assert/strict";
import test from "node:test";
import {
  TICKETING_FEE_EUR,
  chargeableTicketingFee,
  collectableTicketingFee,
  isAutoTicketingExpense,
  ticketingExpenseAction,
  ticketingFeeAmount,
  ticketingFeeDismissed,
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

test("le règlement reprend 25 € par billet tant que le séjour n’est pas annulé", () => {
  assert.equal(collectableTicketingFee({ status: "confirmed", hasFlight: true, travelerCount: 4 }), 100);
  assert.equal(collectableTicketingFee({ status: "draft", hasFlight: true, travelerCount: 4 }), 100);
  assert.equal(collectableTicketingFee({ status: "cancelled", hasFlight: true, travelerCount: 4 }), 0);
  assert.equal(collectableTicketingFee({ status: "confirmed", hasFlight: false, travelerCount: 4 }), 0);
});

test("external_id stable par dossier", () => {
  assert.equal(ticketingFeeExternalId("abc"), "booking:abc:ticketing-fee");
});

test("la billeterie déjà en dépense ne se rajoute pas au prix", () => {
  const items = [
    { kind: "flight", lifecycle: "active" },
    { kind: "expense", amount: 50, details: { auto_fee: "ticketing" }, lifecycle: "active" },
  ];
  assert.equal(isAutoTicketingExpense(items[1]), true);
  assert.equal(chargeableTicketingFee({ items, status: "confirmed", travelerCount: 5 }), 0);
  assert.equal(
    chargeableTicketingFee({
      items: [{ kind: "flight" }],
      status: "confirmed",
      travelerCount: 5,
    }),
    125
  );
});

test("une ligne modifiée ou retirée ne revient pas au calcul", () => {
  assert.equal(ticketingFeeDismissed("ticketing_off"), true);
  assert.equal(ticketingFeeDismissed(null), false);
  assert.equal(
    ticketingExpenseAction({
      hasFlight: true,
      dismissed: false,
      exists: false,
      touched: false,
      amount: 125,
      currentAmount: null,
      title: "Frais de billeterie (5 billets)",
      currentTitle: null,
    }),
    "create"
  );
  assert.equal(
    ticketingExpenseAction({
      hasFlight: true,
      dismissed: false,
      exists: true,
      touched: true,
      amount: 125,
      currentAmount: 50,
      title: "Frais de billeterie (5 billets)",
      currentTitle: "Frais de billeterie",
    }),
    "keep"
  );
  assert.equal(
    ticketingExpenseAction({
      hasFlight: true,
      dismissed: true,
      exists: true,
      touched: false,
      amount: 125,
      currentAmount: 125,
      title: "Frais de billeterie (5 billets)",
      currentTitle: "Frais de billeterie (5 billets)",
    }),
    "remove"
  );
  assert.equal(
    ticketingExpenseAction({
      hasFlight: true,
      dismissed: false,
      exists: true,
      touched: false,
      amount: 100,
      currentAmount: 125,
      title: "Frais de billeterie (4 billets)",
      currentTitle: "Frais de billeterie (5 billets)",
    }),
    "update"
  );
});
