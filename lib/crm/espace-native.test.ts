import assert from "node:assert/strict";
import test from "node:test";
import {
  espaceCalendarEvents,
  espaceLiveActivity,
  espaceOfflineKeys,
  espacePushPayload,
  espaceWalletPass,
  espaceWidgetSnapshot,
  isCacheableCarnet,
} from "./espace-native";
import type { CrmBooking, CrmBookingItem } from "./types";

const booking = {
  id: "b1",
  customer_id: "c1",
  reference: "TB-9",
  title: "Avoriaz",
  destination: "Avoriaz",
  start_date: "2099-01-10",
  end_date: "2099-01-17",
  status: "confirmed",
  visible_to_client: true,
} as CrmBooking;

const flight = {
  id: "f1",
  booking_id: "b1",
  kind: "flight",
  title: "CDG-GVA",
  start_at: "2099-01-10T07:15:00Z",
  visible_to_client: true,
  details: { from_iata: "CDG", to_iata: "GVA", airline: "AF", flight_number: "1042" },
  confirmation_ref: "AF1042",
  supplier: "Air France",
} as unknown as CrmBookingItem;

test("le calendrier pose le séjour en journée entière", () => {
  const events = espaceCalendarEvents(booking, [flight]);
  assert.equal(events[0]?.allDay, true);
  assert.match(events[0]?.title || "", /Avoriaz/);
  assert.equal(events[1]?.allDay, false);
  assert.match(events[1]?.title || "", /Vol/);
});

test("Wallet ne fabrique une carte que pour un vol publié", () => {
  const pass = espaceWalletPass(booking, flight);
  assert.equal(pass?.style, "boardingPass");
  assert.equal(pass?.logoText, "TBA");
  assert.equal(
    espaceWalletPass(booking, { ...flight, kind: "hotel", visible_to_client: true } as CrmBookingItem),
    null
  );
});

test("les push n’inventent pas d’horaire", () => {
  const push = espacePushPayload("carnet", { reference: "TB-9", place: "Avoriaz" });
  assert.equal(push.data.path, "/mon-compte/reservations/TB-9");
  assert.doesNotMatch(push.body, /\d{2}h\d{2}/);
});

test("le widget et Live Activity suivent le prochain vol", () => {
  const widget = espaceWidgetSnapshot({ firstName: "Ada", booking, items: [flight] });
  assert.equal(widget.path, "/mon-compte/reservations/TB-9");
  assert.ok(widget.flight);
  const live = espaceLiveActivity({ booking, items: [flight] });
  assert.equal(live?.kind, "flight");
  assert.equal(isCacheableCarnet(booking), true);
  assert.equal(espaceOfflineKeys("c1").home, "tb.espace.home.c1");
});
