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
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="travelba-TBA-1001-etape.ics"');
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("location"), null);
  const body = await response.text();
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal(body.includes("X-WR-CALNAME"), false);
  assert.equal(body.includes("X-PUBLISHED-TTL"), false);
  assert.match(body, /SUMMARY:Vol CDG → RAK/);
  assert.match(body, /DTSTART;TZID=Europe\/Paris:20260812T094500/);
  assert.equal(body.includes("webcal"), false);
});

test("bureau : le fichier se télécharge", async () => {
  const response = calendarHttpResponse({
    request: request("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"),
    booking: booking(),
    items: [flight()],
    itemId: flight().id,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="travelba-TBA-1001-etape.ics"'
  );
  const body = await response.text();
  assert.equal(body.endsWith("\r\n"), true);
  assert.match(body, /BEGIN:VTIMEZONE/);
});

test("iPhone écran d’accueil : le .ics part en téléchargement", async () => {
  const response = calendarHttpResponse({
    request: new Request("https://travelba.fr/mon-compte/reservations/TBA-1001/agenda/vol.ics", {
      headers: { "user-agent": IPHONE, cookie: "theme=light; tb_ics_dl=1" },
    }),
    booking: booking(),
    items: [flight()],
    itemId: flight().id,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/calendar; charset=utf-8");
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="travelba-TBA-1001-etape.ics"'
  );
  assert.match(response.headers.get("set-cookie") || "", /tb_ics_dl=;/);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
  const body = await response.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(body, /UID:11111111-1111-1111-1111-111111111111@travelba\.fr/);
  assert.match(body, /DTSTAMP:\d{8}T\d{6}Z/);
  assert.equal(body.endsWith("\r\n"), true);
  assert.equal(body.includes("\n") && body.replace(/\r\n/g, "").includes("\n"), false);
});

test("hôtel : journée entière, même en-têtes", async () => {
  const hotel: CrmBookingItem = {
    ...flight(),
    id: "22222222-2222-2222-2222-222222222222",
    kind: "hotel",
    title: "Anantara Plaza Nice Hotel",
    start_at: "2026-11-11",
    end_at: "2026-11-15",
    details: { hotel_name: "Anantara Plaza Nice Hotel", city: "Nice" },
  };
  const response = calendarHttpResponse({
    request: request(IPHONE),
    booking: booking(),
    items: [hotel],
    itemId: hotel.id,
  });
  assert.equal(response.headers.get("content-disposition"), 'inline; filename="travelba-TBA-1001-etape.ics"');
  const body = await response.text();
  assert.match(body, /DTSTART;VALUE=DATE:20261111/);
  assert.match(body, /DTEND;VALUE=DATE:20261115/);
  assert.equal((body.match(/BEGIN:VEVENT/g) || []).length, 1);
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
