import assert from "node:assert/strict";
import test from "node:test";
import { dossierFlightStamp, localCivilStamp, timezoneForIata } from "@/lib/crm/airport-time";

test("le fuseau suit l’aéroport, pas une heure inventée", () => {
  assert.equal(timezoneForIata("cdg"), "Europe/Paris");
  assert.equal(timezoneForIata("HKT"), "Asia/Bangkok");
  assert.equal(timezoneForIata("BKK"), "Asia/Bangkok");
  assert.equal(timezoneForIata("LPA"), "Atlantic/Canary");
  assert.equal(timezoneForIata("FNC"), "Atlantic/Madeira");
  assert.equal(timezoneForIata("JFK"), "America/New_York");
  assert.equal(timezoneForIata("ABI"), null);
  assert.equal(timezoneForIata("XXX"), null);
  assert.equal(timezoneForIata(""), null);
});

test("l’heure locale garde ses chiffres et prend le décalage de l’aéroport", () => {
  assert.equal(localCivilStamp("2026-12-25T12:10:00", "Europe/Paris"), "2026-12-25T12:10:00+01:00");
  assert.equal(localCivilStamp("2026-07-15T12:10:00", "Europe/Paris"), "2026-07-15T12:10:00+02:00");
  assert.equal(localCivilStamp("2026-12-26T05:50:00", "Asia/Bangkok"), "2026-12-26T05:50:00+07:00");
  assert.equal(localCivilStamp("2027-01-08T11:55:00", "Asia/Bangkok"), "2027-01-08T11:55:00+07:00");
  assert.equal(localCivilStamp("2027-01-08T19:15:00", "Europe/Paris"), "2027-01-08T19:15:00+01:00");
  assert.equal(localCivilStamp("2026-12-25T12:10:00", "Asia/Kolkata"), "2026-12-25T12:10:00+05:30");
  assert.equal(localCivilStamp("2026-12-25T12:10:00", "America/New_York"), "2026-12-25T12:10:00-05:00");
  assert.equal(localCivilStamp("2026-07-15T12:10:00", "America/New_York"), "2026-07-15T12:10:00-04:00");
  assert.equal(localCivilStamp("2026-12-25T12:10:00", null), "2026-12-25T12:10:00");
  assert.match(localCivilStamp("2026-12-25T12:10:00", timezoneForIata("MTY")) || "", /T12:10:00[+-]/);
});

test("fiche_dossier lit l’heure locale même si la base a renvoyé +00", () => {
  assert.equal(dossierFlightStamp("2026-12-25 12:10:00+00", "CDG", null), "2026-12-25T12:10:00+01:00");
  assert.equal(dossierFlightStamp("2026-12-26 05:50:00+00", "HKT", null), "2026-12-26T05:50:00+07:00");
  assert.equal(dossierFlightStamp("2027-01-08 11:55:00+00", "HKT", null), "2027-01-08T11:55:00+07:00");
  assert.equal(dossierFlightStamp("2027-01-08 19:15:00+00", "CDG", null), "2027-01-08T19:15:00+01:00");
  assert.equal(
    dossierFlightStamp("2026-12-25T12:10:00+00:00", "CDG", "Asia/Bangkok"),
    "2026-12-25T12:10:00+07:00"
  );
  assert.equal(dossierFlightStamp("2026-12-25 12:10:00+00", "ABI", null), "2026-12-25T12:10:00");
  assert.equal(dossierFlightStamp(null, "CDG", null), null);
});
