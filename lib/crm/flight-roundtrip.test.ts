import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flightLegLine, roundTripMate, roundTripPairs, roundTripPriceLabel, roundTripReturnIds } from "./flight-roundtrip";
import type { CrmBookingItem } from "./types";

function flight(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id" | "title">): CrmBookingItem {
  return {
    booking_id: "b1",
    kind: "flight",
    supplier: "Arkia",
    confirmation_ref: "14028540",
    start_at: null,
    end_at: null,
    amount: 5357.57,
    include_in_ledger: true,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    lifecycle: "active",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const outbound = flight({
  id: "out",
  title: "Tel Aviv → Paris",
  start_at: "2026-11-02T08:00:00",
  details: {
    pnr: "14028540",
    airline: "Arkia",
    flight_number: "IZ611",
    from: "TLV",
    to: "CDG",
    city_from: "Tel Aviv",
    city_to: "Paris",
    amount_is_total: true,
  },
});

const inbound = flight({
  id: "back",
  title: "Paris → Tel Aviv",
  start_at: "2026-11-09T14:00:00",
  amount: 5357.57,
  details: {
    pnr: "14028540",
    airline: "Arkia",
    flight_number: "IZ612",
    from: "CDG",
    to: "TLV",
    city_from: "Paris",
    city_to: "Tel Aviv",
    amount_is_total: true,
  },
});

describe("un aller-retour, une carte", () => {
  it("IZ611 et IZ612 au PNR 14028540 forment une paire", () => {
    const pairs = roundTripPairs([inbound, outbound]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].outbound.id, "out");
    assert.equal(pairs[0].inbound.id, "back");
    assert.equal(roundTripMate(outbound, [outbound, inbound])?.id, "back");
    assert.equal(roundTripMate(inbound, [outbound, inbound]), null);
    assert.deepEqual([...roundTripReturnIds([outbound, inbound])], ["back"]);
  });

  it("deux PNR, ou le même trajet, restent deux cartes", () => {
    const other = flight({
      id: "other",
      title: "Paris → Athènes",
      confirmation_ref: "ZZZZZ1",
      start_at: "2026-12-01T10:00:00",
      details: { pnr: "ZZZZZ1", from: "CDG", to: "ATH", flight_number: "IZ100" },
    });
    const sameWay = flight({
      id: "same",
      title: "Tel Aviv → Paris",
      start_at: "2026-11-03T08:00:00",
      details: { pnr: "14028540", from: "TLV", to: "CDG", flight_number: "IZ613" },
    });
    assert.equal(roundTripPairs([outbound, other]).length, 0);
    assert.equal(roundTripPairs([outbound, sameWay]).length, 0);
  });

  it("le prix identique s’affiche une fois", () => {
    const label = roundTripPriceLabel(outbound, inbound, [outbound, inbound], "EUR");
    assert.match(label || "", /5[\s\u202f]?357,57/);
    assert.equal((label || "").split("357").length - 1, 1);
  });

  it("deux prix différents s’additionnent à l’écran, les lignes restent", () => {
    const cheap = { ...inbound, amount: 100, details: { ...inbound.details, amount_is_total: true } };
    const label = roundTripPriceLabel(outbound, cheap, [outbound, cheap], "EUR");
    assert.match(label || "", /5[\s\u202f]?457,57/);
    assert.equal(outbound.amount, 5357.57);
    assert.equal(cheap.amount, 100);
  });

  it("la ligne du retour nomme le vol", () => {
    assert.match(flightLegLine(inbound), /IZ612/);
    assert.match(flightLegLine(inbound), /Paris → Tel Aviv/);
  });
});
