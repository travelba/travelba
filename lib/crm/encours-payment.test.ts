import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EncoursPayment } from "../../components/account/EncoursPayment";

test("Régler propose carte, Apple Pay et virement au particulier", () => {
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
  assert.match(html, /Virement/);
  assert.doesNotMatch(html, /Prélèvement SEPA/);
  assert.match(html, /Particulier/);
  assert.doesNotMatch(html, /Société/);
});

test("Régler propose carte, Apple Pay, prélèvement et virement à la société", () => {
  const html = renderToStaticMarkup(
    createElement(EncoursPayment, {
      company: 1200,
      personal: 0,
      currency: "EUR",
      soleCompanyName: "Maison Dupont",
      stripeKey: "pk_test_preview",
    })
  );
  assert.match(html, /Régler/);
  assert.match(html, /Carte bancaire/);
  assert.match(html, /Apple Pay/);
  assert.match(html, /Prélèvement SEPA/);
  assert.match(html, /Virement/);
  assert.match(html, /Société · Maison Dupont/);
  assert.doesNotMatch(html, /Particulier/);
});

test("Régler sépare la part société et la part particulier en deux blocs", () => {
  const html = renderToStaticMarkup(
    createElement(EncoursPayment, {
      compact: true,
      company: 800,
      personal: 150,
      currency: "EUR",
      soleCompanyName: null,
      stripeKey: "pk_test_preview",
    })
  );
  assert.equal(html.match(/rounded-2xl border/g)?.length, 2);
  assert.match(html, /Société/);
  assert.match(html, /Particulier/);
  assert.match(html, /Carte, Apple Pay, prélèvement ou virement/);
  assert.match(html, /À régler par carte, Apple Pay ou virement/);
  assert.match(html, /Prélèvement SEPA/);
  assert.match(html, /Carte bancaire/);
});

test("Régler ne rend rien sous 0,50", () => {
  const html = renderToStaticMarkup(
    createElement(EncoursPayment, {
      company: 0.2,
      personal: 0,
      currency: "EUR",
      soleCompanyName: null,
      stripeKey: "pk_test_preview",
    })
  );
  assert.equal(html, "");
});
