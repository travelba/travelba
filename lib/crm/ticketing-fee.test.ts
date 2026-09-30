import assert from "node:assert/strict";
import test from "node:test";
import {
  feeSchedulePatch,
  initialFeeChoice,
  initialTicketingSelection,
  LODGING_FEE_EUR,
  resolvedFlatFeeAmount,
  resolvedTicketingAmount,
  TICKETING_FEE_EUR,
  ticketingFeeAmount,
  ticketingFeeExternalId,
  ticketingTicketCount,
  TRANSFER_FEE_EUR,
} from "./ticketing-fee";

test("aucun vol → 0 €", () => {
  assert.equal(ticketingFeeAmount({ hasFlight: false, travelerCount: 2 }), 0);
  assert.equal(ticketingTicketCount({ hasFlight: false, travelerCount: 2 }), 0);
});

test("2 voyageurs + 2 segments → 50 € (un billet par passager)", () => {
  assert.equal(TICKETING_FEE_EUR, 25);
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 2 }), 50);
  assert.equal(ticketingTicketCount({ hasFlight: true, travelerCount: 2 }), 2);
});

test("vol sans voyageur nommé → 1 billet", () => {
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 0 }), 25);
});

test("external_id stable par dossier", () => {
  assert.equal(ticketingFeeExternalId("abc"), "booking:abc:ticketing-fee");
});

test("mode null garde la billeterie automatique", () => {
  assert.equal(
    resolvedTicketingAmount({
      feeMode: null,
      qty: 0,
      hasFlight: true,
      travelerCount: 2,
      status: "confirmed",
    }),
    50
  );
  assert.equal(
    resolvedTicketingAmount({
      feeMode: null,
      qty: 4,
      hasFlight: false,
      travelerCount: 2,
      status: "confirmed",
    }),
    0
  );
  assert.equal(
    resolvedTicketingAmount({
      feeMode: null,
      qty: 0,
      hasFlight: true,
      travelerCount: 2,
      status: "draft",
    }),
    0
  );
});

test("10 % et à la carte ne postent pas les mêmes frais", () => {
  assert.equal(
    resolvedTicketingAmount({
      feeMode: "percent",
      qty: 3,
      hasFlight: true,
      travelerCount: 2,
      status: "confirmed",
    }),
    0
  );
  assert.equal(
    resolvedTicketingAmount({
      feeMode: "carte",
      qty: 3,
      hasFlight: false,
      travelerCount: 0,
      status: "confirmed",
    }),
    75
  );
  assert.equal(
    resolvedTicketingAmount({
      feeMode: "carte",
      qty: 3,
      hasFlight: true,
      travelerCount: 9,
      status: "quoted",
    }),
    0
  );
  assert.equal(
    resolvedFlatFeeAmount({
      feeMode: "carte",
      enabled: true,
      unit: TRANSFER_FEE_EUR,
      status: "travelling",
    }),
    15
  );
  assert.equal(
    resolvedFlatFeeAmount({
      feeMode: "percent",
      enabled: true,
      unit: LODGING_FEE_EUR,
      status: "confirmed",
    }),
    0
  );
  assert.equal(
    resolvedFlatFeeAmount({
      feeMode: null,
      enabled: true,
      unit: TRANSFER_FEE_EUR,
      status: "confirmed",
    }),
    0
  );
});

test("le choix ouvre sur 10 % si la commission existe déjà", () => {
  assert.equal(initialFeeChoice({ feeMode: null, agencyCommission: true }), "percent");
  assert.equal(initialFeeChoice({ feeMode: null, agencyCommission: false }), "carte");
  assert.equal(initialFeeChoice({ feeMode: "carte", agencyCommission: true }), "carte");
  assert.deepEqual(
    initialTicketingSelection({
      feeMode: null,
      agencyCommission: true,
      storedQty: 0,
      hasFlight: true,
      travelerCount: 2,
    }),
    { on: false, qty: 2 }
  );
  assert.equal(
    initialTicketingSelection({
      feeMode: null,
      agencyCommission: false,
      storedQty: 0,
      hasFlight: true,
      travelerCount: 0,
    }).on,
    true
  );
  assert.deepEqual(
    feeSchedulePatch({
      mode: "percent",
      ticketingOn: true,
      ticketingQty: 4,
      transferOn: true,
      lodgingOn: true,
    }),
    {
      fee_mode: "percent",
      agency_commission: true,
      ticketing_fee_qty: 0,
      transfer_fee: false,
      lodging_fee: false,
    }
  );
  assert.equal(
    feeSchedulePatch({
      mode: "carte",
      ticketingOn: true,
      ticketingQty: 4,
      transferOn: true,
      lodgingOn: false,
    }).ticketing_fee_qty,
    4
  );
  assert.equal(
    feeSchedulePatch({
      mode: "carte",
      ticketingOn: false,
      ticketingQty: 4,
      transferOn: false,
      lodgingOn: true,
    }).agency_commission,
    false
  );
});
