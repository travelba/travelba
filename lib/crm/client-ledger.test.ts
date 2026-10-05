import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientTransactionsPanel } from "../../components/account/ClientTransactionsPanel";
import { shapeClientLedger } from "./client-ledger";
import { formatMoney } from "./money";
import type { CrmTransaction } from "./types";

function tx(partial: Partial<CrmTransaction> & Pick<CrmTransaction, "id" | "direction" | "kind" | "amount">): CrmTransaction {
  return {
    customer_id: "c1",
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

const booking = {
  id: "b1",
  title: "Avoriaz",
  destination: "Avoriaz",
  reference: "TB-1",
  start_date: "2026-08-10",
  end_date: "2026-08-17",
  visible_to_client: false,
};

test("la vue client masque le séjour dès qu’une dépense du dossier est postée", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: ["b1"],
    walletBalance: -250,
    currency: "EUR",
    audience: "client",
    bookings: [{ ...booking, visible_to_client: true }],
    rows: [
      tx({
        id: "stay",
        direction: "debit",
        kind: "booking",
        amount: 1000,
        booking_id: "b1",
        label: "Réservation TB-1",
      }),
      tx({
        id: "hotel",
        direction: "debit",
        kind: "booking",
        amount: 400,
        booking_id: "b1",
        external_id: "booking:b1:item:h",
        label: "Hôtel des Cimes — TB-1",
      }),
    ],
  });

  assert.deepEqual(
    view.movements.map((row) => row.id),
    ["hotel"]
  );
  assert.equal(view.movements[0].title, "Hôtel des Cimes");
  assert.equal(view.movements[0].reference, "TB-1");
  assert.equal(view.movements[0].carnetHref, "/mon-compte/reservations/TB-1");
  assert.equal(view.movements[0].carnetLabel, "Accéder à ma réservation");
  assert.equal(view.remaining, 250);
});

test("un collaborateur ne voit pas les crédits société", () => {
  const view = shapeClientLedger({
    companyRole: "member",
    travelerBookingIds: ["b1"],
    walletBalance: 9000,
    currency: "EUR",
    audience: "staff",
    bookings: [booking],
    rows: [
      tx({
        id: "wire",
        direction: "credit",
        kind: "transfer",
        amount: 9000,
        label: "Virement société",
      }),
      tx({
        id: "fee",
        direction: "debit",
        kind: "booking",
        amount: 120,
        booking_id: "b1",
        external_id: "booking:b1:item:f",
        label: "Vol",
      }),
      tx({
        id: "other",
        direction: "debit",
        kind: "booking",
        amount: 80,
        booking_id: "b2",
        external_id: "booking:b2:item:x",
        label: "Autre dossier",
      }),
    ],
  });

  assert.equal(view.member, true);
  assert.deepEqual(
    view.movements.map((row) => row.id),
    ["fee"]
  );
  assert.equal(view.creditCount, 0);
  assert.equal(view.movements[0].amountLabel, `−${formatMoney(120, "EUR")}`);
  assert.equal(view.movements[0].reference, null);
  assert.equal(view.movements[0].whenWhere, null);
  assert.equal(view.movements[0].carnetHref, "/admin/reservations/b1");
  assert.equal(view.movements[0].carnetLabel, "Ouvrir le dossier");
});

test("le carnet non publié reste fermé dans l’espace client", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -50,
    currency: "EUR",
    audience: "client",
    bookings: [booking],
    rows: [
      tx({
        id: "stay",
        direction: "debit",
        kind: "booking",
        amount: 50,
        booking_id: "b1",
        label: "Séjour",
      }),
    ],
  });

  assert.equal(view.movements[0].title, "Séjour");
  assert.equal(view.movements[0].carnetHref, null);
  assert.equal(view.movements[0].companyLabel, null);
});

test("la société est absente du mouvement s’il n’y en a qu’une", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -40,
    currency: "EUR",
    audience: "client",
    bookings: [],
    billingCompanyCount: 1,
    companyNames: new Map([["co", "Atelier"]]),
    rows: [
      tx({
        id: "fee",
        direction: "debit",
        kind: "booking",
        amount: 40,
        billing_company_id: "co",
        label: "Dépense",
      }),
    ],
  });
  assert.equal(view.balanceValue, -40);
  assert.equal(view.owed.total, 40);
  assert.equal(view.owed.company, 40);
  assert.equal(view.owed.personal, 0);
  assert.equal(view.movements[0].companyLabel, null);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /Encours/);
  assert.ok(html.includes(formatMoney(-40, "EUR")));
  assert.equal(html.includes("Somme de ce que vous devez"), false);
  assert.equal(html.includes("Répartition"), false);
  assert.equal(html.includes("Régler ce voyage"), false);
});

test("la société est précisée quand le compte en a plusieurs", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: 35,
    currency: "EUR",
    audience: "staff",
    bookings: [],
    billingCompanyCount: 2,
    companyNames: new Map([
      ["a", "Atelier"],
      ["b", "Bureau"],
    ]),
    rows: [
      tx({
        id: "wire",
        direction: "credit",
        kind: "transfer",
        amount: 100,
        label: "Virement",
      }),
      tx({
        id: "fee",
        direction: "debit",
        kind: "booking",
        amount: 40,
        billing_company_id: "b",
        label: "Dépense",
      }),
    ],
  });
  assert.equal(view.balanceValue, 35);
  assert.equal(view.movements[0].companyLabel, null);
  assert.equal(view.movements[1].companyLabel, "Bureau");
});

test("le pourcentage réglé compte le séjour encore au livre", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: ["b1"],
    walletBalance: -20732.04,
    currency: "EUR",
    audience: "staff",
    bookings: [{ ...booking, reference: "TB-2026-0038" }],
    rows: [
      tx({ id: "c1", direction: "credit", kind: "transfer", amount: 4230.25, label: "Virement" }),
      tx({ id: "c2", direction: "credit", kind: "transfer", amount: 10000, label: "Virement" }),
      tx({
        id: "stay",
        direction: "debit",
        kind: "booking",
        amount: 33737.29,
        booking_id: "b1",
        label: "Réservation",
      }),
      tx({
        id: "hotel-fee",
        direction: "debit",
        kind: "booking",
        amount: 20,
        booking_id: "b1",
        external_id: "booking:b1:expense:h",
        label: "Dépense hôtel",
      }),
      tx({
        id: "air-fee",
        direction: "debit",
        kind: "booking",
        amount: 459,
        booking_id: "b1",
        external_id: "booking:b1:expense:a",
        label: "Dépense billeterie",
      }),
      tx({
        id: "tickets",
        direction: "debit",
        kind: "adjustment",
        amount: 50,
        booking_id: "b1",
        external_id: "booking:b1:ticketing-fee",
        label: "Frais de billeterie (2 billets)",
      }),
      tx({
        id: "flight",
        direction: "debit",
        kind: "booking",
        amount: 696,
        booking_id: "b1",
        external_id: "booking:b1:item:f",
        label: "Vol",
      }),
    ],
  });

  assert.equal(
    view.movements.some((row) => row.id === "stay"),
    false
  );
  assert.equal(view.remaining, 20732.04);
  assert.equal(view.remainingPct, 59);
  assert.equal(view.owed.total, 20732.04);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /41% réglé/);
  assert.equal(html.includes("100% réglé"), false);
  assert.ok(html.includes(formatMoney(-20732.04, "EUR")));
  assert.equal(html.includes("Somme de ce que vous devez"), false);
  assert.equal(html.includes("Répartition"), false);
});

test("sans la carte en double, le séjour réapparaît et le pourcentage suit le solde", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: ["b1"],
    walletBalance: -20036.04,
    currency: "EUR",
    audience: "client",
    bookings: [{ ...booking, reference: "TB-2026-0038", visible_to_client: true }],
    rows: [
      tx({ id: "c1", direction: "credit", kind: "transfer", amount: 4230.25, label: "Virement" }),
      tx({ id: "c2", direction: "credit", kind: "transfer", amount: 10000, label: "Virement" }),
      tx({
        id: "stay",
        direction: "debit",
        kind: "booking",
        amount: 33737.29,
        booking_id: "b1",
        label: "Réservation TB-2026-0038",
      }),
      tx({
        id: "hotel-fee",
        direction: "debit",
        kind: "booking",
        amount: 20,
        booking_id: "b1",
        external_id: "booking:b1:expense:h",
        label: "Dépense hôtel",
      }),
      tx({
        id: "air-fee",
        direction: "debit",
        kind: "booking",
        amount: 459,
        booking_id: "b1",
        external_id: "booking:b1:expense:a",
        label: "Dépense billeterie",
      }),
      tx({
        id: "tickets",
        direction: "debit",
        kind: "adjustment",
        amount: 50,
        booking_id: "b1",
        external_id: "booking:b1:ticketing-fee",
        label: "Frais de billeterie (2 billets)",
      }),
    ],
  });

  assert.equal(view.movements.some((row) => row.id === "stay"), true);
  assert.equal(view.movements.find((row) => row.id === "stay")?.title, "Séjour");
  assert.equal(view.remaining, 20036.04);
  assert.equal(view.remainingPct, 58);
  assert.equal(view.owed.total, 20036.04);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.match(html, /42% réglé/);
  assert.equal(html.includes("100% réglé"), false);
  assert.ok(html.includes(formatMoney(-20036.04, "EUR")));
  assert.match(html, /Séjour/);
  assert.match(html, /TB-2026-0038/);
  assert.equal(html.includes("Répartition"), false);
});

test("un encours par devise, l’euro reste la devise principale", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: -300,
    currency: "EUR",
    audience: "client",
    bookings: [],
    wallets: [
      { currency: "USD", balance: -1200 },
      { currency: "EUR", balance: -300 },
    ],
    rows: [
      tx({ id: "eur-debit", direction: "debit", kind: "booking", amount: 500, label: "Séjour" }),
      tx({ id: "eur-credit", direction: "credit", kind: "transfer", amount: 200, label: "Virement" }),
      tx({ id: "usd-debit", direction: "debit", kind: "booking", amount: 1200, currency: "USD", label: "Hôtel" }),
    ],
  });
  assert.equal(view.currency, "EUR");
  assert.deepEqual(
    view.wallets.map((wallet) => [wallet.currency, wallet.balanceValue, wallet.remaining, wallet.remainingPct, wallet.creditCount]),
    [
      ["USD", -1200, 1200, 100, 0],
      ["EUR", -300, 300, 60, 1],
    ]
  );
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view, statementName: "Camille Morel" }));
  assert.match(html, /Encours USD/);
  assert.match(html, /Encours EUR/);
  assert.ok(html.includes(formatMoney(-1200, "USD")));
  assert.ok(html.includes(formatMoney(-300, "EUR")));
  assert.match(html, /Demander un relevé/);
  assert.match(html, /Relev%C3%A9%20de%20compte%20%E2%80%94%20Camille%20Morel/);
});

test("sans liste de soldes, la vue garde un seul encours", () => {
  const view = shapeClientLedger({
    companyRole: null,
    travelerBookingIds: [],
    walletBalance: 80,
    currency: "EUR",
    audience: "client",
    bookings: [],
    rows: [],
  });
  assert.equal(view.wallets.length, 1);
  assert.equal(view.wallets[0].currency, "EUR");
  assert.equal(view.wallets[0].balanceValue, 80);
  const html = renderToStaticMarkup(createElement(ClientTransactionsPanel, { view }));
  assert.equal(html.includes("Encours EUR"), false);
  assert.match(html, /Encours/);
});
