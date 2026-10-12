import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRevolutExpense,
  bookingBelongsToCustomer,
  bookingsForExpenseMatch,
  filterBookingChoices,
  revolutBookingPickLabel,
  revolutExpenseError,
} from "./revolut-debit";

describe("revolut debit match", () => {
  it("accepte le voyageur et le compte qui règle", () => {
    const stay = { customer_id: "traveler", billing_customer_id: "payer" };
    assert.equal(bookingBelongsToCustomer(stay, "traveler"), true);
    assert.equal(bookingBelongsToCustomer(stay, "payer"), true);
    assert.equal(bookingBelongsToCustomer(stay, "other"), false);
    assert.equal(bookingBelongsToCustomer(stay, ""), false);
  });

  it("liste les dossiers du client, une fois, le plus récent d’abord", () => {
    const rows = [
      { id: "old", customer_id: "payer", billing_customer_id: "payer", start_date: "2026-01-02" },
      { id: "new", customer_id: "traveler", billing_customer_id: "payer", start_date: "2026-08-01" },
      { id: "new", customer_id: "traveler", billing_customer_id: "payer", start_date: "2026-08-01" },
      { id: "other", customer_id: "someone", billing_customer_id: "someone", start_date: "2026-09-01" },
      { id: "open", customer_id: "payer", billing_customer_id: null, start_date: null },
    ];
    assert.deepEqual(
      bookingsForExpenseMatch(rows, "payer").map((row) => row.id),
      ["new", "old", "open"]
    );
  });

  it("cherche un dossier sans se tromper d’accent", () => {
    const rows = [
      { reference: "TB-2026-0004", label: "TB-2026-0004 · Été à Rome" },
      { reference: "TB-2026-0009", label: "TB-2026-0009 · Milan" },
    ];
    assert.deepEqual(
      filterBookingChoices(rows, "ete rome").map((row) => row.reference),
      ["TB-2026-0004"]
    );
    assert.equal(filterBookingChoices(rows, "").length, 2);
  });

  it("nomme la réservation avec son état", () => {
    const label = revolutBookingPickLabel({
      reference: "TB-2026-0004",
      title: "Rome",
      start_date: "2026-08-01",
      visible_to_client: false,
      archived_at: null,
    });
    assert.match(label, /^TB-2026-0004 · Rome · /);
    assert.match(label, /En préparation$/);
  });

  it("rattache la sortie sans écrire au grand livre", async () => {
    const inserts: string[] = [];
    const updates: Record<string, unknown>[] = [];
    const admin = fake({
      customer: { id: "payer" },
      booking: {
        id: "stay",
        reference: "TB-2026-0012",
        title: "Rome",
        customer_id: "traveler",
        billing_customer_id: "payer",
      },
      onInsert(table) {
        inserts.push(table);
      },
      onUpdate(payload) {
        updates.push(payload);
      },
    });
    const result = await applyRevolutExpense(
      admin,
      { id: "out", direction: "debit", status: "unmatched" },
      "payer",
      "stay"
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.reference, "TB-2026-0012");
    assert.deepEqual(inserts, []);
    assert.equal(updates.length, 1);
    assert.equal(updates[0]?.status, "matched");
    assert.equal(updates[0]?.matched_customer_id, "payer");
    assert.equal(updates[0]?.matched_booking_id, "stay");
    assert.equal(updates[0]?.matched_transaction_id, null);
    assert.equal(typeof updates[0]?.settled_at, "string");
  });

  it("refuse un crédit, un autre client, un refus et un second clic", async () => {
    const admin = fake({
      customer: { id: "payer" },
      booking: {
        id: "stay",
        reference: "TB-2026-0012",
        customer_id: "traveler",
        billing_customer_id: "payer",
      },
    });
    const credit = await applyRevolutExpense(
      admin,
      { id: "in", direction: "credit", status: "unmatched" },
      "payer",
      "stay"
    );
    assert.equal(credit.ok, false);
    if (!credit.ok) assert.equal(credit.error, "not_a_debit");

    const missing = await applyRevolutExpense(
      fake({ customer: null, booking: null }),
      { id: "out", direction: "debit", status: "unmatched" },
      "other",
      "stay"
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.error, "customer_not_found");

    const wrong = await applyRevolutExpense(
      fake({
        customer: { id: "other" },
        booking: { id: "stay", reference: "TB-1", customer_id: "traveler", billing_customer_id: "payer" },
      }),
      { id: "out", direction: "debit", status: "unmatched" },
      "other",
      "stay"
    );
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.error, "booking_not_for_customer");
    assert.equal(revolutExpenseError("booking_not_for_customer"), "Cette réservation n’est pas à ce client.");

    const refused = await applyRevolutExpense(
      admin,
      { id: "out", direction: "debit", status: "ignored", settled_at: "2026-10-01T00:00:00.000Z" },
      "payer",
      "stay"
    );
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.error, "refused");

    const again = await applyRevolutExpense(
      admin,
      { id: "out", direction: "debit", status: "matched", matched_booking_id: "stay" },
      "payer",
      "stay"
    );
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.error, "already_matched");
  });
});

function fake(script: {
  customer: { id: string } | null;
  booking: Record<string, unknown> | null;
  onInsert?: (table: string) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
}) {
  return {
    from(table: string) {
      return {
        insert() {
          script.onInsert?.(table);
          throw new Error("écriture interdite");
        },
        select() {
          return this;
        },
        update(payload: Record<string, unknown>) {
          script.onUpdate?.(payload);
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        is() {
          return this;
        },
        maybeSingle: async () => {
          if (table === "crm_customers") return { data: script.customer, error: null };
          if (table === "crm_bookings") return { data: script.booking, error: null };
          if (table === "crm_revolut_transactions") return { data: { id: "out" }, error: null };
          return { data: null, error: null };
        },
      };
    },
  };
}
