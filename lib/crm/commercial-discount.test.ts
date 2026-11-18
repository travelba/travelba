import assert from "node:assert/strict";
import test from "node:test";
import { stayPriceWithExpenses } from "./ledger-display";
import {
  applyCommercialDiscount,
  commercialDiscountAmount,
  commercialDiscountPatch,
  marginAfterCommercialDiscount,
  readCommercialDiscount,
} from "./commercial-discount";

const priced = {
  stayTotal: 1000,
  agencyCommission: true,
  agencyFeeRate: 0.1,
  expenses: [{ amount: 40 }],
  ticketingFee: 25,
};

test("la remise en montant fixe s’applique après la commission et les frais", () => {
  const gross = stayPriceWithExpenses(priced);
  // 1 000 + commission 10 % de 1 065 + 40 + 25.
  assert.equal(gross, 1171.5);
  const fixed = stayPriceWithExpenses({ ...priced, discount: { type: "amount", value: 50 } });
  assert.equal(fixed, 1121.5);
  assert.equal(commercialDiscountAmount(gross, { type: "amount", value: 50 }), 50);
  // Avant la commission, 50 € sur 1 065 auraient laissé un autre total.
  assert.notEqual(fixed, stayPriceWithExpenses({ ...priced, stayTotal: 950 }));
});

test("la remise en pourcentage porte sur le total déjà commissionné", () => {
  const gross = stayPriceWithExpenses(priced);
  const percent = stayPriceWithExpenses({ ...priced, discount: { type: "percent", value: 10 } });
  assert.equal(commercialDiscountAmount(gross, { type: "percent", value: 10 }), 117.15);
  assert.equal(percent, 1054.35);
  const beforeCommission = applyCommercialDiscount(1000 + 40 + 25, { type: "percent", value: 10 });
  assert.notEqual(percent, beforeCommission.total + 106.5);
});

test("les bornes empêchent un total négatif et un pourcentage hors 0–100", () => {
  const gross = stayPriceWithExpenses(priced);
  assert.equal(stayPriceWithExpenses({ ...priced, discount: { type: "amount", value: 5000 } }), 0);
  assert.equal(commercialDiscountAmount(gross, { type: "amount", value: 5000 }), gross);
  assert.equal(stayPriceWithExpenses({ ...priced, discount: { type: "percent", value: 100 } }), 0);
  assert.equal(commercialDiscountAmount(gross, { type: "percent", value: 150 }), gross);
  assert.equal(commercialDiscountAmount(gross, { type: "percent", value: 0 }), 0);
  assert.equal(commercialDiscountAmount(gross, { type: "amount", value: -20 }), 0);
  assert.equal(applyCommercialDiscount(-30, { type: "amount", value: 10 }).total, 0);
  assert.deepEqual(commercialDiscountPatch("pourcentage", 120), {
    error: "Le pourcentage est compris entre 0 et 100.",
  });
  assert.deepEqual(commercialDiscountPatch("montant", -1), { error: "La remise ne peut pas être négative." });
  assert.deepEqual(commercialDiscountPatch("percent", 12.5), { remise_type: "percent", remise_value: 12.5 });
  assert.deepEqual(commercialDiscountPatch(null, null), { remise_type: null, remise_value: null });
  assert.equal(readCommercialDiscount({ remise_type: "percent", remise_value: "10" }).value, 10);
});

test("la marge après remise passe sous 12 % du net sans bloquer", () => {
  const comfortable = marginAfterCommercialDiscount({ margin: 200, net: 800, discountEuros: 20 });
  assert.equal(comfortable.margin, 180);
  assert.equal(comfortable.belowFloor, false);
  const tight = marginAfterCommercialDiscount({ margin: 200, net: 800, discountEuros: 120 });
  assert.equal(tight.margin, 80);
  assert.equal(tight.floor, 96);
  assert.equal(tight.belowFloor, true);
  assert.equal(marginAfterCommercialDiscount({ margin: 50, net: 0, discountEuros: 40 }).belowFloor, false);
});
