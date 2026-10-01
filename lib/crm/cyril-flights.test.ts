import assert from "node:assert/strict";
import test from "node:test";
import {
  CYRIL_OUTBOUND,
  CYRIL_RETURN,
  CYRIL_SHEET_HEADERS,
  buildCyrilSheetRow,
  cyrilFlightClock,
} from "./cyril-flights";

test("huit vols aller et huit vols retour", () => {
  assert.equal(CYRIL_OUTBOUND.length, 8);
  assert.equal(CYRIL_RETURN.length, 8);
  const ids = [...CYRIL_OUTBOUND, ...CYRIL_RETURN].map((flight) => flight.id);
  assert.equal(new Set(ids).size, 16);
  assert.equal(CYRIL_OUTBOUND.find((flight) => flight.id === "fr-3844")?.airport, "Beauvais");
  assert.equal(CYRIL_OUTBOUND.find((flight) => flight.id === "at-749")?.airline, "Royal Air Maroc");
  assert.equal(cyrilFlightClock("10:40"), "10h40");
  assert.equal(CYRIL_RETURN[0]?.number, "TO 3015");
  assert.equal(CYRIL_RETURN.at(-1)?.number, "AF 1877");
});

test("ligne du classeur", () => {
  const built = buildCyrilSheetRow(
    {
      lastName: "  Martin ",
      firstName: "Léa",
      phone: "+33612345678",
      companion: "Paul Martin",
      diet: "cachere",
      companionDiet: "vegetarien",
      outboundId: "to-3016",
      returnId: "af-1877",
    },
    new Date("2026-09-01T12:00:00Z")
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.row.length, CYRIL_SHEET_HEADERS.length);
  assert.equal(built.row[1], "Martin");
  assert.equal(built.row[2], "Léa");
  assert.equal(built.row[3], "+33612345678");
  assert.equal(built.row[4], "Paul Martin");
  assert.equal(built.row[5], "Cachère");
  assert.equal(built.row[6], "Végétarien");
  assert.deepEqual(built.row.slice(7, 12), ["Transavia", "TO 3016", "Orly", "10h40", "12h05"]);
  assert.deepEqual(built.row.slice(12), ["Air France", "AF 1877", "Roissy-CDG", "17h55", "23h20"]);
});

test("refus si vol ou téléphone hors liste", () => {
  const swapped = buildCyrilSheetRow({
    lastName: "Martin",
    firstName: "Léa",
    phone: "+33612345678",
    outboundId: "af-1877",
    returnId: "to-3016",
  });
  assert.equal(swapped.ok, false);
  const phone = buildCyrilSheetRow({
    lastName: "Martin",
    firstName: "Léa",
    phone: "123",
    outboundId: "to-3016",
    returnId: "to-3015",
  });
  assert.equal(phone.ok, false);
  if (!phone.ok) assert.match(phone.error, /téléphone/);
  const diet = buildCyrilSheetRow({
    lastName: "Martin",
    firstName: "Léa",
    phone: "+33612345678",
    companion: "Paul Martin",
    diet: "tout",
    outboundId: "to-3016",
    returnId: "to-3015",
  });
  assert.equal(diet.ok, false);
  if (!diet.ok) assert.match(diet.error, /accompagnateur/);
});
