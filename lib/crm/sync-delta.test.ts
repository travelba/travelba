import assert from "node:assert/strict";
import test from "node:test";
import {
  leBookingNeedsWork,
  lePayloadMatches,
  mb3mBalanceUnchanged,
  mb3mPaymentUnchanged,
  mb3mPieceUnchanged,
  pliantRowsWithinSince,
  pliantStoredMatches,
  revolutStoredMatches,
  stripeStoredMatches,
  syncSinceIso,
  syncSinceUnix,
  twilioMessagesQuery,
  REVOLUT_FIRST_LOOKBACK_MS,
  REVOLUT_OVERLAP_MS,
  STRIPE_FIRST_LOOKBACK_MS,
} from "./sync-delta";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");

test("sans curseur, la fenêtre est le premier rattrapage", () => {
  const since = syncSinceIso({ cursor: null, now: NOW, overlapMs: REVOLUT_OVERLAP_MS, firstLookbackMs: REVOLUT_FIRST_LOOKBACK_MS });
  assert.equal(since, new Date(NOW - REVOLUT_FIRST_LOOKBACK_MS).toISOString());
});

test("avec curseur, la fenêtre recule du recouvrement, pas de 14 jours", () => {
  const cursor = "2026-11-03T11:00:00.000Z";
  const since = syncSinceIso({ cursor, now: NOW, overlapMs: REVOLUT_OVERLAP_MS, firstLookbackMs: REVOLUT_FIRST_LOOKBACK_MS });
  assert.equal(since, new Date(Date.parse(cursor) - REVOLUT_OVERLAP_MS).toISOString());
  const unix = syncSinceUnix({
    cursor,
    now: NOW,
    overlapMs: 6 * 24 * 60 * 60 * 1000,
    firstLookbackMs: STRIPE_FIRST_LOOKBACK_MS,
  });
  assert.equal(unix, Math.floor((Date.parse(cursor) - 6 * 24 * 60 * 60 * 1000) / 1000));
});

const revolutTx = {
  id: "tx-1",
  type: "topup",
  state: "completed",
  reference: "SEJOUR",
  created_at: "2026-11-01T10:00:00.000Z",
  legs: [
    {
      amount: 120.5,
      currency: "EUR",
      description: "Payment from Ada Martin",
      counterparty: { name: "Ada Martin", iban: "FR00" },
    },
  ],
};

test("un virement Revolut déjà identique n’est pas réécrit", () => {
  assert.equal(revolutStoredMatches(null, revolutTx), false);
  const draft = {
    amount: "120.50",
    currency: "EUR",
    direction: "credit",
    counterparty_name: "Ada Martin",
    counterparty_iban: "FR00",
    reference: "SEJOUR",
    booked_at: "2026-11-01T10:00:00+00:00",
    raw: { state: "completed", type: "topup" },
  };
  assert.equal(revolutStoredMatches(draft, revolutTx), true);
  assert.equal(revolutStoredMatches({ ...draft, amount: "10.00" }, revolutTx), false);
  assert.equal(revolutStoredMatches({ ...draft, raw: { state: "pending", type: "topup" } }, revolutTx), false);
});

test("un paiement Stripe identique au centime et au raw n’est pas réécrit", () => {
  const draft = {
    amount: 12.5,
    currency: "EUR",
    direction: "credit",
    payer_name: "Ada",
    payer_email: "ada@exemple.fr",
    reference: "Rome",
    method: "card",
    last4: "4242",
    booked_at: "2026-11-01T10:00:00.000Z",
    raw: { id: "pi_1", amount: 1250, metadata: { a: "1" } },
  };
  assert.equal(stripeStoredMatches({ ...draft, amount: "12.50", raw: { metadata: { a: "1" }, amount: 1250, id: "pi_1" } }, draft), true);
  assert.equal(stripeStoredMatches({ ...draft, raw: { id: "pi_1", amount: 1250, metadata: { a: "2" } } }, draft), false);
  assert.equal(stripeStoredMatches(null, draft), false);
});

test("Pliant s’arrête à la première ligne plus vieille que le curseur", () => {
  const since = Date.parse("2026-11-01T00:00:00.000Z");
  const page = pliantRowsWithinSince(
    [{ id: "new", createdAt: "2026-11-02T00:00:00.000Z" }, { id: "old", createdAt: "2026-10-01T00:00:00.000Z" }],
    since
  );
  assert.equal(page.done, true);
  assert.equal(page.kept.length, 1);
  assert.equal(pliantRowsWithinSince([{ createdAt: "2026-11-02T00:00:00.000Z" }], since).done, false);
});

test("une dépense Pliant inchangée, libellé de carte compris, n’est pas réécrite", () => {
  const next = {
    card_id: "card-1",
    status: "confirmed",
    type: "purchase",
    merchant: "Hotel",
    billing_cents: 1000,
    billing_currency: "EUR",
    transaction_cents: 1000,
    transaction_currency: "EUR",
    booked_at: "2026-11-01T10:00:00.000Z",
    category: "lodging",
    comment: null,
  };
  assert.equal(pliantStoredMatches({ ...next, billing_cents: "1000", card_label: "Hôtel" }, next), true);
  assert.equal(pliantStoredMatches({ ...next, status: "pending" }, next), false);
});

const leStay = {
  state: "confirmed",
  confirmation_number: "LE1",
  hotel_id: 12,
  hotel_name: "Mondrian",
  city: "Bordeaux",
  check_in: "2026-12-01",
  check_out: "2026-12-03",
  total_cost: "400",
  currency: "EUR",
  is_cancellable: true,
  cancellation_deadline: "2026-11-20",
  guest_names: ["Ada Martin"],
  cancellation_policies: [],
  room_types: ["Double"],
  benefits: ["Petit-déjeuner"],
};

test("Little Emperors ne relit pas un séjour déjà lié et identique", () => {
  assert.equal(leBookingNeedsWork(null, leStay), true);
  assert.equal(leBookingNeedsWork({ ...leStay, status: "unmatched" }, leStay), true);
  assert.equal(leBookingNeedsWork({ ...leStay, status: "linked" }, leStay), false);
  assert.equal(leBookingNeedsWork({ ...leStay, status: "linked", state: "confirmed" }, { ...leStay, state: "cancelled" }), true);
  assert.equal(
    lePayloadMatches(
      { ...leStay, status: "linked", crm_booking_id: "b1", benefits: ["Petit-déjeuner"] },
      { ...leStay, status: "linked", crm_booking_id: "b1", raw: { benefits: ["Petit-déjeuner"] }, candidates: [] }
    ),
    true
  );
});

test("MB3M ne réécrit ni le solde, ni la pièce, ni le règlement déjà en place", () => {
  assert.equal(mb3mBalanceUnchanged("10.00", 10), true);
  assert.equal(mb3mBalanceUnchanged("10.01", 10), false);
  assert.equal(
    mb3mPieceUnchanged(
      { folder_id: "f", amount: "20", lines: [{ label: "Vol" }], transaction_ids: ["b", "a"], document_id: null, printed_at: null },
      { folder_id: "f", amount: 20, lines: [{ label: "Vol" }], transaction_ids: ["a", "b"], document_id: null, printed_at: null }
    ),
    true
  );
  assert.equal(
    mb3mPaymentUnchanged(
      { booking_id: "b", mb3m_payment_number: "1", mb3m_invoice_number: "9", amount: "30", matched_amount: "30" },
      { booking_id: "b", mb3m_payment_number: "1", mb3m_invoice_number: "9", amount: 30, matched_amount: 30 }
    ),
    true
  );
});

test("Twilio ne relit que les messages depuis le jour du curseur", () => {
  const url = twilioMessagesQuery("ACtest", "whatsapp:+33601020304", "2026-11-01T15:00:00.000Z");
  assert.equal(url.searchParams.get("To"), "whatsapp:+33601020304");
  assert.equal(url.searchParams.get("PageSize"), "50");
  assert.match(url.search, /DateSent%3E%3D=2026-11-01/);
  assert.equal(twilioMessagesQuery("ACtest", "whatsapp:+33601020304", null).search.includes("DateSent"), false);
});
