import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyFeeFromGross,
  creditDisponible,
  formatEncours,
  formatMoney,
  netAfterAgencyFee,
} from "./money";

test("encours shows the signed amount", () => {
  assert.equal(formatEncours(1200), `Encours ${formatMoney(1200)}`);
  assert.equal(formatEncours(-2400), `Encours ${formatMoney(-2400)}`);
});

test("agency fee is 10 percent of gross credit", () => {
  assert.equal(agencyFeeFromGross(1000), 100);
  assert.equal(netAfterAgencyFee(1000), 900);
  assert.equal(agencyFeeFromGross(1700), 170);
  assert.equal(netAfterAgencyFee(1700), 1530);
  assert.equal(agencyFeeFromGross(0), 0);
  assert.equal(creditDisponible(900), 900);
  assert.equal(creditDisponible(-50), 0);
});
