import assert from "node:assert/strict";
import test from "node:test";
import { HOTEL_WAIT_LINES, hotelWaitLine } from "./hotel-wait";

test("l’attente hôtel tourne sur les mêmes phrases, sans sigle", () => {
  assert.equal(HOTEL_WAIT_LINES.length, 5);
  assert.equal(hotelWaitLine(0), "On s’occupe de vous.");
  assert.equal(hotelWaitLine(5), hotelWaitLine(0));
  assert.equal(hotelWaitLine(-1), HOTEL_WAIT_LINES[HOTEL_WAIT_LINES.length - 1]);
  const text = HOTEL_WAIT_LINES.join(" ");
  assert.doesNotMatch(text, /IATA|APST/i);
  assert.match(text, /client VIP/);
  assert.match(text, /meilleur tarif/);
});
