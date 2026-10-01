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
    ["P<FRADUPONT<<LYELLE<JEANNE<ARLETTE<<<<<<<<<<<<<<", td3Line("12AB34567", "FRA", "900402", "M", "280312", "")].join(
      "\n"
    ),
    "Given name Arlette Jeanne Lyelle\nארלט ז'אן ליאל"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Dupont");
  assert.equal(rows[0].first_name, "Lyelle Jeanne Arlette");
});

test("a check-digit collision keeps the number read on the left of the MRZ", () => {
  const collided = td3Line("65450083", "ISR", "070817", "M", "360629", "3<4130260<2");
  const rows = identitiesFromPassportOcr(
    ["PPISRDEDDOUCH<<ORENE<WILHEM<BENJAMIN<<<<<<<<", collided, "P43450083<1"].join("\n"),
    "Given name Orène Wilhem Benjamin"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, "43450083");
  assert.equal(rows[0].first_name, "Orène Wilhem Benjamin");
});

test("a glare digit does not replace a check-digit-valid MRZ number", () => {
  const rows = identitiesFromPassportOcr(
    [
      "PPISRDEDDOUCH<<LYELLE<JEANNE<ARLETTE<<<<<<<<<<<",
      td3Line("43325975<", "ISR", "110210", "F", "310610", "3<4130259<4"),
    ].join("\n"),
    "Passport No. 43325976\nI.D. No. 8-4130259-4\nGiven name Arlette Jeanne Lyelle"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, "43325975");
  assert.equal(rows[0].personal_number, "3-4130259-4");
  assert.equal(rows[0].last_name, "Deddouch");
  assert.equal(rows[0].first_name, "Lyelle Jeanne Arlette");
  assert.equal(rows[0].nationality, "IL");
});

test("a split OCR day is still the issue date", () => {
  const identity = { ...emptyIdentity(), birth_date: "2011-02-10", expires_on: "2031-06-10" };
  assert.equal(readIssueDate("1 1/06/2026\n10/06/2031", identity), "2026-06-11");
  assert.equal(readIssueDate("1 | 1/06/2026\n10/06/2036", { ...identity, expires_on: "2036-06-10" }), "2026-06-11");
  assert.equal(readIssueDate("Holder 1 { 1/06/2026\n10/06/2036", { ...identity, expires_on: "2036-06-10" }), "2026-06-11");
  assert.equal(readIssueDate("11 1068/2026\n10/06/2031", identity), "2026-06-11");
  const french = { ...emptyIdentity(), birth_date: "2007-08-17", expires_on: "2035-10-14" };
  assert.equal(readIssueDate("15 10.2025\n14 10 2035", french), "2025-10-15");
});

test("the postal code next to the street wins over a glare digit", () => {
  const domicile = readDomicile(
    "4470921 HERZLYA 22 RUE MENDELE MOCHER SFORIM 4670921 HERZLYA"
  );
  assert.equal(domicile.postal_code, "4670921");
  assert.equal(domicile.city, "HERZLYA");
  assert.equal(domicile.address_line, "22 RUE MENDELE MOCHER SFORIM");
  const postalOnly = readDomicile("MOCHER stORIM 4670921 HERZLYA");
  assert.equal(postalOnly.postal_code, "4670921");
  assert.equal(postalOnly.city, "HERZLYA");
  assert.equal(postalOnly.address_line, null);
});

test("French MRZ fragments keep printed given-name order and accents", () => {
  const rows = identitiesFromPassportOcr(
    [
      "EEFRADEDDOUCH<<ORENE<WILHEM<BEN",
      "UCH<<ORENE<WILHEM<BENJAMIN<<<<<<<<",
      "Y25HA658560FRA0708177M3510144<<<<<<<<<<<<<<06",
    ].join("\n"),
    "Prénoms Orène, Wilhem, Benjamin\n25HA65836"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Deddouch");
  assert.equal(rows[0].first_name, "Orène Wilhem Benjamin");
  assert.equal(rows[0].number, "25HA65836");
  assert.equal(rows[0].nationality, "FR");
  assert.equal(rows[0].birth_date, "2007-08-17");
  assert.equal(rows[0].expires_on, "2035-10-14");
});
