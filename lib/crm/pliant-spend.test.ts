import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingCardCeilingCents,
  bookingPliantCardSpec,
  formatPliantAmount,
  linkPliantSpend,
  pliantSpendFromApi,
} from "./pliant-spend";

const base = {
  firstName: "Camille",
  lastName: "Martin",
  bookingReference: "TB-1042",
  ceilingCents: 150_000,
  today: "2026-09-29",
  endDate: "2026-11-08",
  organizationId: "org",
};

test("la carte reprend le prénom, le nom et le plafond saisi", () => {
  const spec = bookingPliantCardSpec(base);
  assert.equal(spec?.holderFirstName, "Camille");
  assert.equal(spec?.holderLastName, "Martin");
  assert.equal(spec?.body.customFirstName, "Camille");
  assert.equal(spec?.body.customLastName, "Martin");
  assert.equal(spec?.body.limit.value, 150_000);
  assert.equal(spec?.body.transactionLimit.value, 150_000);
  assert.match(spec?.label || "", /Camille Martin/);
  assert.match(spec?.label || "", /TB-1042/);
  assert.equal(spec?.validTo, "2026-11-22");
});

test("sans prénom, la carte n’est pas préparée", () => {
  assert.equal(bookingPliantCardSpec({ ...base, firstName: "  " }), null);
});

test("le plafond reste entre 1 € et 100 000 €", () => {
  assert.equal(bookingCardCeilingCents(0.5), null);
  assert.equal(bookingCardCeilingCents(100_001), null);
  assert.equal(bookingCardCeilingCents(1_500.5), 150_050);
});

test("un achat reste positif, un remboursement devient un avoir", () => {
  const purchase = pliantSpendFromApi({
    transactionId: "t1",
    cardId: "c1",
    type: "PURCHASE",
    status: "BOOKED",
    billingAmount: { value: 4200, currency: "EUR" },
    createdAt: "2026-09-01T10:00:00Z",
    merchantData: { displayName: "Hôtel du Port" },
  });
  assert.equal(purchase?.amountCents, 4200);
  assert.equal(purchase?.merchant, "Hôtel du Port");
  const refund = pliantSpendFromApi({
    transactionId: "t2",
    cardId: "c1",
    type: "REFUND",
    status: "BOOKED",
    billingAmount: { value: 4200, currency: "EUR" },
  });
  assert.equal(refund?.amountCents, -4200);
  assert.equal(
    pliantSpendFromApi({
      transactionId: "t3",
      cardId: "c1",
      type: "STATUS_INQUIRY",
      billingAmount: { value: 1, currency: "EUR" },
    }),
    null
  );
});

test("le nom marchand brut sert si Pliant ne connaît pas l’enseigne", () => {
  const row = pliantSpendFromApi({
    transactionId: "t",
    cardId: "c1",
    type: "PURCHASE",
    billingAmount: { value: 100, currency: "EUR" },
    merchantRawData: { merchantLegalName: "ACME TRAVEL" },
  });
  assert.equal(row?.merchant, "ACME TRAVEL");
});

test("la dépense se rattache au dossier de la carte", () => {
  const draft = pliantSpendFromApi({
    transactionId: "t1",
    cardId: "c1",
    type: "PURCHASE",
    billingAmount: { value: 100, currency: "EUR" },
  });
  assert.ok(draft);
  const linked = linkPliantSpend(draft, new Map([["c1", { bookingId: "b1", customerId: "u1" }]]));
  assert.equal(linked.booking_id, "b1");
  assert.equal(linked.customer_id, "u1");
});

test("l’affichage distingue la sortie et le remboursement", () => {
  assert.match(formatPliantAmount(150_000), /−/);
  assert.match(formatPliantAmount(-1_500), /^\+/);
});
