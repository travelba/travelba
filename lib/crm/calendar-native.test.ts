import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BoardingPass } from "@/components/account/BoardingPass";
import { calendarHttpResponse } from "./calendar-http";
import { bookingCalendarEvents, chosenCalendarHref, googleCalendarHref, itemCalendarHref } from "./calendar-ics";
import {
  calendarActivation,
  nativeCalendarFeedback,
  nativeCalendarSurface,
  parseNativeCalendarEvents,
} from "./calendar-native";
import { calendarClickPlan } from "./calendar-open";
import type { LiveFlight } from "./next-flight-live";
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
    cover_credit: null,
    notes_client: null,
    notes_internal: null,
    visible_to_client: true,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function item(partial: Partial<CrmBookingItem> = {}): CrmBookingItem {
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

const href = "/mon-compte/reservations/TB-2026-0075/agenda.ics";
const google = "https://calendar.google.com/calendar/render?action=TEMPLATE";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel)";

test("application iOS : le bouton ne charge pas le .ics", () => {
  assert.deepEqual(
    calendarActivation({
      nativeIos: true,
      href,
      googleHref: google,
      ua: iphone,
      navigatorStandalone: true,
      displayModeStandalone: true,
    }),
    { kind: "native", href }
  );
  const home = calendarClickPlan({ href, googleHref: google, ua: iphone, navigatorStandalone: true });
  assert.deepEqual(calendarActivation({ nativeIos: false, href, googleHref: google, ua: iphone, navigatorStandalone: true }), home);
  assert.equal(home.action === "navigate" && home.forceDownload, true);
  assert.deepEqual(calendarActivation({ nativeIos: false, href, googleHref: google, ua: android }), {
    action: "google",
    url: google,
  });
});

test("vol, hôtel et séjour : les heures du .ics, sans échappement", () => {
  const flight = bookingCalendarEvents({ booking: booking(), items: [item()], itemId: "i1" });
  assert.equal(flight.length, 1);
  assert.equal(flight[0]?.allDay, false);
  assert.equal(flight[0]?.start, "2026-08-12T09:45:00");
  assert.equal(flight[0]?.end, "2026-08-12T11:10:00");
  assert.equal(flight[0]?.timeZone, "Europe/Paris");
  assert.equal(flight[0]?.endTimeZone, "Africa/Casablanca");
  assert.equal(flight[0]?.title, "Vol CDG → RAK");
  assert.equal(flight[0]?.uid, "i1@travelba.fr");
  assert.equal(flight[0]?.location, "CDG");
  assert.match(flight[0]?.notes || "", /TBA-1001/);
  assert.deepEqual(parseNativeCalendarEvents({ events: flight }), flight);

  const hotel = bookingCalendarEvents({
    booking: booking(),
    items: [
      item({
        id: "h1",
        kind: "hotel",
        title: "Santa Teresa",
        start_at: "2026-08-12",
        end_at: "2026-08-15",
        details: { hotel_name: "Nantipa", city: "Santa Teresa" },
      }),
    ],
    itemId: "h1",
  });
  assert.equal(hotel[0]?.allDay, true);
  assert.equal(hotel[0]?.startDate, "2026-08-12");
  assert.equal(hotel[0]?.endDate, "2026-08-15");
  assert.equal(hotel[0]?.start, "");
  assert.equal(hotel[0]?.location, "Nantipa, Santa Teresa");

  const stay = bookingCalendarEvents({
    booking: booking(),
    items: [
      item(),
      item({ id: "fee", kind: "fee", title: "Frais", start_at: "2026-08-12" }),
      item({ id: "tip", kind: "expense", title: "Pourboire", start_at: "2026-08-13", amount: 40 }),
    ],
  });
  assert.equal(stay.length, 2);
  assert.equal(stay[0]?.title, "Séjour · Marrakech");
  assert.equal(stay[0]?.uid, "stay-b1@travelba.fr");
  assert.equal(stay[0]?.startDate, "2026-08-12");
  assert.equal(stay[0]?.endDate, "2026-08-16");
  assert.equal(stay[1]?.uid, "i1@travelba.fr");
});

test("accueil aller-retour : un événement par passage", () => {
  const events = bookingCalendarEvents({
    booking: booking(),
    items: [
      item({
        id: "vip",
        kind: "accueil_vip",
        title: "Accueil",
        start_at: "2026-08-12T11:10:00",
        end_at: null,
        details: {
          legs: [
            {
              role: "arrival",
              flight_id: "f1",
              airport_iata: "RAK",
              airport_city: "Marrakech",
              at: "2026-08-12T11:10:00",
              flight_number: "AT123",
              timezone: "Africa/Casablanca",
            },
            {
              role: "departure",
              flight_id: "f2",
              airport_iata: "CDG",
              airport_city: "Paris",
              at: "2026-08-15T18:00:00",
              flight_number: "AT456",
              timezone: "Europe/Paris",
            },
          ],
        },
      }),
    ],
    itemId: "vip",
  });
  assert.equal(events.length, 2);
  assert.equal(events[0]?.start, "2026-08-12T11:10:00");
  assert.equal(events[0]?.end, "2026-08-12T12:10:00");
  assert.equal(events[0]?.timeZone, "Africa/Casablanca");
  assert.equal(events[0]?.uid, "vip-arrival@travelba.fr");
  assert.equal(events[1]?.start, "2026-08-15T18:00:00");
  assert.equal(events[1]?.end, "2026-08-15T19:00:00");
  assert.equal(events[1]?.timeZone, "Europe/Paris");
  assert.equal(events[1]?.location, "Paris (CDG)");
});

test("accueil : Ajouter au calendrier du prochain vol ouvre la feuille, pour ce vol seul", async () => {
  const flightId = "af650-cdg-cun";
  const stay = booking({ reference: "TB-2026-1201", start_date: "2026-12-15", end_date: "2026-12-20", title: "Mayakoba", destination: "Mayakoba" });
  const flight = item({
    id: flightId,
    title: "Paris → Cancún",
    confirmation_ref: "AF650",
    start_at: "2026-12-15T13:10:00",
    end_at: "2026-12-15T18:25:00",
    details: { from: "CDG", to: "CUN", airline: "Air France", flight_number: "AF650" },
  });
  const hotel = item({
    id: "hotel-maya",
    kind: "hotel",
    title: "Mayakoba",
    start_at: "2026-12-15",
    end_at: "2026-12-20",
    details: { hotel_name: "Mayakoba", city: "Mayakoba" },
  });
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor TBA-iOS";
  const single = itemCalendarHref(`/mon-compte/reservations/${stay.reference}/agenda.ics`, flightId);
  assert.equal(single, `/mon-compte/reservations/${stay.reference}/agenda/${flightId}.ics`);
  const google = googleCalendarHref(flight, stay);
  const href = chosenCalendarHref(single, { google }, ua);
  assert.equal(href, single);

  const now = Date.parse("2026-11-23T15:45:00Z");
  const live: LiveFlight = {
    airline: "AIR FRANCE",
    number: "AF650",
    origin: "CDG",
    destination: "CUN",
    departure: { scheduled: "13:10", revised: "" },
    arrival: { scheduled: "18:25", revised: "" },
    departureAt: Date.parse("2026-12-15T12:10:00Z"),
    arrivalAt: Date.parse("2026-12-15T23:25:00Z"),
    status: "",
    place: "Terminal 2E",
    arrivalPlace: "",
    arrivalPrevue: "18:25",
    landedClock: "",
  };
  const html = renderToStaticMarkup(
    createElement(BoardingPass, { live, nowMs: now, calendarHref: href, googleHref: google })
  );
  assert.match(html, /Décollage dans/);
  assert.match(html, /Ajouter au calendrier/);
  assert.match(html, new RegExp(`href="${single}"`));
  assert.equal(html.includes("calendar.google.com"), false);
  assert.equal(html.includes(`/agenda.ics"`), false);

  const plan = calendarActivation({ nativeIos: true, href, googleHref: google, ua });
  assert.deepEqual(plan, { kind: "native", href: single });
  const response = calendarHttpResponse({
    request: new Request(`https://travelba.fr${single}`, { headers: { "user-agent": ua, accept: "application/json" } }),
    booking: stay,
    items: [flight, hotel],
    itemId: flightId,
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { events: { title: string; start: string; end: string; timeZone: string; endTimeZone: string }[] };
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0]?.title, "Vol CDG → CUN");
  assert.equal(body.events[0]?.start, "2026-12-15T13:10:00");
  assert.equal(body.events[0]?.end, "2026-12-15T18:25:00");
  assert.equal(body.events[0]?.timeZone, "Europe/Paris");
  assert.equal(body.events[0]?.endTimeZone, "America/Cancun");
  assert.equal(nativeCalendarSurface(body.events.length), "sheet");
  assert.equal(nativeCalendarSurface(bookingCalendarEvents({ booking: stay, items: [flight, hotel] }).length), "batch");

  const swift = readFileSync(new URL("../../mobile/ios/App/App/CalendarBridge.swift", import.meta.url), "utf8");
  const sheetAt = swift.indexOf("EKEventEditViewController");
  const batchAt = swift.indexOf("for draft in drafts");
  assert.equal(sheetAt > 0 && batchAt > sheetAt, true);
  assert.match(swift, /drafts\.count == 1/);
});

test("une ligne illisible est écartée, le message reste en français", () => {
  const kept = parseNativeCalendarEvents({
    events: [
      { uid: "ok", title: "Vol", allDay: false, start: "2026-08-12T09:45:00", timeZone: "Europe/Paris" },
      { uid: "bad\n", title: "Vol", allDay: false, start: "2026-08-12T09:45:00" },
      { uid: "day", title: "Hôtel", allDay: true, startDate: "2026-08-15", endDate: "2026-08-12" },
      { title: "Sans identifiant", allDay: false, start: "2026-08-12T09:45:00" },
    ],
  });
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.uid, "ok");
  assert.equal(kept[0]?.endTimeZone, "Europe/Paris");
  assert.deepEqual(nativeCalendarFeedback({ cancelled: true }), null);
  assert.deepEqual(nativeCalendarFeedback({ reason: "busy" }), null);
  assert.deepEqual(nativeCalendarFeedback({ ok: false, reason: "refused" }), {
    text: "L’accès au calendrier est refusé.",
    settings: true,
  });
  assert.equal(nativeCalendarFeedback({ ok: true, added: 1 })?.text, "Ajouté à votre calendrier.");
  assert.equal(nativeCalendarFeedback({ ok: true, added: 3 })?.text, "3 événements ajoutés à votre calendrier.");
  assert.equal(nativeCalendarFeedback({ ok: true, already: 2 })?.text, "Déjà dans votre calendrier.");
  assert.equal(nativeCalendarFeedback({ reason: "empty" })?.text, "Aucune date à ajouter à l’agenda.");
  assert.equal(nativeCalendarFeedback({ reason: "unavailable" })?.settings, false);
  assert.equal(nativeCalendarFeedback(null)?.text, "Impossible d’ajouter au calendrier.");
});
