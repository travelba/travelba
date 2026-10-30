import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_TAB_IDS,
  BOOKING_TAB_LABELS,
  bookingStepAnchor,
  bookingTabFromParam,
  bookingTabHref,
  bookingTabQuery,
  nextBookingTab,
} from "./booking-tabs";

test("la fiche dossier a cinq onglets : Voyage, Client, À faire, Argent, Historique", () => {
  assert.deepEqual([...BOOKING_TAB_IDS], ["voyage", "client", "todo", "argent", "historique"]);
  assert.deepEqual(
    BOOKING_TAB_IDS.map((id) => BOOKING_TAB_LABELS[id]),
    ["Voyage", "Client", "À faire", "Argent", "Historique"]
  );
  assert.equal(bookingTabFromParam("historique"), "historique");
});

test("l’onglet se lit dans l’URL et retombe sur Voyage", () => {
  assert.equal(bookingTabFromParam(null), "voyage");
  assert.equal(bookingTabFromParam(""), "voyage");
  assert.equal(bookingTabFromParam("a-faire"), "todo");
  assert.equal(bookingTabFromParam("todo"), "todo");
  assert.equal(bookingTabFromParam("client"), "client");
  assert.equal(bookingTabFromParam("argent"), "argent");
  assert.equal(bookingTabFromParam("inconnu"), "voyage");
});

test("les anciens onglets restent des alias", () => {
  assert.equal(bookingTabFromParam("whatsapp"), "client");
  assert.equal(bookingTabFromParam("Interface"), "voyage");
  assert.equal(bookingTabFromParam("carte"), "argent");
  assert.equal(bookingTabFromParam("cartes"), "argent");
  assert.equal(bookingTabFromParam("pliant"), "argent");
  assert.equal(bookingTabFromParam("reglement"), "argent");
  assert.equal(bookingTabFromParam("transactions"), "argent");
  assert.equal(bookingTabFromParam("restaurants"), "voyage");
});

test("changer d’onglet garde les autres paramètres de l’URL, sauf ?hotel= qui a déjà servi", () => {
  assert.equal(bookingTabQuery("hotel=abc", "todo"), "tab=a-faire");
  assert.equal(bookingTabQuery("page=2&hotel=abc", "todo"), "page=2&tab=a-faire");
  assert.equal(bookingTabQuery("hotel=abc&relance=def", "voyage"), "tab=voyage");
  assert.equal(bookingTabQuery("hotel=abc&repondre=def", "voyage"), "tab=voyage");
  assert.equal(bookingTabQuery("tab=argent", "voyage"), "tab=voyage");
  assert.equal(bookingTabQuery("", "argent"), "tab=argent");
  assert.equal(bookingTabHref("abc", "argent"), "/admin/reservations/abc?tab=argent");
});

test("les flèches bouclent sur les onglets", () => {
  assert.equal(BOOKING_TAB_IDS[0], "voyage");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "voyage", "ArrowRight"), "client");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "client", "ArrowRight"), "todo");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "todo", "ArrowRight"), "argent");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "voyage", "ArrowLeft"), "historique");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "argent", "ArrowRight"), "historique");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "historique", "ArrowRight"), "voyage");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "todo", "Home"), "voyage");
  assert.equal(nextBookingTab(BOOKING_TAB_IDS, "client", "End"), "historique");
  assert.equal(bookingStepAnchor("abc"), "step-abc");
});
