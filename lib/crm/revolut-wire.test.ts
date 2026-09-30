import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StayPayment } from "../../components/account/StayPayment";
import { WireInstructions } from "../../components/account/WireInstructions";
import { groupIban, pickEurSepaWire } from "./revolut-wire";

const FR = "FR7630006000011234567890189";
const GB = "GB29REVO00996912345678";

test("le virement retient l’IBAN SEPA français du compte euros", () => {
  const wire = pickEurSepaWire(
    [
      { id: "usd", currency: "USD", state: "active", name: "Dollar" },
      { id: "old", currency: "EUR", state: "inactive", name: "Ancien" },
      { id: "eur", currency: "EUR", state: "active", name: "Principal" },
    ],
    [
      { accountId: "usd", rows: [{ iban: FR, bic: "REVOFRP2", schemes: ["sepa"] }] },
      { accountId: "old", rows: [{ iban: "FR7611111111111111111111111", schemes: ["sepa"] }] },
      {
        accountId: "eur",
        rows: [
          { iban: GB, bic: "REVOGB21", schemes: ["chaps"] },
          { iban: ` ${FR.toLowerCase()} `, bic: "revofrp2", beneficiary: "Travel Business Agency", schemes: ["sepa", "swift"] },
        ],
      },
    ]
  );
  assert.equal(wire?.iban, FR);
  assert.equal(wire?.bic, "REVOFRP2");
  assert.equal(wire?.accountHolder, "Travel Business Agency");
  assert.equal(groupIban(FR), "FR76 3000 6000 0112 3456 7890 189");
});

test("deux IBAN euros distincts ne donnent aucune coordonnée", () => {
  assert.equal(
    pickEurSepaWire(
      [
        { id: "a", currency: "EUR", state: "active" },
        { id: "b", currency: "EUR", state: "active" },
      ],
      [
        { accountId: "a", rows: [{ iban: FR, schemes: ["sepa"] }] },
        { accountId: "b", rows: [{ iban: "FR7611111111111111111111111", schemes: ["sepa"] }] },
      ]
    ),
    null
  );
});

test("un IBAN sans schéma SEPA explicite reste utilisable s’il est seul", () => {
  const wire = pickEurSepaWire(
    [{ id: "eur", currency: "eur", name: "Agence" }],
    [{ accountId: "eur", rows: [{ iban: FR, bic: "REVOFRP2" }] }]
  );
  assert.equal(wire?.accountHolder, "Agence");
  assert.equal(wire?.iban, FR);
});

test("le virement client n’ouvre plus de virement Stripe", () => {
  const route = readFileSync(new URL("../../app/api/client/bookings/[id]/pay/route.ts", import.meta.url), "utf8");
  const pay = readFileSync(new URL("./stripe-pay.ts", import.meta.url), "utf8");
  assert.equal(route.includes("customer_balance"), false);
  assert.equal(route.includes("eu_bank_transfer"), false);
  assert.equal(route.includes("loadAgencyEurWire"), true);
  assert.equal(pay.includes("bankTransferInstructions"), false);
  assert.equal(pay.includes('"revolut"'), true);
});

test("les coordonnées affichées demandent la référence du dossier", () => {
  const html = renderToStaticMarkup(
    createElement(WireInstructions, {
      iban: FR,
      bic: "REVOFRP2",
      accountHolder: "Travel Business Agency",
      reference: "TB-2026-0004",
    })
  );
  assert.match(html, /FR76 3000 6000 0112 3456 7890 189/);
  assert.match(html, /REVOFRP2/);
  assert.match(html, /Travel Business Agency/);
  assert.match(html, /TB-2026-0004/);
  assert.match(html, /compte Revolut/);
  assert.equal(html.includes("Stripe"), false);
});

test("le particulier voit le virement, le collaborateur société ne paie pas", () => {
  const personal = renderToStaticMarkup(
    createElement(StayPayment, {
      bookingId: "b1",
      reference: "TB-2026-0004",
      payerKind: "personal",
      companyName: null,
      canPay: true,
      methods: ["card", "apple_pay", "sepa_debit", "revolut"],
      amountLabel: "1 140,00 €",
      stripeKey: "pk_test_preview",
    })
  );
  assert.match(personal, /Régler ce voyage/);
  assert.match(personal, /Virement/);
  assert.match(personal, /Apple Pay/);
  assert.equal(personal.includes("pas encore ouvert"), false);

  const member = renderToStaticMarkup(
    createElement(StayPayment, {
      bookingId: "b1",
      reference: "TB-2026-0004",
      payerKind: "company",
      companyName: "Horizon SAS",
      canPay: false,
      methods: ["sepa_debit", "revolut"],
      amountLabel: "1 140,00 €",
      stripeKey: null,
    })
  );
  assert.match(member, /réglé par Horizon SAS/);
  assert.match(member, /Vous n’avez rien à payer ici/);
  assert.equal(member.includes("Virement"), false);
});
