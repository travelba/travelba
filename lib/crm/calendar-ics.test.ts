import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBookingIcs,
  calendarClickPlan,
  calendarOpenTarget,
  calendarResponsePlan,
  chosenCalendarHref,
  googleCalendarHref,
  icsHttpHeaders,
  isAppleMobileBrowser,
  calendarItemIdFromSegment,
  itemCalendarHref,
  showGoogleCalendarFallback,
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

test("vol horodaté : heure locale de l’aéroport, pas une heure flottante", () => {
  const event = veventFromItem(item({}), booking());
  assert.match(event || "", /DTSTART;TZID=Europe\/Paris:20260812T094500/);
  assert.match(event || "", /DTEND;TZID=Africa\/Casablanca:20260812T111000/);
  assert.match(event || "", /LOCATION:CDG/);
  assert.match(event || "", /UID:i1@travelba\.fr/);
  assert.equal((event || "").includes("T000000"), false);
  assert.equal(/\bDTSTART:\d{8}T/.test(event || ""), false);
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
  assert.match(event || "", /LOCATION:Nantipa\\, Santa Teresa/);
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
    disposition: "inline",
  });
  assert.equal(
    chosenCalendarHref("/agenda/i1.ics", { google: "https://calendar.google.com/x" }, iphone),
    "/agenda/i1.ics"
  );
  assert.equal(itemCalendarHref("/mon-compte/reservations/TBA-1/agenda.ics", "abc"), "/mon-compte/reservations/TBA-1/agenda/abc.ics");
  assert.equal(calendarItemIdFromSegment("abc.ics"), "abc");
  assert.equal(calendarItemIdFromSegment("exemple-vol-aller.ics"), "exemple-vol-aller");
  assert.equal(calendarItemIdFromSegment("pas-un-fichier"), null);
  assert.equal(
    icsHttpHeaders("a.ics", { disposition: "inline" })["Content-Disposition"],
    'inline; filename="a.ics"'
  );
  assert.equal(icsHttpHeaders("a.ics")["Content-Type"], "text/calendar; charset=utf-8");
  assert.equal(
    calendarResponsePlan({ ua: mac, googleHref: null }).kind === "file" &&
      calendarResponsePlan({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", googleHref: null }).kind === "file",
    true
  );
});

test("Google Agenda : heure de vol en UTC, journée d’hôtel", () => {
  const flight = googleCalendarHref(item({}), booking());
  assert.match(flight || "", /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(flight || "", /dates=20260812T074500Z%2F20260812T101000Z/);
  assert.match(flight || "", /ctz=Europe%2FParis/);
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

function unfold(ics: string) {
  return ics.replace(/\r\n[ \t]/g, "");
}

test("vol CDG → NCE : fuseau de l’aéroport, UID stable, lieu", () => {
  const flight = item({
    id: "e3d36ceb-90bd-46f1-bc09-af2c895baf40",
    title: "Paris → Nice",
    confirmation_ref: "YO448B",
    start_at: "2026-11-11T13:50:00",
    end_at: "2026-11-11T15:25:00",
    details: {
      from: "CDG",
      to: "NCE",
      city_from: "Paris",
      city_to: "Nice",
      departure_timezone: "Europe/Paris",
      arrival_timezone: "Europe/Paris",
    },
  });
  const stay = booking({ reference: "TB-2026-0075", title: "Anantara Plaza Nice Hotel", destination: "Nice" });
  const first = buildBookingIcs({ booking: stay, items: [flight], itemId: flight.id });
  const second = buildBookingIcs({ booking: stay, items: [flight], itemId: flight.id });
  const flat = unfold(first);
  assert.match(flat, /UID:e3d36ceb-90bd-46f1-bc09-af2c895baf40@travelba\.fr/);
  assert.match(second, /UID:e3d36ceb-90bd-46f1-bc09-af2c895baf40@travelba\.fr/);
  assert.match(flat, /DTSTART;TZID=Europe\/Paris:20261111T135000/);
  assert.match(flat, /DTEND;TZID=Europe\/Paris:20261111T152500/);
  assert.match(flat, /BEGIN:VTIMEZONE[\s\S]*TZID:Europe\/Paris[\s\S]*TZOFFSETTO:\+0100/);
  assert.match(flat, /LOCATION:Paris \(CDG\)/);
  assert.match(flat, /DESCRIPTION:Anantara Plaza Nice Hotel\\nTB-2026-0075\\nParis → Nice\\nRéf\. YO448B/);
  assert.equal(flat.includes("\\\\n"), false);
  assert.equal(/\bDTSTART:\d{8}T\d{6}Z/.test(flat), false);
  assert.equal(first.replace(/\r\n/g, "").includes("\n"), false);
  assert.match(flat, /DTSTAMP:\d{8}T\d{6}Z/);
});

test("le fuseau enregistré gagne, les chiffres de l’heure restent", () => {
  const event = veventFromItem(
    item({
      start_at: "2026-11-11T13:50:00",
      end_at: "2026-11-11T15:25:00",
      details: { from: "CDG", to: "NCE", departure_timezone: "Asia/Bangkok", arrival_timezone: "Asia/Bangkok" },
    }),
    booking()
  );
  assert.match(event || "", /DTSTART;TZID=Asia\/Bangkok:20261111T135000/);
  assert.match(event || "", /DTEND;TZID=Asia\/Bangkok:20261111T152500/);
});

test("aéroport inconnu : pas de fuseau inventé", () => {
  const event = veventFromItem(
    item({
      start_at: "2026-11-11T13:50:00",
      end_at: "2026-11-11T15:25:00",
      details: { from: "ABI", to: "XXX" },
    }),
    booking()
  );
  assert.match(event || "", /DTSTART:20261111T135000/);
  assert.equal((event || "").includes("TZID"), false);
});

test("échappement RFC 5545 : une seule passe, puis repli des lignes longues", () => {
  const title = `A, B; C\\D\nE ${"É".repeat(80)}`;
  const ics = buildBookingIcs({
    booking: booking({ title, reference: "TB-1" }),
    items: [item({ confirmation_ref: null, details: { from: "CDG", to: "NCE", city_from: "Paris" } })],
    itemId: "i1",
  });
  for (const line of ics.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, line);
  }
  const flat = unfold(ics);
  assert.match(flat, /DESCRIPTION:A\\, B\\; C\\\\D\\nE /);
  assert.ok(flat.includes("É".repeat(80)));
  const description = flat.match(/DESCRIPTION:(.*)/)?.[1] || "";
  assert.equal(description.includes("\n"), false);
  assert.equal(description.split("\\n").length > 1, true);
});

test("transfert horodaté et activité sans fuseau", () => {
  const transfer = veventFromItem(
    item({
      id: "t1",
      kind: "transfer",
      title: "Chauffeur",
      start_at: "2026-11-11T16:00:00",
      end_at: "2026-11-11T17:00:00",
      details: { pickup: "NCE", timezone: "Europe/Paris" },
    }),
    booking()
  );
  assert.match(transfer || "", /DTSTART;TZID=Europe\/Paris:20261111T160000/);
  assert.match(transfer || "", /DTEND;TZID=Europe\/Paris:20261111T170000/);
  assert.match(transfer || "", /LOCATION:NCE/);
  const activity = veventFromItem(
    item({
      id: "a1",
      kind: "activity",
      title: "Visite",
      start_at: "2026-11-12T10:00:00",
      details: { location: "Vieux Nice" },
    }),
    booking()
  );
  assert.match(activity || "", /DTSTART:20261112T100000/);
  assert.match(activity || "", /LOCATION:Vieux Nice/);
  assert.equal((activity || "").includes("TZID"), false);
  assert.equal((activity || "").includes("VALUE=DATE"), false);
});

test("écran d’accueil iOS : le .ics s’ouvre hors de l’app, sans webcal", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel)";
  const href = "/mon-compte/reservations/TB-2026-0075/agenda/e3.ics";
  const google = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  assert.deepEqual(calendarClickPlan({ href, googleHref: google, ua: iphone, navigatorStandalone: true }), {
    action: "external",
    url: href,
  });
  assert.deepEqual(calendarClickPlan({ href, googleHref: google, ua: iphone, displayModeStandalone: true }), {
    action: "external",
    url: href,
  });
  assert.deepEqual(calendarClickPlan({ href, googleHref: google, ua: iphone }), {
    action: "navigate",
    url: href,
  });
  assert.deepEqual(calendarClickPlan({ href, googleHref: google, ua: android, displayModeStandalone: true }), {
    action: "google",
    url: google,
  });
  assert.equal(showGoogleCalendarFallback({ href, googleHref: google, ua: iphone }), true);
  assert.equal(showGoogleCalendarFallback({ href, googleHref: google, ua: android }), false);
  assert.equal(JSON.stringify(calendarClickPlan({ href, ua: iphone, navigatorStandalone: true })).includes("webcal"), false);
  assert.equal(
    calendarClickPlan({
      href,
      ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
      navigatorStandalone: true,
    }).action,
    "external"
  );
  const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
  assert.deepEqual(calendarResponsePlan({ ua: safari, googleHref: google }), { kind: "file", disposition: "inline" });
  assert.deepEqual(calendarResponsePlan({ ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0", googleHref: null }), {
    kind: "file",
    disposition: "attachment",
  });
});
