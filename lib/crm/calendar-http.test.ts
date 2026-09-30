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
  return new Request("https://travelba.fr/mon-compte/reservations/TBA-1001/agenda.ics", {
    headers: { "user-agent": ua, "x-forwarded-host": "travelba.fr", "x-forwarded-proto": "https" },
  });
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel)";

test("iPhone : redirection webcal, sans fichier à télécharger", async () => {
  const previous = process.env.CALENDAR_FEED_SECRET;
  process.env.CALENDAR_FEED_SECRET = "secret-de-test";
  try {
    const response = calendarHttpResponse({
      request: request(IPHONE),
      booking: booking(),
      items: [flight()],
      itemId: flight().id,
      allowPhoneFeed: true,
    });
    assert.equal(response.status, 302);
    const location = response.headers.get("location") || "";
    assert.equal(location.startsWith("webcal://travelba.fr/api/calendrier/TBA-1001/"), true);
    assert.equal(location.endsWith(".ics"), true);
    assert.equal(response.headers.get("content-disposition"), null);
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_FEED_SECRET;
    else process.env.CALENDAR_FEED_SECRET = previous;
  }
});

test("Android : redirection vers Google Agenda", () => {
  const response = calendarHttpResponse({
    request: request(ANDROID),
    booking: booking(),
    items: [flight()],
    itemId: flight().id,
    allowPhoneFeed: false,
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") || "", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
});

test("iPhone sans secret : fichier calendrier, pas de bannière de téléchargement", () => {
  const previous = process.env.CALENDAR_FEED_SECRET;
  const cron = process.env.CRON_SECRET;
  const role = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.CALENDAR_FEED_SECRET;
  delete process.env.CRON_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const response = calendarHttpResponse({
      request: request(IPHONE),
      booking: booking(),
      items: [flight()],
      itemId: flight().id,
      allowPhoneFeed: true,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type")?.startsWith("text/calendar"), true);
    assert.equal(response.headers.get("content-disposition"), null);
  } finally {
    if (previous === undefined) delete process.env.CALENDAR_FEED_SECRET;
    else process.env.CALENDAR_FEED_SECRET = previous;
    if (cron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = cron;
    if (role === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = role;
  }
});
