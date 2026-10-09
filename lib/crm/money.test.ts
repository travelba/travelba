import assert from "node:assert/strict";
import test from "node:test";
import { amountToCents, centsToAmount, formatMoney, maskMoneyTyping, moneyToInput, parseMoney } from "./money";
import { amountToCents as payerAmountToCents } from "./payer";

test("parses french and dot decimals", () => {
  assert.equal(parseMoney("1234,50"), 1234.5);
  assert.equal(parseMoney("1234.50"), 1234.5);
  assert.equal(parseMoney("1 234,50"), 1234.5);
  assert.equal(parseMoney("1.234,56"), 1234.56);
  assert.equal(parseMoney("12,"), 12);
  assert.equal(parseMoney("12."), 12);
  assert.equal(parseMoney(",50"), 0.5);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney(12.5), 12.5);
});

test("keeps a trailing comma while typing and two cent digits", () => {
  assert.equal(maskMoneyTyping("12,5"), "12,5");
  assert.equal(maskMoneyTyping("12,509"), "12,50");
  assert.equal(maskMoneyTyping("12a,5"), "12,5");
});

test("round-trips a decimal through the french field", () => {
  assert.equal(parseMoney(moneyToInput(1485.5)), 1485.5);
  assert.match(moneyToInput(12.5), /12,50/);
});

test("formatMoney parle français par défaut et anglais sur demande", () => {
  assert.equal(formatMoney(1234.5).replace(/\s/g, " "), "1 234,50 €");
  assert.equal(formatMoney(1234.5, "USD", { lang: "en" }), "US$1,234.50");
  assert.equal(formatMoney(1234.5, "EUR", { lang: "en" }), "€1,234.50");
  assert.equal(formatMoney(12, "", { lang: "fr" }).replace(/\s/g, " "), "12,00 €");
  assert.equal(formatMoney(0, "GBP").replace(/\s/g, " "), "0,00 £");
  assert.equal(formatMoney(0, "USD").replace(/\s/g, " "), "0,00 $");
  assert.equal(formatMoney(0, "GBP").includes("£GB"), false);
  assert.equal(formatMoney(0, "USD").includes("$US"), false);
});

test("centimes et montants se convertissent sans dérive flottante", () => {
  assert.equal(amountToCents(19.99), 1999);
  assert.equal(amountToCents(0.1 + 0.2), 30);
  assert.equal(amountToCents(1.005), 100);
  assert.equal(centsToAmount(1999), 19.99);
  assert.equal(centsToAmount(amountToCents(2400)), 2400);
  assert.equal(payerAmountToCents, amountToCents);
});
