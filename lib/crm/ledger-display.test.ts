import assert from "node:assert/strict";
import test from "node:test";
import {
  coversStayRollup,
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
