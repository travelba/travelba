import assert from "node:assert/strict";
import test from "node:test";
import { addIsoDays, formatDateFr, formatDateTimeFr } from "./dates";
import { formatDateFr as fromMoney, formatDateTimeFr as fromMoneyTime } from "./money";

test("addIsoDays décale en jours calendaires, en UTC, sans dépendre du fuseau", () => {
  assert.equal(addIsoDays("2026-11-08", 3), "2026-11-11");
  assert.equal(addIsoDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addIsoDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addIsoDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addIsoDays("2028-03-01", -1), "2028-02-29");
  assert.equal(addIsoDays("2026-03-29", 1), "2026-03-30"); // passage à l'heure d'été en Europe
  assert.equal(addIsoDays("2026-10-25", 1), "2026-10-26"); // retour à l'heure d'hiver
  assert.equal(addIsoDays("2026-11-08", 0), "2026-11-08");
});

test("addIsoDays ignore l’heure d’un horodatage", () => {
  assert.equal(addIsoDays("2026-11-08T23:30:00.000Z", 1), "2026-11-09");
  assert.equal(addIsoDays("2026-11-08T00:15:00+02:00", 1), "2026-11-09");
});

test("formatDateFr lit une date seule à midi, sans décalage de jour", () => {
  assert.equal(formatDateFr("2026-11-08"), "8 nov. 2026");
  assert.equal(formatDateFr(null), "—");
  assert.equal(formatDateFr(""), "—");
  assert.equal(formatDateFr("pas une date"), "pas une date");
});

test("formatDateTimeFr garde l’heure de Paris et retombe sur la date seule", () => {
  assert.equal(formatDateTimeFr("2026-11-08"), "8 nov. 2026");
  assert.match(formatDateTimeFr("2026-10-06T09:19:00.000Z"), /11:19/);
  assert.match(formatDateTimeFr("2026-11-08T14:30:00.000Z"), /^8 nov\. 2026\D+15:30$/);
  assert.equal(formatDateTimeFr(null), "");
  assert.equal(formatDateTimeFr("pas une date"), "pas une date");
});

test("money ré-exporte les formatteurs de dates sans les dupliquer", () => {
  assert.equal(fromMoney, formatDateFr);
  assert.equal(fromMoneyTime, formatDateTimeFr);
});
