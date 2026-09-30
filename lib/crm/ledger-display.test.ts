import assert from "node:assert/strict";
import test from "node:test";
import { HIDDEN_PRICE_LABEL } from "./carnet";
import { agencyFeeFromGross, formatMoney } from "./money";
import { TICKETING_FEE_LABEL } from "./ticketing-fee";
import { AGENCY_FEE_LABEL } from "./types";
import {
  clientStayPriceLabel,
  stayPriceWithExpenses,
  clientStayExpenseLines,
  coversStayRollup,
  isAgencyCommissionDebit,
  isFreeExpenseDebit,
  isStayRollupDebit,
  ledgerMovementTitle,
  ledgerPlace,
  ledgerSubjectTitle,
  ledgerWhenWhere,
  reservationContextLabel,
  visibleLedgerRows,
} from "./ledger-display";

test("le montant global du séjour disparaît dès qu’une dépense du dossier est là", () => {
  const rows = [
    {
      id: "stay",
      booking_id: "b1",
      direction: "debit",
      kind: "booking",
      external_id: null,
    },
    {
      id: "flight",
      booking_id: "b1",
      direction: "debit",
      kind: "booking",
      external_id: "booking:b1:item:1",
    },
    {
      id: "fee",
      booking_id: "b1",
      direction: "debit",
      kind: "adjustment",
      external_id: "booking:b1:ticketing-fee",
    },
    {
      id: "alone",
      booking_id: "b2",
      direction: "debit",
      kind: "booking",
      external_id: null,
    },
    {
      id: "wire",
      booking_id: null,
      direction: "credit",
      kind: "transfer",
      external_id: "revolut",
    },
  ];
  assert.equal(isStayRollupDebit(rows[0]), true);
  assert.equal(isStayRollupDebit(rows[1]), false);
  assert.deepEqual(
    visibleLedgerRows(rows).map((row) => row.id),
    ["flight", "fee", "alone", "wire"]
  );
});

test("une dépense libre reste à côté du montant du séjour", () => {
  const stay = {
    id: "stay",
    booking_id: "b1",
    direction: "debit",
    kind: "booking",
    external_id: null,
  };
  const expense = {
    id: "extra",
    booking_id: "b1",
    direction: "debit",
    kind: "booking",
    external_id: "booking:b1:expense:e1",
  };
  assert.equal(isFreeExpenseDebit(expense), true);
  assert.equal(coversStayRollup(expense), false);
  assert.equal(coversStayRollup(stay), false);
  assert.deepEqual(
    visibleLedgerRows([stay, expense]).map((row) => row.id),
    ["stay", "extra"]
  );
});

test("la commission 10 % reste à côté du montant du séjour", () => {
  const stay = {
    id: "stay",
    booking_id: "b1",
    direction: "debit",
    kind: "booking",
    external_id: null,
  };
  const commission = {
    id: "fee",
    booking_id: "b1",
    direction: "debit",
    kind: "adjustment",
    external_id: "booking:b1:agency-commission",
  };
  assert.equal(isAgencyCommissionDebit(commission), true);
  assert.equal(coversStayRollup(commission), false);
  assert.deepEqual(
    visibleLedgerRows([stay, commission]).map((row) => row.id),
    ["stay", "fee"]
  );
});

test("le montant global du séjour se lit comme une dépense", () => {
  assert.equal(
    ledgerMovementTitle(
      {
        booking_id: "b2",
        direction: "debit",
        kind: "booking",
        external_id: null,
        label: "Réservation TB-2026-0028 — Avoriaz",
      },
      "Réservation"
    ),
    "Séjour"
  );
  assert.equal(
    ledgerMovementTitle(
      {
        booking_id: "b1",
        direction: "debit",
        kind: "booking",
        external_id: "booking:b1:item:1",
        label: "Vol · Paris → Tel Aviv — TB-2026-0031",
      },
      "Réservation"
    ),
    "Vol · Paris → Tel Aviv — TB-2026-0031"
  );
  assert.equal(
    ledgerMovementTitle(
      {
        booking_id: "b1",
        direction: "debit",
        kind: "booking",
        external_id: "booking:b1:item:g1",
        label: "Greeter · Accueil VIP et Fastpass aller — TB-2026-0031",
      },
      "Réservation"
    ),
    "VIP Airport · Accueil VIP et Fastpass aller — TB-2026-0031"
  );
});

test("le titre dit de quoi il s’agit, la ligne du dessous la date et le lieu", () => {
  assert.equal(
    ledgerSubjectTitle("Vol · Paris → Tel Aviv — TB-2026-0033", "TB-2026-0033"),
    "Vol · Paris → Tel Aviv"
  );
  assert.equal(ledgerSubjectTitle("Frais de billeterie (4 billets)", "TB-2026-0033"), "Frais de billeterie (4 billets)");
  assert.equal(ledgerPlace({ title: "Tel Aviv", destination: "Tel Aviv", reference: "TB-1" }), "Tel Aviv");
  assert.equal(ledgerPlace({ title: "Séjour ski", destination: null, reference: "TB-1" }), "Séjour ski");
  assert.equal(ledgerPlace(null), null);
  assert.equal(ledgerWhenWhere("14 — 23 décembre 2026", "Tel Aviv"), "14 — 23 décembre 2026 · Tel Aviv");
  assert.equal(ledgerWhenWhere(null, null), null);
});

test("le contexte nomme le séjour, sans formule dans le cadre", () => {
  assert.equal(
    reservationContextLabel({ title: "Tel Aviv", reference: "TB-2026-0031" }),
    "Tel Aviv"
  );
  assert.equal(
    reservationContextLabel({ title: "  ", destination: "Avoriaz", reference: "TB-1" }),
    "Avoriaz"
  );
  assert.equal(reservationContextLabel({ title: "  ", reference: "TB-1" }), "TB-1");
  assert.equal(reservationContextLabel(null), null);
});

test("le prix du séjour ajoute les frais d’agence et les dépenses libres", () => {
  assert.equal(
    stayPriceWithExpenses({
      stayTotal: 1000,
      agencyCommission: true,
      expenses: [{ amount: 40 }, { amount: null }, { amount: 0 }],
    }),
    1140
  );
  assert.equal(
    stayPriceWithExpenses({
      stayTotal: 1000,
      agencyCommission: false,
      expenses: [{ amount: 40 }],
    }),
    1040
  );
  assert.equal(
    stayPriceWithExpenses({ stayTotal: 0, agencyCommission: true, expenses: [{ amount: 40 }] }),
    40
  );
  assert.equal(
    clientStayPriceLabel({
      stayTotal: 1000,
      currency: "EUR",
      pricesVisible: true,
      agencyCommission: true,
      expenses: [{ amount: 40 }],
    }),
    formatMoney(1140, "EUR")
  );
  assert.equal(
    clientStayPriceLabel({
      stayTotal: 1000,
      currency: "EUR",
      pricesVisible: false,
      agencyCommission: true,
      expenses: [{ amount: 40 }],
    }),
    HIDDEN_PRICE_LABEL
  );
});

test("la réservation client liste les frais d’agence puis les dépenses libres", () => {
  const lines = clientStayExpenseLines({
    expenses: [
      { id: "e1", title: "Pourboire", amount: 40 },
      { id: "e2", title: "  ", amount: 10 },
    ],
    agencyCommission: true,
    stayTotal: 1000,
    currency: "EUR",
    pricesVisible: true,
  });
  assert.deepEqual(
    lines.map((line) => line.title),
    [AGENCY_FEE_LABEL, "Pourboire"]
  );
  assert.equal(lines[0]?.amountLabel, formatMoney(agencyFeeFromGross(1000), "EUR"));
  assert.equal(lines[1]?.amountLabel, formatMoney(40, "EUR"));
  assert.equal(
    clientStayExpenseLines({
      expenses: [{ id: "e1", title: "Pourboire", amount: 40 }],
      agencyCommission: false,
      stayTotal: 1000,
      currency: "EUR",
      pricesVisible: false,
    })[0]?.amountLabel,
    HIDDEN_PRICE_LABEL
  );
  assert.equal(
    clientStayExpenseLines({
      expenses: [],
      agencyCommission: false,
      stayTotal: 1000,
      currency: "EUR",
      pricesVisible: true,
    }).length,
    0
  );
  const ticketing = clientStayExpenseLines({
    expenses: [],
    agencyCommission: false,
    stayTotal: 0,
    currency: "EUR",
    pricesVisible: true,
    ticketingFee: 25,
  });
  assert.equal(ticketing[0]?.title, TICKETING_FEE_LABEL);
  assert.equal(ticketing[0]?.amountLabel, formatMoney(25, "EUR"));
});
