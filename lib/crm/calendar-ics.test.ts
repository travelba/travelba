import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBookingIcs,
  calendarOpenTarget,
  calendarResponsePlan,
  chosenCalendarHref,
  googleCalendarHref,
  icsHttpHeaders,
  isAppleMobileBrowser,
  calendarItemIdFromSegment,
  itemCalendarHref,
  veventFromItem,
  veventFromStay,
} from "./calendar-ics";
import type { CrmBooking, CrmBookingItem } from "./types";

function booking(partial: Partial<CrmBooking> = {}): CrmBooking {
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
    notes_client: null,
    notes_internal: null,
    visible_to_client: true,
    created_at: "",
    updated_at: "",
    ...partial,
    cover_credit: partial.cover_credit ?? null,
  };
}

function item(partial: Partial<CrmBookingItem>): CrmBookingItem {
  return {
    id: "i1",
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
    ...partial,
  };
}

test("vol horodaté : DTSTART avec heure, pas minuit", () => {
  const event = veventFromItem(item({}), booking());
  assert.match(event || "", /DTSTART:20260812T094500/);
  assert.match(event || "", /DTEND:20260812T111000/);
  assert.equal((event || "").includes("T000000"), false);
});

test("hôtel : journée entière check-in → checkout exclusif, sans heure", () => {
  const event = veventFromItem(
    item({
      id: "h1",
      kind: "hotel",
      title: "Santa Teresa",
      start_at: "2026-08-12",
      end_at: "2026-08-15",
      details: { hotel_name: "Nantipa", city: "Santa Teresa" },
    }),
    booking()
  );
  assert.match(event || "", /DTSTART;VALUE=DATE:20260812/);
  assert.match(event || "", /DTEND;VALUE=DATE:20260815/);
  assert.match(event || "", /SUMMARY:Hôtel · Nantipa/);
  assert.equal((event || "").includes("T00"), false);
});

test("minuit n’invente pas d’horaire", () => {
  const event = veventFromItem(
    item({
      start_at: "2026-08-12T00:00:00",
      end_at: "2026-08-12T00:00:00",
    }),
    booking()
  );
  assert.match(event || "", /DTSTART;VALUE=DATE:20260812/);
});

test("séjour entier : dates dossier + événements", () => {
  const stay = veventFromStay(booking());
  assert.match(stay || "", /DTSTART;VALUE=DATE:20260812/);
  assert.match(stay || "", /DTEND;VALUE=DATE:20260816/);
  const ics = buildBookingIcs({
    booking: booking(),
    items: [
      item({}),
      item({ id: "i2", kind: "fee", title: "Frais", start_at: "2026-08-12" }),
      item({ id: "i3", kind: "expense", title: "Pourboire", start_at: "2026-08-13", amount: 40 }),
    ],
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.equal(ics.endsWith("\r\n"), true);
  assert.equal(ics.includes("X-WR-CALNAME"), false);
  assert.equal(ics.includes("webcal"), false);
});

test("une carte : un seul événement, le vol", () => {
  const ics = buildBookingIcs({ booking: booking(), items: [item({})], itemId: "i1" });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /SUMMARY:Vol CDG → RAK/);
  assert.equal(ics.includes("X-PUBLISHED-TTL"), false);
});

test("iPhone reçoit l’événement, Android ouvre Google Agenda", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
  assert.equal(isAppleMobileBrowser(iphone), true);
  assert.equal(calendarOpenTarget({ ua: iphone, googleHref: "https://calendar.google.com/x" }), null);
  assert.equal(calendarOpenTarget({ ua: android, googleHref: "https://calendar.google.com/x" }), "https://calendar.google.com/x");
  assert.equal(calendarOpenTarget({ ua: mac, googleHref: "https://calendar.google.com/x" }), null);
  assert.deepEqual(calendarResponsePlan({ ua: iphone, googleHref: "https://calendar.google.com/x" }), {
    kind: "file",
    handoff: true,
  });
  assert.equal(
    chosenCalendarHref("/agenda/i1.ics", { google: "https://calendar.google.com/x" }, iphone),
    "/agenda/i1.ics"
  );
  assert.equal(itemCalendarHref("/mon-compte/reservations/TBA-1/agenda.ics", "abc"), "/mon-compte/reservations/TBA-1/agenda/abc.ics");
  assert.equal(calendarItemIdFromSegment("abc.ics"), "abc");
  assert.equal(calendarItemIdFromSegment("exemple-vol-aller.ics"), "exemple-vol-aller");
  assert.equal(calendarItemIdFromSegment("pas-un-fichier"), null);
  assert.equal(icsHttpHeaders("a.ics", { handoff: true })["Content-Disposition"], undefined);
  assert.match(icsHttpHeaders("a.ics")["Content-Disposition"] || "", /inline/);
});

test("Google Agenda : heure de vol, journée d’hôtel", () => {
  const flight = googleCalendarHref(item({}), booking());
  assert.match(flight || "", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(flight || "", /dates=20260812T094500%2F20260812T111000/);
  const hotel = googleCalendarHref(
    item({
      id: "h1",
      kind: "hotel",
      title: "Santa Teresa",
      start_at: "2026-08-12",
      end_at: "2026-08-15",
      details: { hotel_name: "Nantipa", city: "Santa Teresa" },
    }),
    booking()
  );
  assert.match(hotel || "", /dates=20260812%2F20260815/);
});
