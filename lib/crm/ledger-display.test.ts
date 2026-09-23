import assert from "node:assert/strict";
import test from "node:test";
import {
  isStayRollupDebit,
  ledgerMovementTitle,
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

test("le contexte nomme le séjour, pas la référence seule", () => {
  assert.equal(
    reservationContextLabel({ title: "Tel Aviv", reference: "TB-2026-0031" }),
    "Dans le cadre de Tel Aviv"
  );
  assert.equal(reservationContextLabel({ title: "  ", reference: "TB-1" }), "Dans le cadre de TB-1");
  assert.equal(reservationContextLabel(null), null);
});
