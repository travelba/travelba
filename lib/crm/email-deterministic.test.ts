import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_CREATE_HOLDS, autoCreatePlan } from "./email-ingest-create";
import {
  OVERLAP_ADD_REASON,
  deterministicBookingId,
  decideEmailIngestAction,
  suggestBookingByClientEmail,
} from "./email-match";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";

const customers = [
  { id: "c1", first_name: "Léa", last_name: "Bernard", company_name: null, email: "lea@example.com" },
];

function extract(): BookingExtract {
  return {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    destination: "Florence",
    start_date: "2026-11-04",
    end_date: "2026-11-08",
    customer_email: "lea@example.com",
    customer_first_name: "Léa",
    customer_last_name: "Bernard",
    items: [
      {
        kind: "hotel",
        title: "Portrait Firenze",
        supplier: null,
        confirmation_ref: "HTL-9",
        start_at: "2026-11-04",
        end_at: "2026-11-08",
        amount: null,
        details: { city: "Florence" },
      },
    ],
  };
}

test("l’e-mail et des dates qui se croisent proposent d’ajouter, sans créer", () => {
  const suggestion = suggestBookingByClientEmail(extract(), [
    {
      id: "b-rome",
      customer_id: "c1",
      reference: "TB-1",
      title: "Rome",
      destination: "Rome",
      start_date: "2026-11-02",
      end_date: "2026-11-06",
      status: "confirmed",
    },
  ], customers);
  assert.equal(suggestion.candidates.length, 1);
  assert.equal(suggestion.candidates[0].reason, OVERLAP_ADD_REASON);
  assert.equal(suggestion.autoBookingId, null);
  const decision = decideEmailIngestAction({
    extract: extract(),
    suggestedCustomerId: "c1",
    suggestedBookingId: null,
    candidates: suggestion.candidates.map((row) => ({
      customer_id: row.customer_id || "c1",
      booking_id: row.booking_id,
      label: row.label,
      reason: row.reason,
      score: row.score,
    })),
  });
  const outcome = autoCreatePlan({ extract: extract(), decision, candidates: suggestion.candidates.map((row) => ({
    customer_id: row.customer_id || "c1",
    booking_id: row.booking_id,
    label: row.label,
    reason: row.reason,
    score: row.score,
  })) });
  assert.equal(outcome.plan, null);
  assert.equal(outcome.hold, "overlap");
  assert.equal(outcome.message, AUTO_CREATE_HOLDS.overlap);
});

test("la référence gagne, puis l’e-mail, puis le nom et l’hôtel, sinon un humain", () => {
  assert.deepEqual(
    deterministicBookingId([
      { booking_id: "b1", customer_id: "c1", label: "A", reason: "Référence fournisseur", score: 90 },
      { booking_id: "b2", customer_id: "c1", label: "B", reason: OVERLAP_ADD_REASON, score: 83 },
    ]),
    { tier: "reference", bookingId: "b1" }
  );
  assert.deepEqual(
    deterministicBookingId([
      { booking_id: "b1", customer_id: "c1", label: "A", reason: "Référence dossier", score: 100 },
      { booking_id: "b2", customer_id: "c1", label: "B", reason: "Référence fournisseur", score: 90 },
    ]),
    { tier: "reference", bookingId: null }
  );
  assert.deepEqual(
    deterministicBookingId([
      { booking_id: "b9", customer_id: "c1", label: "B", reason: OVERLAP_ADD_REASON, score: 83 },
    ]),
    { tier: "email_dates", bookingId: "b9" }
  );
  assert.deepEqual(
    deterministicBookingId([
      { booking_id: "b3", customer_id: "c1", label: "C", reason: "Hôtel, dates et voyageur", score: 91 },
    ]),
    { tier: "traveler_hotel_dates", bookingId: "b3" }
  );
  assert.equal(deterministicBookingId([]).tier, "human");
});
