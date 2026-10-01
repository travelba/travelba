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

test("le compte Main l’emporte sur une poche euros", () => {
  const pocket = "FR7611111111111111111111111";
  const wire = pickEurSepaWire(
    [
      { id: "pocket", currency: "EUR", state: "active", name: "MYKONOS BB" },
      { id: "main", currency: "EUR", state: "active", name: "Main" },
      { id: "spare", currency: "EUR", state: "active", name: "" },
    ],
    [
      { accountId: "pocket", rows: [{ iban: pocket, bic: "REVOFRP2", schemes: ["sepa", "swift"] }] },
      {
        accountId: "main",
        rows: [
          { iban: ` ${FR.toLowerCase()} `, bic: "revofrp2", beneficiary: "Travel Business Agency", schemes: ["sepa", "swift"] },
          { iban: FR, bic: "REVOFRP2", beneficiary: "Travel Business Agency", schemes: ["sepa", "swift"] },
        ],
      },
      { accountId: "spare", rows: [{ iban: "FR7622222222222222222222222", schemes: ["sepa"] }] },
    ]
  );
  assert.equal(wire?.iban, FR);
  assert.equal(wire?.accountHolder, "Travel Business Agency");
});

test("deux comptes Main distincts ne donnent aucune coordonnée", () => {
  assert.equal(
    pickEurSepaWire(
      [
        { id: "a", currency: "EUR", state: "active", name: "Main" },
        { id: "b", currency: "EUR", state: "active", name: " main " },
      ],
      [
        { accountId: "a", rows: [{ iban: FR, schemes: ["sepa"] }] },
        { accountId: "b", rows: [{ iban: "FR7611111111111111111111111", schemes: ["sepa"] }] },
      ]
    ),
    null
  );
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
  const route = readFileSync(new URL("../../app/api/client/ledger/pay/route.ts", import.meta.url), "utf8");
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
      amountLabel: "140,00 €",
    })
  );
  assert.match(html, /FR76 3000 6000 0112 3456 7890 189/);
  assert.match(html, /REVOFRP2/);
  assert.match(html, /Travel Business Agency/);
  assert.match(html, /TB-2026-0004/);
  assert.match(html, /140,00 €/);
  assert.match(html, /Montant à virer/);
  assert.match(html, /compte Revolut/);
  assert.equal(html.includes("Stripe"), false);
});

test("le règlement de l’encours distingue société et particulier", () => {
  const personal = renderToStaticMarkup(
    createElement(StayPayment, {
      stripeKey: "pk_test_preview",
      parts: [
        {
          kind: "personal",
          mention: "Particulier",
          amountLabel: "1 000,00 €",
          payable: true,
          canPay: true,
          methods: ["card", "apple_pay", "revolut"],
          companyName: null,
        },
        {
          kind: "company",
          mention: "Société · Horizon SAS",
          amountLabel: "140,00 €",
          payable: true,
          canPay: false,
          methods: ["sepa_debit", "revolut"],
          companyName: "Horizon SAS",
        },
      ],
    })
  );
  assert.match(personal, /Particulier/);
  assert.match(personal, /Société · Horizon SAS/);
  assert.match(personal, /Virement/);
  assert.match(personal, /Apple Pay/);
  assert.match(personal, /Carte bancaire/);
  assert.equal(personal.includes("Prélèvement SEPA"), false);
  assert.match(personal, /Le règlement se fait par Horizon SAS/);
  assert.equal(personal.includes("Régler ce voyage"), false);
  assert.equal(personal.includes("/api/client/bookings/"), false);
});
