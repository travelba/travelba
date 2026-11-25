import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planTicketOnExistingCard, TICKET_DUPLICATE_MESSAGE } from "./flight-ticket";
import { findFlightCard, mergeFlightPassengers } from "./item-match";

const outbound = {
  kind: "flight",
  confirmation_ref: "YZSXWY",
  start_at: "2027-04-04T08:20:00",
  title: "Paris → Nice",
  details: {
    flight_number: "AF7304",
    pnr: "YZSXWY",
    from: "CDG",
    to: "NCE",
    passengers: [
      { first_name: "Lea Nessim", last_name: "Martin" },
      { first_name: "Lea", last_name: "Martin" },
    ],
  },
};

const receipt = {
  kind: "flight",
  confirmation_ref: "ABC123",
  start_at: "2027-04-04T08:20:00",
  details: {
    flight_number: "AF 1001",
    pnr: "ABC123",
    seat: "12A",
    passengers: [{ first_name: "Lea", last_name: "Martin", ticket_number: "0572123456789", seat: "12A" }],
  },
};

describe("même vol, autre PNR", () => {
  it("retrouve la carte par numéro, jour et passager", () => {
    const hit = findFlightCard([outbound], { ...receipt, details: { ...receipt.details, flight_number: "AF 7304" } });
    assert.equal(hit?.confirmation_ref, "YZSXWY");
    const stranger = findFlightCard([outbound], {
      ...receipt,
      details: {
        ...receipt.details,
        flight_number: "AF 7304",
        passengers: [{ first_name: "Noa", last_name: "Durand" }],
      },
    });
    assert.equal(stranger, null);
  });

  it("ne crée pas une seconde carte et n’écrase pas le PNR", () => {
    const plan = planTicketOnExistingCard(outbound, {
      ...receipt,
      details: { ...receipt.details, flight_number: "AF 7304" },
    });
    assert.equal(plan.alert, true);
    assert.equal(plan.confirmationRef, "YZSXWY");
    assert.equal(plan.details.pnr, "YZSXWY");
    assert.equal(plan.details.ticket_numbers, undefined);
    assert.equal(plan.details.seat, undefined);
    assert.equal((plan.details.ticket_duplicate as { message?: string }).message, TICKET_DUPLICATE_MESSAGE);
    assert.match(String(plan.details.review_reason), /doublon de billets/);
    const names = (plan.details.passengers as { first_name: string }[]).map((row) => row.first_name);
    assert.deepEqual(names, ["Lea Nessim"]);
    assert.equal(JSON.stringify(plan.details).includes("birth"), false);
  });

  it("complète une carte sans PNR", () => {
    const empty = {
      ...outbound,
      confirmation_ref: null,
      details: { flight_number: "AF 7304", passengers: [{ first_name: "Lea Nessim", last_name: "Martin" }] },
    };
    const plan = planTicketOnExistingCard(empty, {
      ...receipt,
      details: { ...receipt.details, flight_number: "AF 7304" },
    });
    assert.equal(plan.alert, false);
    assert.equal(plan.confirmationRef, "ABC123");
    assert.equal(plan.details.pnr, "ABC123");
    assert.deepEqual(plan.details.ticket_numbers, ["0572123456789"]);
    assert.equal(plan.details.seat, "12A");
    const person = (plan.details.passengers as { first_name: string; ticket_number?: string; seat?: string }[])[0];
    assert.equal(person?.first_name, "Lea Nessim");
    assert.equal(person?.ticket_number, "0572123456789");
    assert.equal(person?.seat, "12A");
  });

  it("fusionne le prénom court sans raccourcir le nom complet", () => {
    const rows = mergeFlightPassengers(
      { passengers: [{ first_name: "Lea Nessim", last_name: "Martin" }] },
      { passengers: [{ first_name: "Lea", last_name: "Martin", ticket_number: "0572123456789" }] }
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.first_name, "Lea Nessim");
    assert.equal(rows[0]?.ticket_number, "0572123456789");
  });
});
