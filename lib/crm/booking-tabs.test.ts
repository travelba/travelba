import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_TAB_IDS,
  bookingStepAnchor,
  bookingTabFromParam,
  bookingTabQuery,
  nextBookingTab,
} from "./booking-tabs";

test("l’onglet se lit dans l’URL et retombe sur Le voyage", () => {
  assert.equal(bookingTabFromParam(null), "voyage");
  assert.equal(bookingTabFromParam(""), "voyage");
  assert.equal(bookingTabFromParam("a-faire"), "todo");
  assert.equal(bookingTabFromParam("todo"), "todo");
  assert.equal(bookingTabFromParam("carte"), "cartes");
  assert.equal(bookingTabFromParam("Interface"), "interface");
  assert.equal(bookingTabFromParam("inconnu"), "voyage");
});

test("changer d’onglet garde les autres paramètres de l’URL", () => {
  assert.equal(bookingTabQuery("hotel=abc", "todo"), "hotel=abc&tab=a-faire");
  assert.equal(bookingTabQuery("tab=argent", "voyage"), "tab=voyage");
  assert.equal(bookingTabQuery("", "interface"), "tab=interface");
});

test("les flèches bouclent sur les onglets", () => {
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "voyage", "ArrowRight"), "cartes");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "voyage", "ArrowLeft"), "interface");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "interface", "ArrowRight"), "voyage");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "argent", "Home"), "voyage");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "argent", "End"), "interface");
  assert.equal(bookingStepAnchor("abc"), "step-abc");
});
