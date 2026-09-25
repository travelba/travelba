import assert from "node:assert/strict";
import test from "node:test";
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
  assert.equal(view.movements[0].companyLabel, null);
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
