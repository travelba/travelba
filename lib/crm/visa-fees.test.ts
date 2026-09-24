import assert from "node:assert/strict";
import test from "node:test";
import { coverCents, parseEcbRates, VISA_OFFICIAL } from "./visa-fees";

test("les frais officiels restent ceux publiés", () => {
  assert.equal(VISA_OFFICIAL.IL.amount, 25);
  assert.equal(VISA_OFFICIAL.IL.currency, "ILS");
  assert.equal(VISA_OFFICIAL.US.amount, 40.27);
  assert.equal(VISA_OFFICIAL.GB.amount, 20);
  assert.equal(VISA_OFFICIAL.US.taxLabel, "Taxe ESTA");
  assert.equal(VISA_OFFICIAL.GB.taxLabel, "Taxe ETA Royaume-Uni");
});

test("le plafond couvre le cours, au centime supérieur", () => {
  assert.equal(coverCents(25, 4), Math.ceil((25 / 4) * 1.03 * 100));
  assert.equal(coverCents(0, 4), null);
});

test("le flux BCE du jour est lu", () => {
  const parsed = parseEcbRates(
    "<Cube time='2026-09-24'><Cube currency='USD' rate='1.1367'/><Cube currency='GBP' rate='0.85986'/><Cube currency='ILS' rate='3.4649'/></Cube>"
  );
  assert.equal(parsed?.date, "2026-09-24");
  assert.equal(parsed?.rates.ILS, 3.4649);
  assert.equal(parseEcbRates("<Cube></Cube>"), null);
});
