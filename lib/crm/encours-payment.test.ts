import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EncoursPayment } from "../../components/account/EncoursPayment";

test("Régler propose carte, Apple Pay, prélèvement et virement", () => {
  const html = renderToStaticMarkup(
    createElement(EncoursPayment, {
      company: 0,
      personal: 25,
      currency: "EUR",
      soleCompanyName: null,
      stripeKey: "pk_test_preview",
    })
  );
  assert.match(html, /Régler/);
  assert.match(html, /Carte bancaire/);
  assert.match(html, /Apple Pay/);
  assert.match(html, /Prélèvement SEPA/);
  assert.match(html, /Virement/);
  assert.match(html, /Particulier/);
});
