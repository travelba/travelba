import assert from "node:assert/strict";
import test from "node:test";
import { calendarCells, calendarMonthLabel, shiftMonth } from "./dates";

test("octobre 2026 commence un jeudi", () => {
  const cells = calendarCells(2026, 9);
  assert.equal(cells[0].iso, "2026-09-28");
  assert.equal(cells[0].outside, true);
  assert.equal(cells[3].iso, "2026-10-01");
  assert.equal(cells[3].outside, false);
  assert.equal(cells.find((cell) => cell.iso === "2026-10-29")?.day, 29);
  assert.equal(calendarMonthLabel(2026, 9), "Octobre 2026");
});

test("le mois suivant depuis décembre passe l’année", () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, monthIndex: 0 });
});
