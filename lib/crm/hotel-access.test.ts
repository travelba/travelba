import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  HOTEL_ACCESS_COPY,
  HOTEL_BUTTON_AUTHORIZED,
  HOTEL_BUTTON_EVERYONE,
  HOTEL_DEMO_CUSTOMER_ID,
  HOTEL_DEMO_EMAIL,
  HOTEL_MEMBERSHIP_LABEL,
  decideAccessRequest,
  decideButtonVisibility,
  decideHotelAccessToggle,
  decideRequestReview,
  hotelBookingEnabled,
  hotelDirectLive,
  showHotelButton,
  showPlatinumScreen,
} from "./hotel-access";

const root = join(import.meta.dirname, "../..");

test("l’accès est fermé par défaut et ne dépend plus d’une liste codée", () => {
  assert.equal(hotelBookingEnabled({}), false);
  assert.equal(hotelBookingEnabled({ hotel_booking_enabled: false }), false);
  assert.equal(hotelBookingEnabled({ hotel_booking_enabled: true }), true);
  assert.equal(showHotelButton({ enabled: false, visibility: HOTEL_BUTTON_AUTHORIZED }), false);
  assert.equal(showHotelButton({ enabled: true, visibility: HOTEL_BUTTON_AUTHORIZED }), true);
  assert.equal(showPlatinumScreen({ enabled: false, visibility: HOTEL_BUTTON_AUTHORIZED }), false);
  assert.equal(showHotelButton({ enabled: false, visibility: HOTEL_BUTTON_EVERYONE }), true);
  assert.equal(showPlatinumScreen({ enabled: false, visibility: HOTEL_BUTTON_EVERYONE }), true);
  assert.equal(showPlatinumScreen({ enabled: true, visibility: HOTEL_BUTTON_EVERYONE }), false);
});

test("le client ne s’ouvre pas l’accès, l’admin journalise l’interrupteur", () => {
  assert.equal(decideHotelAccessToggle({ actor: "client", enabled: true, demo: false, live: true }).ok, false);
  assert.equal(decideHotelAccessToggle({ actor: "agent", enabled: true, demo: false, live: false }).ok, false);
  const on = decideHotelAccessToggle({ actor: "admin", enabled: true, demo: false, live: false });
  assert.equal(on.ok && on.enabled, true);
  assert.equal(on.ok && on.live, false);
  const demo = decideHotelAccessToggle({ actor: "admin", enabled: true, demo: true, live: true });
  assert.equal(demo.ok && demo.live, false);
  const off = decideHotelAccessToggle({ actor: "admin", enabled: false, demo: false, live: true });
  assert.equal(off.ok && off.live, false);
});

test("une demande Platinum est unique, l’acceptation active, le refus non", () => {
  assert.equal(decideAccessRequest({ enabled: false, pending: false }).action, "created");
  assert.equal(decideAccessRequest({ enabled: false, pending: true }).action, "existing");
  assert.equal(decideAccessRequest({ enabled: true, pending: false }).action, "already");
  assert.equal(decideRequestReview({ actor: "client", decision: "accept", pending: true }).ok, false);
  const accepted = decideRequestReview({ actor: "admin", decision: "accept", pending: true });
  assert.equal(accepted.ok && accepted.enabled, true);
  const refused = decideRequestReview({ actor: "admin", decision: "refuse", pending: true });
  assert.equal(refused.ok && refused.enabled, false);
  assert.equal(decideRequestReview({ actor: "admin", decision: "accept", pending: false }).ok, false);
});

test("le réglage du bouton est réservé à l’admin et part sur les clients autorisés", () => {
  assert.equal(decideButtonVisibility({ actor: "agent", value: HOTEL_BUTTON_EVERYONE }).ok, false);
  assert.equal(decideButtonVisibility({ actor: "admin", value: "ouvert" }).ok, false);
  const set = decideButtonVisibility({ actor: "admin", value: HOTEL_BUTTON_AUTHORIZED });
  assert.equal(set.ok && set.value, HOTEL_BUTTON_AUTHORIZED);
  assert.equal(hotelDirectLive({ hotel_booking_enabled: true, hotel_demo: true, hotel_direct_live: true }), false);
  assert.equal(hotelDirectLive({ hotel_booking_enabled: true, hotel_direct_live: false }), false);
  assert.equal(hotelDirectLive({ hotel_booking_enabled: true, hotel_direct_live: true }), true);
});

test("le libellé Platinum n’est écrit qu’une fois, l’écran le reprend", () => {
  assert.equal(HOTEL_MEMBERSHIP_LABEL, "Platinum");
  assert.match(HOTEL_ACCESS_COPY.ask, /Platinum/);
  assert.equal(HOTEL_ACCESS_COPY.sent, "Demande envoyée, votre conseiller revient vers vous.");
  const ui = readFileSync(join(root, "components/account/HotelPlatinum.tsx"), "utf8");
  assert.match(ui, /HOTEL_MEMBERSHIP_LABEL/);
  assert.doesNotMatch(ui.replaceAll("HotelPlatinum", "").replaceAll("data-hotel-platinum", ""), /Platinum/);
  assert.match(ui, /data-hotel-platinum/);
  assert.match(ui, /data-hotel-access-sent/);
  const migration = readFileSync(join(root, "supabase/migrations/20261023143000_hotel_booking_access.sql"), "utf8");
  assert.match(migration, /hotel_booking_enabled boolean not null default false/);
  assert.match(migration, /hotel_button_visibility/);
  assert.match(migration, /authorized/);
  assert.match(migration, new RegExp(HOTEL_DEMO_CUSTOMER_ID));
  assert.match(migration, new RegExp(HOTEL_DEMO_EMAIL.replace(".", "\\.")));
  assert.match(migration, /07b9dde3-de59-4b1a-88b7-03a6e23e98a6/);
});
