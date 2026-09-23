import assert from "node:assert/strict";
import test from "node:test";
import { buildBookingIcs } from "./calendar-ics";
import type { CrmBookingItem } from "./types";

function item(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id" | "kind" | "title">): CrmBookingItem {
  return {
    booking_id: "b",
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    amount: null,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const booking = {
  id: "booking-1",
  reference: "TB-2026-0001",
  title: "Marrakech",
  destination: "Marrakech",
  start_date: "2026-08-12",
  end_date: "2026-08-15",
};

test("flight keeps the printed clock without a timezone shift", () => {
  const ics = buildBookingIcs(booking, [
    item({
      id: "flight-1",
      kind: "flight",
      title: "Paris → Marrakech",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T09:40:00+00:00",
      end_at: "2026-08-12T11:15:00+00:00",
      details: { from: "CDG", to: "RAK" },
    }),
  ]);
  assert.match(ics, /DTSTART:20260812T094000/);
  assert.match(ics, /DTEND:20260812T111500/);
  assert.doesNotMatch(ics, /DTSTART:[^\r\n]*Z/);
  assert.match(ics, /SUMMARY:Vol · Paris → Marrakech/);
  assert.match(ics, /LOCATION:CDG → RAK/);
  assert.match(ics, /\r\n/);
});

test("hotel midnight stays an all-day event through checkout", () => {
  const ics = buildBookingIcs(booking, [
    item({
      id: "hotel-1",
      kind: "hotel",
      title: "Andaz",
      start_at: "2026-08-12T00:00:00+00:00",
      end_at: "2026-08-15",
      details: { city: "Marrakech" },
    }),
  ]);
  assert.match(ics, /DTSTART;VALUE=DATE:20260812/);
  assert.match(ics, /DTEND;VALUE=DATE:20260815/);
  assert.match(ics, /LOCATION:Marrakech/);
});

test("escapes commas so iPhone Calendar can parse the file", () => {
  const ics = buildBookingIcs(
    { ...booking, destination: "Paris, France" },
    []
  );
  assert.match(ics, /X-WR-CALNAME:TB-2026-0001 — Paris\\, France/);
  assert.match(ics, /DTSTART;VALUE=DATE:20260812/);
});
