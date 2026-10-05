import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SORT_ORDER, parseSortOrder } from "./bookings";
import { parseItemDetails } from "./ingest-types";

test("les détails d’une carte gardent leurs clés, les champs connus sont typés", () => {
  const flight = { airline: "Air France", from: "CDG", to: "FCO", ticket_count: 2, client_hidden: true, pnr: null };
  const ok = parseItemDetails(flight);
  assert.ok("details" in ok);
  assert.deepEqual(ok.details, flight);
  assert.deepEqual(parseItemDetails(undefined), { details: {} });
  assert.deepEqual(parseItemDetails(null), { details: {} });
  assert.deepEqual(parseItemDetails(""), { details: {} });
  assert.deepEqual(parseItemDetails({}), { details: {} });
});

test("un détail mal typé ou un non-objet est refusé", () => {
  assert.deepEqual(parseItemDetails({ airline: 12 }), { error: "Détails de carte invalides (airline)." });
  assert.deepEqual(parseItemDetails({ ticket_count: "deux" }), { error: "Détails de carte invalides (ticket_count)." });
  assert.deepEqual(parseItemDetails({ included: "petit-déjeuner" }), { error: "Détails de carte invalides (included)." });
  assert.deepEqual(parseItemDetails({ hotel_contacts: [{ email: 5 }] }), {
    error: "Détails de carte invalides (hotel_contacts.0.email).",
  });
  assert.deepEqual(parseItemDetails(["x"]), { error: "Détails de carte invalides." });
  assert.deepEqual(parseItemDetails("texte"), { error: "Détails de carte invalides." });
  assert.deepEqual(parseItemDetails(42), { error: "Détails de carte invalides." });
});

test("l’ordre d’une carte est un entier entre 0 et 10000", () => {
  assert.equal(MAX_SORT_ORDER, 10000);
  assert.equal(parseSortOrder(0), 0);
  assert.equal(parseSortOrder(10000), 10000);
  assert.equal(parseSortOrder("12"), 12);
  assert.equal(parseSortOrder(" 3 "), 3);
  assert.equal(parseSortOrder(-1), null);
  assert.equal(parseSortOrder(10001), null);
  assert.equal(parseSortOrder(1.5), null);
  assert.equal(parseSortOrder("abc"), null);
  assert.equal(parseSortOrder(""), null);
  assert.equal(parseSortOrder(null), null);
  assert.equal(parseSortOrder(Number.POSITIVE_INFINITY), null);
});
