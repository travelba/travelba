import assert from "node:assert/strict";
import test from "node:test";
import { emptyIdentity } from "./passport-extract";
import { icaoCheckDigit, identitiesFromPassportOcr } from "./passport-mrz";
import { enrichPassportVisual, readAuthority, readDomicile, readIssueDate, readPlaceOfBirth } from "./passport-visual";

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

test("a street fragment is not rebuilt as a french passport number", () => {
  const doc = "12AB34567";
  const birth = "900402";
  const exp = "280312";
  const rows = identitiesFromPassportOcr(
    [
      "P<FRADUPONT<<ZOE<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      `XX${birth}${icaoCheckDigit(birth)}F${exp}${icaoCheckDigit(exp)}<<<<`,
      "48RU92309 LEVALLOIS",
    ].join("\n"),
    `Passeport n° ${doc}`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].number, doc);
});

test("a printed french number and a broken date tail rebuild the MRZ line", () => {
  const doc = "12AB34567";
  const birth = "900402";
  const exp = "280312";
  const rows = identitiesFromPassportOcr(
    [
      "P<FRADUPONT<<ZOE<LINA<<<<<<<<<<<<<<<<<<<<",
      `XX${birth}${icaoCheckDigit(birth)}F${exp}${icaoCheckDigit(exp)}<<<<`,
    ].join("\n"),
    `Passeport n° ${doc}\nPrénoms Zoé, Lina`
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].valid, true);
  assert.equal(rows[0].number, doc);
  assert.equal(rows[0].last_name, "Dupont");
  assert.equal(rows[0].first_name, "Zoé Lina");
  assert.equal(rows[0].birth_date, "1990-04-02");
  assert.equal(rows[0].expires_on, "2028-03-12");
  assert.equal(rows[0].sex, "F");
  assert.equal(rows[0].nationality, "FR");
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

test("un passeport français relu par l’OCR garde le nom d’épouse, le lieu et la ville entière", () => {
  const visual = [
    "ep. ne sr",
    "DUPONT 6p, MARTINEE",
    "DUPONT 66, MARTINEE",
    "DUPONT 6p, MATRINEE",
    "Prénoms",
    "Zoé, Lina",
    "Nationalité Française",
    "04 071988 LE BLANC-MESNIL",
    "19 11 2028",
    "BIB<<ZOE<LINA",
    "Préfecture de Selne-Saint-",
    "“ee Denis BOBIGNY |",
    "Nee Cob",
    "18 RUE DU BOIS DE LA FONTAINE 7s",
    "92200 NEUILLY-SUR-SEINE",
    "FRANCE",
    "9 RUE DES TILLEULS aa pes",
    "92300 LEVALLOIS-PERRET",
  ].join("\n");
  assert.equal(readPlaceOfBirth(visual, "FR", "1988-07-04"), "LE BLANC-MESNIL");
  assert.equal(readAuthority(visual), "Préfecture de Seine-Saint-Denis Bobigny");
  const domicile = readDomicile(visual);
  assert.equal(domicile.address_line, "18 RUE DU BOIS DE LA FONTAINE");
  assert.equal(domicile.postal_code, "92200");
  assert.equal(domicile.city, "NEUILLY-SUR-SEINE");
  const rows = identitiesFromPassportOcr(
    [
      "P<FRADUPONT<<ZOE<LINA<NOEMIE<<<<<<<<<<<<<<<<",
      "P<FRADUPONT<<ZOE<LINAS<SNOEMIE<<<<<<<<<<<<<<<<<",
      "P<FRADUPONT<<ZOE<LINA<XNOEMIE<<<<<<<<<<<<<<<<<<",
      "P<FRADUPONT<<ZOE<LINA<KNOEMIE<<<<<<<<<<<<<<<<<<",
      td3Line("12AB34567", "FRA", "880704", "F", "281119", ""),
    ].join("\n"),
    visual
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Dupont");
  assert.equal(rows[0].usage_name, "Martinée");
  assert.equal(rows[0].first_name, "Zoé Lina Noemie");
  assert.equal(rows[0].place_of_birth, "LE BLANC-MESNIL");
  assert.equal(rows[0].address_line, "18 RUE DU BOIS DE LA FONTAINE");
  assert.equal(rows[0].city, "NEUILLY-SUR-SEINE");
  assert.equal(rows[0].authority, "Préfecture de Seine-Saint-Denis Bobigny");
  assert.equal(rows[0].birth_date, "1988-07-04");
  assert.equal(rows[0].expires_on, "2028-11-19");
});

test("un prénom relu comme nom d’usage reste un prénom, et une lettre collée devant le nom saute", () => {
  const visual = ["Nom", "DUPONT", "Prénoms", "Zoé", "P<FRAADUPONT<<ZOE"].join("\n");
  const rows = identitiesFromPassportOcr(
    ["P<FRAADUPONT<<ZOE<LINA<<<<<<<<<<<<<<<<<<<<", td3Line("12AB34567", "FRA", "900402", "F", "280312", "")].join("\n"),
    visual
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Dupont");
  assert.equal(rows[0].usage_name, null);
  assert.equal(rows[0].first_name, "Zoé Lina");
});

test("un fragment du nom de naissance n’est pas un lieu", () => {
  const base = emptyIdentity();
  const fragment = enrichPassportVisual(
    { ...base, last_name: "Dupont", place_of_birth: "PONT", valid: true },
    ""
  );
  assert.equal(fragment.place_of_birth, null);
  const city = enrichPassportVisual(
    { ...base, last_name: "Dupont", place_of_birth: "LE BLANC-MESNIL", valid: true },
    ""
  );
  assert.equal(city.place_of_birth, "LE BLANC-MESNIL");
});

test("a french number glued to a digit or a misread letter still rebuilds the line", () => {
  const doc = "12AB34567";
  const check = icaoCheckDigit(doc);
  const birth = "900402";
  const exp = "280312";
  const tail = `${birth}${icaoCheckDigit(birth)}F${exp}${icaoCheckDigit(exp)}<`;
  const glued = identitiesFromPassportOcr(
    [`P<FRADUPONT<<ZOE<LINA<<<<<<<<<<<<<<<<<<<<`, `9${doc}${check}FRA${tail}`].join("\n"),
    "Prénoms Zoé, Lina"
  );
  assert.equal(glued.length, 1);
  assert.equal(glued[0].number, doc);
  assert.equal(glued[0].first_name, "Zoé Lina");
  const misread = identitiesFromPassportOcr(
    [`P<FRADUPONT<<ZOE<LINA<<<<<<<<<<<<<<<<<<<<`, `124834567${check}FRA${tail}`].join("\n"),
    "Prénoms Zoé, Lina"
  );
  assert.equal(misread.length, 1);
  assert.equal(misread[0].number, doc);
  const repeated = "12AA34567";
  const repeatedCheck = icaoCheckDigit(repeated);
  const missing = identitiesFromPassportOcr(
    [`P<FRADUPONT<<ZOE<LINA<<<<<<<<<<<<<<<<<<<<`, `12A34567${repeatedCheck}FRA${tail}`].join("\n"),
    "Prénoms Zoé, Lina"
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0].number, repeated);
});

test("deux prénoms collés par un reflet se séparent, et une lettre devant le nom ne reste pas", () => {
  const rows = identitiesFromPassportOcr(
    [
      "P<FRADUPONT<<ZOESLINAS<<<<<<<<<<<<<<<<<<<<",
      "DUPONT<<ZOE<",
      "ILINA<<<<<<<<",
      "P<FRAFDUPONT<<ZOE<LINA<<<<<<<<<<<<<<<<<<<<",
      "P<FRADUPONX<<ZOECLINA<ECECE<<<<<<<<<<<<<<<<",
      td3Line("12AB34567", "FRA", "900402", "F", "280312", ""),
    ].join("\n"),
    "Nom\nDUPONT\nPrénoms\nZoé, Lina"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].last_name, "Dupont");
  assert.equal(rows[0].usage_name, null);
  assert.equal(rows[0].first_name, "Zoé Lina");
});

test("le bruit entre le trait d’union et la ville ne coupe pas la préfecture, et la ville tronquée se complète", () => {
  const visual = [
    "Préfecture des Hauts-de- SSS XX Seine NANTERRE",
    "18 RUE DES LILAS",
    "92200 NEUILLY-SUR-SEI",
    "SEINE",
  ].join("\n");
  assert.equal(readAuthority(visual), "Préfecture des Hauts-de-Seine Nanterre");
  const domicile = readDomicile(visual);
  assert.equal(domicile.city, "NEUILLY-SUR-SEINE");
  assert.equal(domicile.postal_code, "92200");
  assert.equal(
    readAuthority("Préfecture de Seine-Saint-Denis Bobigny Era"),
    "Préfecture de Seine-Saint-Denis Bobigny"
  );
  assert.equal(
    readAuthority("Préfecture de Seine-Saint la Denis Bobigny"),
    "Préfecture de Seine-Saint-Denis Bobigny"
  );
  assert.equal(
    readPlaceOfBirth("04 07 1988 de délivrance\n0407 1988 AMIENS", "FR", "1988-07-04"),
    "AMIENS"
  );
});
