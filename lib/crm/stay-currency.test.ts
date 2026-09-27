import assert from "node:assert/strict";
import test from "node:test";
import { bookingCurrencyFromReview, stayCurrency } from "./stay-currency";

test("devise du séjour : choix EUR USD CHF GBP, pas la monnaie du PDF", () => {
  assert.equal(stayCurrency("usd"), "USD");
  assert.equal(stayCurrency("£"), "GBP");
  assert.equal(stayCurrency("JPY"), "EUR");
  assert.equal(
    bookingCurrencyFromReview("EUR", [
      { details: { document_currency: "USD" } },
      { details: { document_currency: "CHF" } },
    ]),
    "EUR"
  );
  assert.equal(
    bookingCurrencyFromReview("CHF", [{ details: { document_currency: "USD" } }]),
    "CHF"
  );
});
