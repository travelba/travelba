import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientTransactionsPanel } from "../../components/account/ClientTransactionsPanel";
import { shapeClientLedger } from "./client-ledger";
import { customerPatchFromBody } from "./customer-patch";
import { formatMoney } from "./money";
import type { CrmTransaction } from "./types";

function tx(partial: Partial<CrmTransaction> & Pick<CrmTransaction, "id" | "direction" | "kind" | "amount">): CrmTransaction {
  return {
    customer_id: "raphael",
    booking_id: null,
    currency: "EUR",
    occurred_on: "2026-08-01",
    label: "Mouvement",
    source: "manual",
    external_id: null,
    status: "posted",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...partial,
  };
}

const raphael = { id: "raphael", name: "Raphael Benilouche", allowance: 30000 };
const gaelle = { id: "gaelle", name: "Gaelle Zerbib", allowance: 10000 };
const louis = { id: "louis", name: "Louis Martin", allowance: 10000 };

const bookings = [
  {
    id: "b-raphael",
    title: "Rome",
    destination: "Rome",
    reference: "TB-R",
    start_date: "2026-09-01",
    end_date: "2026-09-05",
    visible_to_client: true,
    customer_id: "raphael",
    owner_name: "Raphael Benilouche",
    displayed_amount: 12000,
  },
  {
    id: "b-gaelle",
    title: "Avoriaz",
    destination: "Avoriaz",
    reference: "TB-G",
    start_date: "2026-12-20",
    end_date: "2026-12-27",
    visible_to_client: true,
    customer_id: "gaelle",
    owner_name: "Gaelle Zerbib",
    displayed_amount: 8000,
  },
];

const rows = [
  tx({ id: "wire", direction: "credit", kind: "transfer", amount: 50000, label: "Virement cabinet" }),
  tx({
    id: "raphael-stay",
    direction: "debit",
    kind: "booking",
    amount: 12000,
    booking_id: "b-raphael",
    external_id: "booking:b-raphael:item:h",
    label: "Hôtel Rome",
  }),
  tx({
    id: "gaelle-stay",
    direction: "debit",
    kind: "booking",
    amount: 2400,
    booking_id: "b-gaelle",
    external_id: "booking:b-gaelle:item:h",
    label: "Hôtel Avoriaz",
  }),
];

test("sans droit de dépense, le grand livre actuel reste", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: 35600,
    currency: "EUR",
    audience: "client",
    bookings,
    rows,
  });
  assert.equal(view.spending, null);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /Mouvements/);
  assert.equal(html.includes("Compte de rattachement"), false);
});

test("Gaelle voit son reste et son séjour, pas le virement ni les autres droits", () => {
  const view = shapeClientLedger({
    companyRole: "member",
    viewerId: "gaelle",
    travelerBookingIds: ["b-gaelle"],
    walletBalance: 35600,
    currency: "EUR",
    audience: "client",
    bookings,
    spendAccounts: [gaelle],
    rows,
  });
  assert.equal(view.spending?.mode, "member");
  assert.equal(view.spending?.own?.remaining, 7600);
  assert.equal(view.spending?.accounts.length, 0);
  assert.deepEqual(
    view.spending?.cards.map((card) => card.id),
    ["b-gaelle"]
  );
  assert.equal(view.spending?.cards[0].amountLabel, formatMoney(8000, "EUR"));
  assert.equal(view.spending?.cards[0].accountName, "Gaelle Zerbib");
  assert.equal(view.spending?.cards[0].movements[0].id, "gaelle-stay");
  assert.equal(view.spending?.cards[0].movements[0].carnetHref, "/mon-compte/reservations/TB-G");
  assert.equal(view.spending?.otherMovements.length, 0);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /Encours/);
  assert.match(html, /Droit de dépense/);
  assert.ok(html.includes(formatMoney(10000, "EUR")));
  assert.ok(html.includes(formatMoney(7600, "EUR")));
  assert.equal(html.includes("Votre droit de dépense"), false);
  assert.match(html, /Avoriaz/);
  assert.match(html, /Compte de rattachement/);
  assert.equal(html.includes("Raphael"), false);
  assert.equal(html.includes("Louis"), false);
  assert.equal(html.includes(formatMoney(50000, "EUR")), false);
  assert.equal(html.includes("Autres mouvements"), false);
});

test("Raphael voit l’encours société, les trois droits et le compte de chaque séjour", () => {
  const view = shapeClientLedger({
    companyRole: "admin",
    viewerId: "raphael",
    travelerBookingIds: ["b-raphael"],
    walletBalance: 35600,
    currency: "EUR",
    audience: "client",
    bookings,
    spendAccounts: [raphael, gaelle, louis],
    rows,
  });
  assert.equal(view.spending?.mode, "admin");
  assert.equal(view.balanceValue, 35600);
  assert.deepEqual(
    view.spending?.accounts.map((account) => [account.name, account.remaining]),
    [
      ["Raphael Benilouche", 18000],
      ["Gaelle Zerbib", 7600],
      ["Louis Martin", 10000],
    ]
  );
  const gaelleCard = view.spending?.cards.find((card) => card.id === "b-gaelle");
  assert.equal(gaelleCard?.accountName, "Gaelle Zerbib");
  assert.equal(gaelleCard?.remainingLabel, `Reste ${formatMoney(7600, "EUR")}`);
  assert.equal(gaelleCard?.movements[0].carnetHref, null);
  assert.equal(view.spending?.otherMovements[0].title, "Virement cabinet");
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /Encours/);
  assert.ok(html.includes(formatMoney(35600, "EUR")));
  assert.match(html, /Droits de dépense/);
  assert.match(html, /Gaelle Zerbib/);
  assert.match(html, /Louis Martin/);
  assert.match(html, /Autres mouvements/);
  assert.match(html, /Virement cabinet/);
  assert.equal(html.includes("Votre droit de dépense"), false);
});

test("un crédit sur le dossier de Gaelle rend une partie de son droit", () => {
  const view = shapeClientLedger({
    companyRole: "member",
    viewerId: "gaelle",
    travelerBookingIds: ["b-gaelle"],
    walletBalance: 0,
    currency: "EUR",
    audience: "staff",
    bookings: [bookings[1]],
    spendAccounts: [gaelle],
    rows: [
      tx({
        id: "gaelle-stay",
        direction: "debit",
        kind: "booking",
        amount: 2400,
        booking_id: "b-gaelle",
        customer_id: "gaelle",
        external_id: "booking:b-gaelle:item:h",
        label: "Hôtel",
      }),
      tx({
        id: "refund",
        direction: "credit",
        kind: "refund",
        amount: 400,
        booking_id: "b-gaelle",
        customer_id: "gaelle",
        label: "Avoir",
      }),
    ],
  });
  assert.equal(view.spending?.own?.spent, 2000);
  assert.equal(view.spending?.own?.remaining, 8000);
  assert.equal(view.spending?.cards[0].movements[0].carnetHref, "/admin/reservations/b-gaelle");
});

test("la limite ne compte que les dépenses du crédit, pas Pro", () => {
  const view = shapeClientLedger({
    companyRole: "admin",
    viewerId: "raphael",
    travelerBookingIds: ["b-rome", "b-bordeaux"],
    walletBalance: 5800,
    currency: "EUR",
    audience: "client",
    spendAccounts: [raphael],
    fundingCompanies: [
      { id: "rba", company_name: "RB&A", funding: "advance", sort_order: 0 },
      { id: "pro", company_name: "Pro", funding: "pro", sort_order: 1 },
    ],
    bookings: [
      {
        id: "b-rome",
        title: "Rome",
        destination: "Rome",
        reference: "TB-R",
        start_date: "2026-09-01",
        end_date: "2026-09-05",
        visible_to_client: true,
        customer_id: "raphael",
        owner_name: "Raphael Benilouche",
        displayed_amount: 2400,
        billing_company_id: "rba",
      },
      {
        id: "b-bordeaux",
        title: "Bordeaux",
        destination: "Bordeaux",
        reference: "TB-B",
        start_date: "2026-10-01",
        end_date: "2026-10-03",
        visible_to_client: true,
        customer_id: "raphael",
        owner_name: "Raphael Benilouche",
        displayed_amount: 268.66,
        billing_company_id: "pro",
      },
    ],
    rows: [
      tx({
        id: "rome",
        direction: "debit",
        kind: "booking",
        amount: 2400,
        booking_id: "b-rome",
        billing_company_id: "rba",
        label: "Hôtel Rome",
      }),
      tx({
        id: "bordeaux",
        direction: "debit",
        kind: "booking",
        amount: 268.66,
        booking_id: "b-bordeaux",
        billing_company_id: "pro",
        label: "Mondrian",
      }),
    ],
  });
  assert.equal(view.spending?.accounts[0]?.spent, 2400);
  assert.equal(view.spending?.accounts[0]?.remaining, 27600);
  const bordeaux = view.spending?.cards.find((card) => card.id === "b-bordeaux");
  assert.equal(bordeaux?.remainingLabel, null);
  const rome = view.spending?.cards.find((card) => card.id === "b-rome");
  assert.equal(rome?.remainingLabel, `Reste ${formatMoney(27600, "EUR")}`);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  const credit = html.indexOf("Crédit");
  const rights = html.indexOf("Droits de dépense");
  const pro = html.indexOf(">Pro<");
  assert.ok(credit >= 0 && rights > credit && pro > rights);
});

test("le droit de dépense se lit en euros et disparaît pour un particulier", () => {
  const parsed = customerPatchFromBody({
    company_role: "member",
    spending_allowance: "10 000,5",
  });
  assert.equal(parsed.error, undefined);
  assert.equal(parsed.patch.spending_allowance, 10000.5);

  const refused = customerPatchFromBody({ company_role: "admin", spending_allowance: "-1" });
  assert.match(refused.error || "", /euros/);

  const cleared = customerPatchFromBody({ company_role: null, spending_allowance: "30000" });
  assert.equal(cleared.patch.spending_allowance, null);
});
