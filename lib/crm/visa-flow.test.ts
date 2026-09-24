import assert from "node:assert/strict";
import test from "node:test";
import {
  clientVisaPhase,
  confirmAllowed,
  nextPayAttempt,
  paymentHold,
  visibilityOnRequest,
} from "./visa-flow";

test("le client voit préparer, en cours, puis le coffre", () => {
  assert.equal(clientVisaPhase({ started: false, filed: false }), "à préparer");
  assert.equal(clientVisaPhase({ started: true, filed: false }), "en cours");
  assert.equal(clientVisaPhase({ started: true, filed: true }), "au coffre");
});

test("ouvrir la demande ne révèle pas les prix", () => {
  assert.deepEqual(visibilityOnRequest({ visible: false, prices: false }), {
    visible: true,
    prices: false,
  });
  assert.equal(visibilityOnRequest({ visible: true, prices: true }).prices, true);
});

test("sans Pliant le parcours s’arrête au paiement", () => {
  assert.match(paymentHold(false) || "", /paiement/);
  assert.equal(paymentHold(true), null);
});

test("un second paiement échoué alerte, un second pays identique ne part pas", () => {
  assert.equal(nextPayAttempt(0), "pay");
  assert.equal(nextPayAttempt(1), "retry");
  assert.equal(nextPayAttempt(2), "alert");
  assert.equal(confirmAllowed({ already: ["IL"], country: "IL", frenchPassports: 1 }), "déjà demandé");
  assert.equal(confirmAllowed({ already: [], country: "US", frenchPassports: 1, esta: {} }), "questionnaire ESTA incomplet");
  assert.equal(
    confirmAllowed({
      already: [],
      country: "US",
      frenchPassports: 2,
      esta: {
        usAddress: "hôtel",
        employment: "agence",
        countriesVisited: "France",
        priorRefusal: "non",
      },
    }),
    null
  );
});
