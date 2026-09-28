import assert from "node:assert/strict";
import test from "node:test";
import {
  expiryMatchesIssue,
  frenchExpiry,
  reconcilePassportDates,
  visualDatesFromOcr,
} from "./passport-dates";

test("French adult expiry is the day before the 10th anniversary", () => {
  assert.equal(frenchExpiry("2018-03-12", 10), "2028-03-11");
  assert.equal(expiryMatchesIssue("2018-03-12", "2028-03-11"), true);
  assert.equal(expiryMatchesIssue("2018-03-12", "2028-03-12"), true);
});

test("a délivrance parked in expires_on is restored when the MRZ expiry is known", () => {
  const dates = reconcilePassportDates({
    issued: "2007-06-02",
    expires: "2014-06-02",
    mrzExpires: "2024-06-01",
    extra: ["2014-06-02", "2024-06-01"],
  });
  assert.equal(dates.issued_on, "2014-06-02");
  assert.equal(dates.expires_on, "2024-06-01");
});

test("visual dates alone recover a swapped French pair", () => {
  const dates = reconcilePassportDates({
    issued: "2024-06-01",
    expires: "2014-06-02",
  });
  assert.equal(dates.issued_on, "2014-06-02");
  assert.equal(dates.expires_on, "2024-06-01");
});

test("an already correct pair stays put", () => {
  const dates = reconcilePassportDates({
    issued: "2018-03-12",
    expires: "2028-03-12",
  });
  assert.equal(dates.issued_on, "2018-03-12");
  assert.equal(dates.expires_on, "2028-03-12");
});

test("OCR keeps printed DDMMYYYY dates and ignores MRZ YYMMDD", () => {
  const dates = visualDatesFromOcr(
    "11031998\n01092014\n31082024\n26HD141484FRA9803112M2408315<<<<<<<<<<<<<<02"
  );
  assert.deepEqual(dates, ["1998-03-11", "2014-09-01", "2024-08-31"]);
});

test("another traveller's dates in the same scan do not replace a coherent pair", () => {
  const dates = reconcilePassportDates({
    issued: "2018-03-12",
    expires: "2028-03-11",
    extra: ["2020-01-15", "2030-01-14"],
  });
  assert.equal(dates.issued_on, "2018-03-12");
  assert.equal(dates.expires_on, "2028-03-11");
});

test("does not invent an issue date that was not read", () => {
  const dates = reconcilePassportDates({
    issued: "2007-06-02",
    expires: null,
    mrzExpires: "2024-06-01",
  });
  assert.equal(dates.expires_on, "2024-06-01");
  assert.equal(dates.issued_on, "2007-06-02");
});
