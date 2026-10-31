import assert from "node:assert/strict";
import test from "node:test";
import { applyExpensePricing, expensePricingLabel, hasExpensePricingInput, parseExpenseQuantity, readExpensePricing } from "./expense-pricing";

test("une dépense sans quantité vaut 1 × montant", () => {
  assert.deepEqual(readExpensePricing({}, 90), { quantity: 1, unitPrice: 90, amount: 90 });
  assert.deepEqual(readExpensePricing(null, null), { quantity: 1, unitPrice: 0, amount: 0 });
  assert.deepEqual(readExpensePricing({ quantity: 2, unit_price: 45 }, 90), { quantity: 2, unitPrice: 45, amount: 90 });
  // Montant changé ailleurs (frais de billeterie recalculés) : le prix unitaire suit le montant, la quantité reste.
  assert.deepEqual(readExpensePricing({ quantity: 4, unit_price: 25 }, 75), { quantity: 4, unitPrice: 18.75, amount: 75 });
  assert.equal(parseExpenseQuantity("2,5"), 2.5);
  assert.equal(parseExpenseQuantity(0), null);
  assert.equal(parseExpenseQuantity(-1), null);
  assert.equal(parseExpenseQuantity("abc"), null);
  assert.equal(parseExpenseQuantity(""), null);
});

test("quantité × prix unitaire donne le montant ; le montant seul recalcule le prix unitaire", () => {
  const current = { amount: 90, details: { pliant_transaction_id: "tx-1" } };
  const both = applyExpensePricing({ quantity: 3, unit_price: "12,50" }, current);
  assert.ok(both.ok);
  if (both.ok) {
    assert.deepEqual(both.pricing, { quantity: 3, unitPrice: 12.5, amount: 37.5 });
    // Les autres détails (lien Pliant) sont conservés.
    assert.equal(both.details.pliant_transaction_id, "tx-1");
    assert.equal(both.details.quantity, 3);
    assert.equal(both.details.unit_price, 12.5);
  }
  const amountOnly = applyExpensePricing({ amount: 100 }, { amount: 90, details: { quantity: 4, unit_price: 22.5 } });
  assert.ok(amountOnly.ok);
  if (amountOnly.ok) assert.deepEqual(amountOnly.pricing, { quantity: 4, unitPrice: 25, amount: 100 });

  const quantityOnly = applyExpensePricing({ quantity: 2 }, { amount: 45, details: {} });
  assert.ok(quantityOnly.ok);
  if (quantityOnly.ok) assert.deepEqual(quantityOnly.pricing, { quantity: 2, unitPrice: 45, amount: 90 });

  // Quantité et montant : le prix unitaire se déduit.
  const quantityAndAmount = applyExpensePricing({ quantity: 3, amount: 100 }, { amount: 90, details: {} });
  assert.ok(quantityAndAmount.ok);
  if (quantityAndAmount.ok) assert.deepEqual(quantityAndAmount.pricing, { quantity: 3, unitPrice: 33.33, amount: 100 });

  // Un centime près : 3 × 33,33 = 99,99.
  const cents = applyExpensePricing({ quantity: 3, unit_price: 33.33 }, { amount: null, details: {} });
  assert.ok(cents.ok);
  if (cents.ok) assert.equal(cents.pricing.amount, 99.99);

  assert.deepEqual(applyExpensePricing({ quantity: 0 }, current), { ok: false, error: "Quantité invalide (un nombre supérieur à zéro)." });
  assert.deepEqual(applyExpensePricing({ unit_price: -4 }, current), { ok: false, error: "Prix unitaire invalide." });
  assert.deepEqual(applyExpensePricing({ unit_price: 0 }, current), { ok: false, error: "Montant requis." });
  assert.deepEqual(applyExpensePricing({ amount: "zéro" }, current), { ok: false, error: "Montant invalide." });

  assert.equal(hasExpensePricingInput({ quantity: 2 }), true);
  assert.equal(hasExpensePricingInput({ unit_price: "12" }), true);
  assert.equal(hasExpensePricingInput({ amount: 12 }), false);
  assert.equal(hasExpensePricingInput({ quantity: "" }), false);

  const money = (value: number) => `${value.toFixed(2)} €`;
  assert.equal(expensePricingLabel({ quantity: 1, unitPrice: 90, amount: 90 }, money), null);
  assert.equal(expensePricingLabel({ quantity: 2, unitPrice: 45, amount: 90 }, money), "2 × 45.00 €");
});
