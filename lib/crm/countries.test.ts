import assert from "node:assert/strict";
import test from "node:test";
import { resolveCountryCode, resolveNationality } from "./countries";

test("resolveNationality maps ISO2, ISO3 and country names", () => {
  assert.equal(resolveNationality("FR"), "FR");
  assert.equal(resolveNationality("FRA"), "FR");
  assert.equal(resolveNationality("France"), "FR");
  assert.equal(resolveNationality("UK"), "GB");
  assert.equal(resolveNationality("D"), "DE");
});

test("resolveNationality maps passport adjectives onto ISO2", () => {
  assert.equal(resolveNationality("Française"), "FR");
  assert.equal(resolveNationality("FRANCAISE"), "FR");
  assert.equal(resolveNationality("Nationalité : Française"), "FR");
  assert.equal(resolveNationality("République française"), "FR");
  assert.equal(resolveNationality("Marocaine"), "MA");
  assert.equal(resolveNationality("Tunisien"), "TN");
  assert.equal(resolveNationality("Algérienne"), "DZ");
  assert.equal(resolveNationality("Belge"), "BE");
  assert.equal(resolveNationality("Britannique"), "GB");
  assert.equal(resolveNationality("Américaine"), "US");
});

test("resolveNationality falls back to issuing country when nationality is missing", () => {
  assert.equal(resolveNationality(null, "France"), "FR");
  assert.equal(resolveNationality("", "FRA"), "FR");
  assert.equal(resolveNationality("illisible", "MA"), "MA");
});

test("resolveNationality never keeps an unmatched adjective", () => {
  assert.equal(resolveNationality("Françaisexyz"), null);
  assert.equal(resolveNationality(""), null);
  assert.equal(resolveNationality(null), null);
});

test("resolveCountryCode still does not treat demonyms as country names", () => {
  assert.equal(resolveCountryCode("Française"), null);
  assert.equal(resolveCountryCode("France"), "FR");
});
