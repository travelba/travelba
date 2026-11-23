import assert from "node:assert/strict";
import test from "node:test";
import { bookingCalendarEvents } from "./calendar-ics";
import {
  calendarActivation,
  nativeCalendarFeedback,
  parseNativeCalendarEvents,
} from "./calendar-native";
import { calendarClickPlan } from "./calendar-open";
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
