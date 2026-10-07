import assert from "node:assert/strict";
import test from "node:test";
import { emptyIdentity } from "./passport-extract";
import { icaoCheckDigit, identitiesFromPassportOcr } from "./passport-mrz";
import { readAuthority, readDomicile, readIssueDate, readPlaceOfBirth } from "./passport-visual";

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
    ["PPISRDELACOUR<<HELIE<GASPAR<AUGUSTIN<<<<<<<<", collided, "P51720094<4"].join("\n"),
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
  const identity = { ...emptyIdentity(), birth_date: "2012-03-05", expires_on: "2030-03-17" };
  assert.equal(readIssueDate("1 8/03/2025\n17/03/2030", identity), "2025-03-18");
  assert.equal(readIssueDate("1 | 8/03/2025\n17/03/2035", { ...identity, expires_on: "2035-03-17" }), "2025-03-18");
  assert.equal(readIssueDate("Holder 1 { 8/03/2025\n17/03/2035", { ...identity, expires_on: "2035-03-17" }), "2025-03-18");
  assert.equal(readIssueDate("18 1038/2025\n17/03/2030", identity), "2025-03-18");
  const french = { ...emptyIdentity(), birth_date: "2008-05-22", expires_on: "2034-11-26" };
  assert.equal(readIssueDate("27 11.2024\n26 11 2034", french), "2024-11-27");
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
  assert.equal(rows[0].expires_on, "2034-11-26");
});

test("un passeport français à deux adresses garde le domicile, le prénom court et la ville de naissance", () => {
  const visual = [
    "Prénoms",
    "Zoé,Lina,Noa",
    "Nationalité Française",
    "23 04 2010 LEVALLOIS-PERRET",
    "Préfecture des Hauts-de-",
    "Seine NANTERRE",
    "18 RUE DU BOIS DE LA FONTAINE",
    "92200 NEUILLY-SUR-SEINE",
    "FRANCE",
    "9 RUE DES TILLEULS",
    "92300 LEVALLOIS-PERRET",
    "FRANCE",
  ].join("\n");
  const domicile = readDomicile(visual);
  assert.equal(domicile.address_line, "18 RUE DU BOIS DE LA FONTAINE");
  assert.equal(domicile.postal_code, "92200");
  assert.equal(domicile.city, "NEUILLY-SUR-SEINE");
  assert.equal(readPlaceOfBirth(visual, "FR", "2010-04-23"), "LEVALLOIS-PERRET");
  assert.equal(readAuthority(visual), "Préfecture des Hauts-de-Seine Nanterre");
  const rows = identitiesFromPassportOcr(
    ["P<FRADUPONT<<ZOE<LINA<NOA<<<<<<<<<<<<<<<<<<<<", td3Line("12AB34567", "FRA", "100423", "F", "300423", "")].join("\n"),
    visual
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].first_name, "Zoé Lina Noa");
  assert.equal(rows[0].address_line, "18 RUE DU BOIS DE LA FONTAINE");
  assert.equal(rows[0].postal_code, "92200");
  assert.equal(rows[0].city, "NEUILLY-SUR-SEINE");
  assert.equal(rows[0].place_of_birth, "LEVALLOIS-PERRET");
  assert.equal(rows[0].authority, "Préfecture des Hauts-de-Seine Nanterre");
});
