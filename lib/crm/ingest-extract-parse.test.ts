import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingExtractSchema } from "./ingest-types";

/** Sortie typique du LLM strict (nulls partout où la valeur est absente). */
const llmLikeExtract = {
  document_status: "confirmed",
  title: "Paris · Rome",
  destination: "Rome",
  start_date: "2026-06-01",
  end_date: "2026-06-10",
  currency: "EUR",
  total_amount: null,
  notes_client: null,
  customer_email: null,
  customer_first_name: null,
  customer_last_name: null,
  items: [
    {
      kind: "flight",
      title: "CDG-FCO",
      supplier: null,
      confirmation_ref: "ABCDEF",
      start_at: "2026-06-01T10:00:00",
      end_at: null,
      amount: null,
      details: {
        airline: "AF",
        flight_number: "AF123",
        pnr: null,
        from: "CDG",
        to: "FCO",
        city_from: "Paris",
        city_to: "Rome",
        cabin: null,
        baggage: null,
        terminal: null,
        seat: null,
        hotel_name: null,
        room: null,
        city: null,
        address: null,
        board: null,
        occupancy: null,
        guests: null,
        special_requests: null,
        included: [],
        rooms: [],
        pickup: null,
        dropoff: null,
        pickup_note: null,
        vehicle: null,
        driver: null,
        policy_number: null,
        meeting_point: null,
        duration: null,
        notes: null,
        source_file_name: "billet.pdf",
        needs_review: null,
      },
    },
  ],
  travelers: [{ first_name: "Jean", last_name: "Dupont" }],
};

describe("bookingExtractSchema accepte la sortie LLM", () => {
  it("passe avec needs_review null et champs null", () => {
    const parsed = bookingExtractSchema.safeParse(llmLikeExtract);
    if (!parsed.success) {
      console.error(JSON.stringify(parsed.error.issues, null, 2));
    }
    assert.equal(parsed.success, true);
  });
});
