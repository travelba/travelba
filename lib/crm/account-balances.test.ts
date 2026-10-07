import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountBalanceCard, AgencyAccountBalances } from "../../components/admin/AccountBalance";
import { formatMoney } from "./money";
import {
  dashboardRevolutPocket,
  dashboardStripePocket,
  pliantBalancePocket,
  revolutBalancePockets,
  stripeBalancePockets,
  stripeMinorToMajor,
} from "./account-balances";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("soldes des comptes", () => {
  it("convertit les centimes Stripe, y compris le yen", () => {
    assert.equal(stripeMinorToMajor(12345, "eur"), 123.45);
    assert.equal(stripeMinorToMajor(500, "jpy"), 500);
    assert.equal(stripeMinorToMajor(1234, "kwd"), 1.234);
  });

  it("met le disponible Stripe en grand et l’attente à part", () => {
    const [pocket] = stripeBalancePockets({
      available: [
        { amount: 10000, currency: "eur" },
        { amount: 2500, currency: "eur", source_types: { card: 2500 } },
      ],
      pending: [{ amount: 8000, currency: "eur" }],
    });
    assert.equal(pocket.amount, 125);
    assert.equal(pocket.pending, 80);
    assert.equal(pocket.name, null);
    assert.equal(pocket.currency, "EUR");
  });

  it("ordonne les devises Stripe, euros d’abord", () => {
    const pockets = stripeBalancePockets({
      available: [
        { amount: 500, currency: "usd" },
        { amount: 200, currency: "eur" },
      ],
      pending: [],
    });
    assert.deepEqual(
      pockets.map((pocket) => [pocket.name, pocket.amount, pocket.currency]),
      [
        ["EUR", 2, "EUR"],
        ["USD", 5, "USD"],
      ]
    );
  });

  it("un appel Stripe raté ne fabrique pas un zéro", () => {
    const [pocket] = stripeBalancePockets(null);
    assert.equal(pocket.amount, null);
  });

  it("ignore un compte Revolut inactif et place Main euros devant", () => {
    const pockets = revolutBalancePockets([
      { name: "Dollar", currency: "USD", state: "active", balance: 40 },
      { name: "Ancien", currency: "EUR", state: "inactive", balance: 999 },
      { name: "Main", currency: "EUR", state: "active", balance: "1234.5" },
      { name: "Sans solde", currency: "GBP", state: "active" },
    ]);
    assert.deepEqual(
      pockets.map((pocket) => [pocket.name, pocket.amount, pocket.currency]),
      [
        ["Main", 1234.5, "EUR"],
        ["Dollar", 40, "USD"],
      ]
    );
  });

  it("un seul compte Revolut n’affiche pas le nom de poche", () => {
    const [pocket] = revolutBalancePockets([{ name: "Main", currency: "EUR", state: "active", balance: 0 }]);
    assert.equal(pocket.name, null);
    assert.equal(pocket.amount, 0);
  });

  it("le tableau de bord ne garde que Revolut Main en euros", () => {
    const pockets = revolutBalancePockets([
      { name: "Main", currency: "EUR", state: "active", balance: 1315.11 },
      { name: "EUR", currency: "EUR", state: "active", balance: 0 },
      { name: "MYKONOS BB", currency: "EUR", state: "active", balance: 1054.38 },
      { name: "Main", currency: "GBP", state: "active", balance: 0 },
      { name: "Main", currency: "USD", state: "active", balance: 0 },
    ]);
    assert.deepEqual(
      dashboardRevolutPocket(pockets).map((pocket) => [pocket.name, pocket.amount, pocket.currency]),
      [["Main", 1315.11, "EUR"]]
    );
    const only = revolutBalancePockets([{ name: "Main", currency: "EUR", state: "active", balance: 12 }]);
    assert.equal(dashboardRevolutPocket(only)[0].name, "Main");
    assert.equal(dashboardRevolutPocket(null)[0].amount, null);
  });

  it("le tableau de bord Stripe montre le montant en attente", () => {
    const pockets = stripeBalancePockets({
      available: [{ amount: 0, currency: "eur" }],
      pending: [{ amount: 4976449, currency: "eur" }],
    });
    const [card] = dashboardStripePocket(pockets);
    assert.equal(card.name, "En attente");
    assert.equal(card.amount, 49764.49);
    assert.equal(card.pending, null);
    assert.equal(dashboardStripePocket(null)[0].amount, null);
  });

  it("Pliant reprend le disponible en euros", () => {
    assert.equal(pliantBalancePocket({ availableCents: 150000, currency: "EUR" })[0].amount, 1500);
    assert.equal(pliantBalancePocket({ availableCents: null, currency: "EUR" })[0].amount, null);
    assert.equal(pliantBalancePocket(null)[0].amount, null);
  });

  it("la carte reprend le libellé du solde Pliant", () => {
    const html = renderToStaticMarkup(
      createElement(AccountBalanceCard, {
        pockets: [{ name: null, amount: 1234.5, currency: "EUR", pending: 80 }],
      })
    );
    assert.match(html, /Solde du compte/);
    assert.ok(html.includes(formatMoney(1234.5)));
    assert.match(html, /En attente/);
    assert.ok(html.includes(formatMoney(80)));
    assert.equal(html.includes("payer_email"), false);
  });

  it("le tableau de bord n’affiche que Main, l’attente Stripe et Pliant", () => {
    const html = renderToStaticMarkup(
      createElement(AgencyAccountBalances, {
        accounts: [
          {
            label: "Revolut",
            href: "/admin/revolut",
            pockets: dashboardRevolutPocket(
              revolutBalancePockets([
                { name: "Main", currency: "EUR", state: "active", balance: 1315.11 },
                { name: "MYKONOS BB", currency: "EUR", state: "active", balance: 1054.38 },
              ])
            ),
          },
          {
            label: "Stripe",
            href: "/admin/stripe",
            pockets: dashboardStripePocket(
              stripeBalancePockets({
                available: [{ amount: 0, currency: "eur" }],
                pending: [{ amount: 4976449, currency: "eur" }],
              })
            ),
          },
          {
            label: "Pliant",
            href: "/admin/pliant",
            pockets: pliantBalancePocket({ availableCents: 226142, currency: "EUR" }),
          },
        ],
      })
    );
    assert.equal((html.match(/href=/g) || []).length, 3);
    assert.match(html, /Main/);
    assert.match(html, /En attente/);
    assert.equal(html.includes("MYKONOS"), false);
    assert.ok(html.includes(formatMoney(1315.11)));
    assert.ok(html.includes(formatMoney(49764.49)));
    assert.ok(html.includes(formatMoney(2261.42)));
  });

  it("le tableau de bord relie Revolut, Stripe et Pliant", () => {
    const html = renderToStaticMarkup(
      createElement(AgencyAccountBalances, {
        accounts: [
          { label: "Revolut", href: "/admin/revolut", pockets: [{ name: null, amount: 10, currency: "EUR", pending: null }] },
          { label: "Stripe", href: "/admin/stripe", pockets: [{ name: null, amount: null, currency: "EUR", pending: null }] },
          { label: "Pliant", href: "/admin/pliant", pockets: [{ name: null, amount: 20, currency: "EUR", pending: null }] },
        ],
      })
    );
    assert.match(html, /Soldes des comptes/);
    assert.match(html, /href="\/admin\/revolut"/);
    assert.match(html, /href="\/admin\/stripe"/);
    assert.match(html, /href="\/admin\/pliant"/);
    assert.match(html, /Indisponible/);
    assert.ok(html.includes(formatMoney(10)));
  });

  it("chaque compte a sa carte et son solde", () => {
    const html = renderToStaticMarkup(
      createElement(AgencyAccountBalances, {
        bare: true,
        accounts: [
          {
            label: "Revolut",
            href: "/admin/revolut",
            pockets: [
              { name: "Main", amount: 1234.5, currency: "EUR", pending: null },
              { name: "Dollar", amount: 40, currency: "USD", pending: null },
            ],
          },
        ],
      })
    );
    assert.equal((html.match(/href="\/admin\/revolut"/g) || []).length, 2);
    assert.match(html, /Main/);
    assert.match(html, /Dollar/);
    assert.ok(html.includes(formatMoney(1234.5)));
    assert.ok(html.includes(formatMoney(40, "USD")));
  });

  it("l’accueil et les pages argent affichent ces soldes", () => {
    const home = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
    const stripe = readFileSync(join(root, "app/admin/stripe/page.tsx"), "utf8");
    const revolut = readFileSync(join(root, "app/admin/revolut/page.tsx"), "utf8");
    assert.match(home, /AgencyAccountBalances/);
    assert.match(home, /loadAgencyAccounts/);
    assert.match(stripe, /AccountBalanceCard/);
    assert.match(stripe, /loadStripeAccountBalance/);
    assert.match(revolut, /AccountBalanceCard/);
    assert.match(revolut, /loadRevolutAccountBalances/);
  });
});
