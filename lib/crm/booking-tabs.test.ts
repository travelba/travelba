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
  assert.equal(bookingTabFromParam("pliant"), "cartes");
  assert.equal(bookingTabFromParam("transactions"), "argent");
  assert.equal(bookingTabFromParam("argent"), "argent");
  assert.equal(bookingTabFromParam("reglement"), "argent");
  assert.equal(bookingTabFromParam("whatsapp"), "whatsapp");
  assert.equal(bookingTabFromParam("Interface"), "interface");
  assert.equal(bookingTabFromParam("inconnu"), "voyage");
});

test("changer d’onglet garde les autres paramètres de l’URL, sauf ?hotel= qui a déjà servi", () => {
  assert.equal(bookingTabQuery("hotel=abc", "todo"), "tab=a-faire");
  assert.equal(bookingTabQuery("page=2&hotel=abc", "todo"), "page=2&tab=a-faire");
  assert.equal(bookingTabQuery("tab=argent", "voyage"), "tab=voyage");
  assert.equal(bookingTabQuery("", "argent"), "tab=reglement");
  assert.equal(bookingTabQuery("", "interface"), "tab=interface");
});

test("les flèches bouclent sur les onglets", () => {
  assert.equal(BOOKING_TAB_IDS[0], "client");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "client", "ArrowRight"), "whatsapp");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "voyage", "ArrowRight"), "todo");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "cartes", "ArrowRight"), "argent");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "client", "ArrowLeft"), "interface");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "interface", "ArrowRight"), "client");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "argent", "Home"), "client");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "argent", "End"), "interface");
  assert.equal(bookingStepAnchor("abc"), "step-abc");
});
