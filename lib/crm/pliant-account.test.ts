import assert from "node:assert/strict";
import test from "node:test";
import { limitForAccount, pickCardAccount, settlePliantLimit } from "./pliant-account";
import { ECB_SNAPSHOT } from "./visa-fees";

const eur = { id: "eur", currency: "EUR", status: "ACTIVE", defaultAccount: true };
const gbp = { id: "gbp", currency: "GBP", status: "ACTIVE", defaultAccount: false };

test("un compte dans la devise du séjour est choisi tel quel", () => {
  assert.equal(pickCardAccount([eur, gbp], "GBP")?.id, "gbp");
  assert.deepEqual(limitForAccount(232050, "GBP", "GBP", ECB_SNAPSHOT.rates), { value: 232050, currency: "GBP" });
});

test("sans compte livre, le plafond part en euros sur le compte par défaut", () => {
  const settled = settlePliantLimit({
    cents: 232050,
    currency: "GBP",
    accounts: [eur],
    rates: ECB_SNAPSHOT.rates,
  });
  assert.equal(settled?.cardAccountId, "eur");
  assert.equal(settled?.currency, "EUR");
  assert.equal(settled?.value, Math.ceil(232050 / ECB_SNAPSHOT.rates.GBP));
});

test("un plafond déjà en euros n’est pas reconverti", () => {
  const settled = settlePliantLimit({
    cents: 15000,
    currency: "EUR",
    accounts: [eur],
    rates: ECB_SNAPSHOT.rates,
  });
  assert.deepEqual(settled, { value: 15000, currency: "EUR", cardAccountId: "eur" });
});

test("une devise sans cours BCE n’est pas inventée", () => {
  assert.equal(limitForAccount(1000, "CHF", "EUR", ECB_SNAPSHOT.rates), null);
  assert.equal(limitForAccount(0, "USD", "EUR", ECB_SNAPSHOT.rates), null);
});
