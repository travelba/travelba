import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyCommissionAmount,
  agencyCommissionExternalId,
  bookingDebitIntent,
  bookingExpenseDebitExternalId,
  bookingItemDebitExternalId,
  bookingItemDebitLabel,
  bookingMetaPatch,
  bookingTotalFromItems,
  itemIncludedInLedger,
  itemSellingAmount,
  parseIncludeInLedger,
  stayIncludedInLedger,
} from "./bookings";
import { ticketingFeeAmount } from "./ticketing-fee";

test("debit insert only when confirmed with a positive amount", () => {
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 1200, hasOpenDebit: false }),
    "insert"
  );
  assert.equal(
    bookingDebitIntent({ status: "quoted", amount: 1200, hasOpenDebit: false }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 0, hasOpenDebit: false }),
    "noop"
  );
});

test("cancel clears charges even without an open debit", () => {
  assert.equal(
    bookingDebitIntent({ status: "cancelled", amount: 1200, hasOpenDebit: true }),
    "clear"
  );
  assert.equal(
    bookingDebitIntent({ status: "cancelled", amount: 0, hasOpenDebit: false }),
    "clear"
  );
});

test("existing debit is voided when the selling price drops to zero", () => {
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 0, hasOpenDebit: true }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({ status: "travelling", amount: 900, hasOpenDebit: true }),
    "update"
  );
});

test("booking debit is skipped when the stay is not included in the ledger", () => {
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1200,
      hasOpenDebit: false,
      includeInLedger: false,
    }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1200,
      hasOpenDebit: true,
      includeInLedger: false,
    }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1200,
      hasOpenDebit: false,
      includeInLedger: true,
    }),
    "insert"
  );
});

test("item debit posts only when flagged on a confirmed stay", () => {
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 800,
      hasOpenDebit: false,
      includeInLedger: true,
    }),
    "insert"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 800,
      hasOpenDebit: false,
      includeInLedger: false,
    }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({
      status: "quoted",
      amount: 800,
      hasOpenDebit: false,
      includeInLedger: true,
    }),
    "noop"
  );
  assert.equal(parseIncludeInLedger("on", false), true);
  assert.equal(parseIncludeInLedger(undefined, true), true);
  assert.equal(bookingItemDebitExternalId("b1", "i9"), "booking:b1:item:i9");
  assert.equal(bookingExpenseDebitExternalId("b1", "e1"), "booking:b1:expense:e1");
  assert.match(
    bookingItemDebitLabel({ kind: "expense", title: "Pourboire" }, "TB-1"),
    /Dépense · Pourboire/
  );
  assert.match(bookingItemDebitLabel({ kind: "hotel", title: "Nantipa" }, "TBA-1042"), /Hôtel/);
  assert.equal(
    bookingItemDebitLabel({ kind: "greeter", title: "Accueil VIP et Fastpass aller" }, "TB-1"),
    "VIP Airport · Accueil VIP et Fastpass aller — TB-1"
  );
  assert.equal(
    bookingItemDebitLabel({ kind: "greeter", title: "Greeter" }, "TB-1"),
    "VIP Airport · VIP Airport — TB-1"
  );
  assert.match(
    bookingItemDebitLabel(
      { kind: "hotel", title: "Aghouatim", details: { hotel_name: "The Ranch resort" } },
      "TB-2026-0017"
    ),
    /The Ranch resort/
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 273.86,
      hasOpenDebit: true,
      includeInLedger: true,
    }),
    "update"
  );
});

test("le titre du dossier est trimé et une date vide ne bloque pas l’enregistrement", () => {
  const patch = bookingMetaPatch({
    title: "  40 ans  ",
    destination: "Marrakech",
    start_date: "",
    end_date: "2026-10-11",
    include_in_ledger: "on",
    ignored: "nope",
  });
  assert.equal(patch.title, "40 ans");
  assert.equal(patch.start_date, null);
  assert.equal(patch.end_date, "2026-10-11");
  assert.equal(patch.include_in_ledger, true);
  assert.equal("ignored" in patch, false);
});

test("la devise du séjour reste EUR USD CHF ou GBP, même si le formulaire envoie autre chose", () => {
  assert.equal(bookingMetaPatch({ currency: "usd" }).currency, "USD");
  assert.equal(bookingMetaPatch({ currency: "£" }).currency, "GBP");
  assert.equal(bookingMetaPatch({ currency: "CHF" }).currency, "CHF");
  assert.equal(bookingMetaPatch({ currency: "JPY" }).currency, "EUR");
});

test("la commission est 10 % du séjour seulement quand le voyage l’active", () => {
  assert.equal(agencyCommissionExternalId("b1"), "booking:b1:agency-commission");
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "confirmed", totalAmount: 1000 }),
    100
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "travelling", totalAmount: 1700 }),
    170
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "completed", totalAmount: 80.5 }),
    8.05
  );
  assert.equal(
    agencyCommissionAmount({ enabled: false, status: "confirmed", totalAmount: 1000 }),
    0
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "draft", totalAmount: 1000 }),
    0
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "quoted", totalAmount: 1000 }),
    0
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "cancelled", totalAmount: 1000 }),
    0
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "completed", totalAmount: 0 }),
    0
  );
  assert.equal(bookingMetaPatch({ agency_commission: "on" }).agency_commission, true);
  assert.equal(bookingMetaPatch({ agency_commission: false }).agency_commission, false);
  assert.equal("agency_commission" in bookingMetaPatch({ title: "Ski" }), false);
  assert.equal(bookingMetaPatch({ fee_mode: "carte" }).fee_mode, "carte");
  assert.equal(bookingMetaPatch({ fee_mode: "percent" }).fee_mode, "percent");
  assert.equal("fee_mode" in bookingMetaPatch({ fee_mode: "autre" }), false);
  assert.equal(bookingMetaPatch({ ticketing_fee_qty: 3.8 }).ticketing_fee_qty, 3);
  assert.equal(bookingMetaPatch({ ticketing_fee_qty: -2 }).ticketing_fee_qty, 0);
  assert.equal(bookingMetaPatch({ transfer_fee: "on" }).transfer_fee, true);
  assert.equal(bookingMetaPatch({ lodging_fee: false }).lodging_fee, false);
  assert.equal(
    itemIncludedInLedger({ kind: "expense", include_in_ledger: true }, false, "percent"),
    false
  );
  assert.equal(
    itemIncludedInLedger({ kind: "expense", include_in_ledger: false }, false, "carte"),
    true
  );
  assert.equal(
    itemIncludedInLedger({ kind: "expense", include_in_ledger: false }, false, null),
    true
  );
});

test("quand le client règle le séjour, le montant et l’hôtel sortent du livre", () => {
  assert.equal(bookingMetaPatch({ client_settles_stay: "on" }).client_settles_stay, true);
  assert.equal(bookingMetaPatch({ client_settles_stay: false }).client_settles_stay, false);
  assert.equal("client_settles_stay" in bookingMetaPatch({ title: "Ski" }), false);

  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 1700,
      hasOpenDebit: true,
      includeInLedger: stayIncludedInLedger({
        include_in_ledger: true,
        client_settles_stay: true,
      }),
    }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 800,
      hasOpenDebit: true,
      includeInLedger: itemIncludedInLedger({ kind: "hotel", include_in_ledger: true }, true),
    }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 40,
      hasOpenDebit: true,
      includeInLedger: itemIncludedInLedger({ kind: "expense", include_in_ledger: false }, true),
    }),
    "update"
  );
  assert.equal(
    bookingDebitIntent({
      status: "confirmed",
      amount: 150,
      hasOpenDebit: false,
      includeInLedger: itemIncludedInLedger({ kind: "chauffeur", include_in_ledger: true }, true),
    }),
    "insert"
  );
  assert.equal(
    itemIncludedInLedger({ kind: "flight", include_in_ledger: true }, true),
    false
  );
  assert.equal(
    agencyCommissionAmount({ enabled: true, status: "confirmed", totalAmount: 1700 }),
    170
  );
  assert.equal(ticketingFeeAmount({ hasFlight: true, travelerCount: 2 }), 50);
  assert.equal(
    stayIncludedInLedger({ include_in_ledger: true, client_settles_stay: false }),
    true
  );
});

test("stay total is always the sum of card selling prices", () => {
  assert.equal(bookingTotalFromItems([]), 0);
  assert.equal(bookingTotalFromItems([{ amount: null }, { amount: 0 }]), 0);
  assert.equal(bookingTotalFromItems([{ amount: 858 }]), 858);
  assert.equal(
    bookingTotalFromItems([{ amount: 858.8 }, { amount: null }, { amount: 85 }]),
    943.8
  );
  assert.equal(bookingTotalFromItems([{ amount: 10.1 }, { amount: 20.25 }]), 30.35);
  assert.equal(
    itemSellingAmount({ kind: "flight", amount: 250, details: { ticket_count: 5 } }),
    1250
  );
  assert.equal(
    bookingTotalFromItems([
      { kind: "flight", amount: 250, details: { ticket_count: 5 } },
      { kind: "hotel", amount: 800 },
    ]),
    2050
  );
  assert.equal(
    bookingTotalFromItems([
      { kind: "hotel", amount: 800 },
      { kind: "chauffeur", amount: 150 },
      { kind: "greeter", amount: 100 },
      { kind: "visa", amount: 100 },
      { kind: "expense", amount: 40 },
      { kind: "checkin", amount: 20 },
    ]),
    800
  );
});
