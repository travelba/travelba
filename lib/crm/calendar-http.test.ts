import assert from "node:assert/strict";
import test from "node:test";
import { calendarHttpResponse } from "./calendar-http";
import type { CrmBooking, CrmBookingItem } from "./types";

function booking(): CrmBooking {
  return {
    id: "b1",
    customer_id: "c1",
    billing_customer_id: "c1",
    reference: "TBA-1001",
    title: "Marrakech",
    destination: "Marrakech",
    status: "confirmed",
    start_date: "2026-08-12",
    end_date: "2026-08-15",
    currency: "EUR",
    total_amount: 0,
    include_in_ledger: true,
    cover_image_path: null,
    cover_credit: null,
    notes_client: null,
    notes_internal: null,
    visible_to_client: true,
    created_at: "",
    updated_at: "",
  };
}

function flight(): CrmBookingItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    booking_id: "b1",
    kind: "flight",
    title: "Paris → Marrakech",
    supplier: null,
    confirmation_ref: "ABC123",
    start_at: "2026-08-12T09:45:00",
    end_at: "2026-08-12T11:10:00",
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: { from: "CDG", to: "RAK" },
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
}

function request(ua: string) {
  return new Request("https://travelba.fr/mon-compte/reservations/TBA-1001/agenda/vol.ics", {
    headers: { "user-agent": ua },
  });
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel)";

test("iPhone : un événement .ics, pas un flux", async () => {
  const response = calendarHttpResponse({
    request: request(IPHONE),
    booking: booking(),
    items: [flight()],
    itemId: flight().id,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type")?.startsWith("text/calendar"), true);
  assert.equal(response.headers.get("content-disposition"), null);
  assert.equal(response.headers.get("location"), null);
  const body = await response.text();
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal(body.includes("X-WR-CALNAME"), false);
  assert.equal(body.includes("X-PUBLISHED-TTL"), false);
  assert.match(body, /SUMMARY:Vol CDG → RAK/);
});

test("Android : Google Agenda crée l’événement", () => {
  const response = calendarHttpResponse({
    request: request(ANDROID),
    booking: booking(),
    items: [flight()],
    itemId: flight().id,
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
});
