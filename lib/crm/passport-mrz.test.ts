import assert from "node:assert/strict";
import test from "node:test";
import { emptyIdentity } from "./passport-extract";
import { icaoCheckDigit, identitiesFromPassportOcr } from "./passport-mrz";
import { readDomicile, readIssueDate } from "./passport-visual";

function td3Line(doc: string, nat: string, birth: string, sex: string, exp: string, personal: string) {
  const docField = doc.padEnd(9, "<").slice(0, 9);
  const personalField = personal.padEnd(14, "<").slice(0, 14);
  const line43 =
    docField +
    icaoCheckDigit(docField) +
    nat +
    birth +
    icaoCheckDigit(birth) +
    sex +
    exp +
    icaoCheckDigit(exp) +
    personalField +
    icaoCheckDigit(personalField);
  const composite =
    line43.slice(0, 10) + line43.slice(13, 20) + line43.slice(21, 28) + line43.slice(28, 43);
  return line43 + icaoCheckDigit(composite);
}

test("Latin given-name order stays, a reversed or Hebrew line does not replace it", () => {
  const rows = identitiesFromPassportOcr(
    ["P<FRADUPONT<<MAELLE<LOUISE<ROSALIE<<<<<<<<<<<<<<", td3Line("12AB34567", "FRA", "900402", "M", "280312", "")].join(
      "\n"
    ),
    "Given name Rosalie Louise Maelle\nרוזלי לואיז מאל"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Dupont");
  assert.equal(rows[0].first_name, "Maelle Louise Rosalie");
});

test("a check-digit collision keeps the number read on the left of the MRZ", () => {
  const collided = td3Line("17720094", "ISR", "080522", "M", "340814", "3<5207719<4");
  const rows = identitiesFromPassportOcr(
    ["PPISRDEDDOOUR<<HELIE<GASPAR<AUGUSTIN<<<<<<<<", collided, "P51720094<4"].join("\n"),
    "Given name Hélie Gaspar Augustin"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, "51720094");
  assert.equal(rows[0].first_name, "Hélie Gaspar Augustin");
});

test("a glare digit does not replace a check-digit-valid MRZ number", () => {
  const rows = identitiesFromPassportOcr(
    [
      "PPISRDELACOUR<<MAELLE<LOUISE<ROSALIE<<<<<<<<<<<",
      td3Line("51834267<", "ISR", "120305", "F", "300317", "3<5207718<6"),
    ].join("\n"),
    "Passport No. 51834268\nI.D. No. 8-5207718-6\nGiven name Rosalie Louise Maelle"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, "51834267");
  assert.equal(rows[0].personal_number, "3-5207718-6");
  assert.equal(rows[0].last_name, "Delacour");
  assert.equal(rows[0].first_name, "Maelle Louise Rosalie");
  assert.equal(rows[0].nationality, "IL");
});

test("a split OCR day is still the issue date", () => {
  const identity = { ...emptyIdentity(), birth_date: "2012-03-05", expires_on: "2031-06-10" };
  assert.equal(readIssueDate("1 1/06/2026\n10/06/2031", identity), "2026-06-11");
  assert.equal(readIssueDate("1 | 1/06/2026\n10/06/2036", { ...identity, expires_on: "2036-06-10" }), "2026-06-11");
  assert.equal(readIssueDate("Holder 1 { 1/06/2026\n10/06/2036", { ...identity, expires_on: "2036-06-10" }), "2026-06-11");
  assert.equal(readIssueDate("11 1068/2026\n10/06/2031", identity), "2026-06-11");
  const french = { ...emptyIdentity(), birth_date: "2008-05-22", expires_on: "2035-10-14" };
  assert.equal(readIssueDate("15 10.2025\n14 10 2035", french), "2025-10-15");
});

test("the postal code next to the street wins over a glare digit", () => {
  const domicile = readDomicile(
    "4410287 HERZLYA 8 RUE DES OLIVIERS 4610287 HERZLYA"
  );
  assert.equal(domicile.postal_code, "4610287");
  assert.equal(domicile.city, "HERZLYA");
  assert.equal(domicile.address_line, "8 RUE DES OLIVIERS");
  const postalOnly = readDomicile("DES OLlVIERS 4610287 HERZLYA");
  assert.equal(postalOnly.postal_code, "4610287");
  assert.equal(postalOnly.city, "HERZLYA");
  assert.equal(postalOnly.address_line, null);
});

test("French MRZ fragments keep printed given-name order and accents", () => {
  const rows = identitiesFromPassportOcr(
    [
      "EEFRADELACOUR<<HELIE<GASPAR<AUG",
      "OUR<<HELIE<GASPAR<AUGUSTIN<<<<<<<<",
      "Y24KD718560FRA0805227M3411263<<<<<<<<<<<<<<00",
    ].join("\n"),
    "Prénoms Hélie, Gaspar, Augustin\n24KD71836"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Delacour");
  assert.equal(rows[0].first_name, "Hélie Gaspar Augustin");
  assert.equal(rows[0].number, "24KD71836");
  assert.equal(rows[0].nationality, "FR");
  assert.equal(rows[0].birth_date, "2008-05-22");
  assert.equal(rows[0].expires_on, "2035-10-14");
});
