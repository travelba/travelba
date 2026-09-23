import assert from "node:assert/strict";
import test from "node:test";
import { maskMoneyTyping, moneyToInput, parseMoney } from "./money";

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
