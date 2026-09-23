import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPassportForm,
  emptyIdentity,
  identityFromVision,
  identitySummary,
  mergePassportIdentities,
  mergePassportSets,
  uniquePassports,
  distinctPassportPeople,
  listedIdentities,
  identitiesFromUnknown,
} from "./passport-extract";

test("vision extract fills every passport field", () => {
  const identity = identityFromVision({
    doc_type: "passport",
    number: "18D 151774",
    issuing_country: "France",
    issued_on: "12/03/2018",
    expires_on: "12/03/2028",
    first_name: "BENJAMIN ADAM",
    last_name: "BOUKRIS",
    birth_date: "1990-04-02",
    place_of_birth: "PARIS",
    nationality: "FR",
    sex: "M",
    authority: "MINISTERE DE L'INTERIEUR",
    personal_number: "1234567890",
  });
  assert.ok(identity);
  assert.equal(identity.doc_type, "passport");
  assert.equal(identity.number, "18D151774");
  assert.equal(identity.issuing_country, "FR");
  assert.equal(identity.issued_on, "2018-03-12");
  assert.equal(identity.expires_on, "2028-03-12");
  assert.equal(identity.first_name, "Benjamin Adam");
  assert.equal(identity.last_name, "Boukris");
  assert.equal(identity.birth_date, "1990-04-02");
  assert.equal(identity.place_of_birth, "PARIS");
  assert.equal(identity.nationality, "FR");
  assert.equal(identity.sex, "M");
  assert.equal(identity.authority, "MINISTERE DE L'INTERIEUR");
  assert.equal(identity.personal_number, "1234567890");
  assert.match(identitySummary(identity), /18D151774/);
});

test("merge keeps every given name in passport order even if MRZ truncates", () => {
  const mrz = {
    ...emptyIdentity(),
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean",
    birth_date: "1990-04-02",
    expires_on: "2028-03-12",
    nationality: "FR",
    sex: "M" as const,
    issuing_country: "FR",
    valid: true,
    format: "TD3",
  };
  const vision = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "JEAN PIERRE MARIE",
    expires_on: "2028-03-12",
  });
  const merged = mergePassportIdentities(mrz, vision);
  assert.equal(merged?.first_name, "Jean Pierre Marie");
  assert.equal(merged?.last_name, "Dupont");
  assert.equal(merged?.valid, true);
});

test("vision given names keep MRZ fillers and printed order", () => {
  const identity = identityFromVision({
    number: "X1",
    last_name: "Martin",
    first_name: "ANNE<CLAIRE<LOUISE",
  });
  assert.equal(identity?.first_name, "Anne Claire Louise");
});

test("MRZ identity keeps visual-only fields from the photo", () => {
  const mrz = {
    ...emptyIdentity(),
    number: "18D151774",
    last_name: "Boukris",
    first_name: "Benjamin",
    birth_date: "1990-04-02",
    expires_on: "2028-03-12",
    nationality: "FR",
    sex: "M" as const,
    issuing_country: "FR",
    personal_number: "991122",
    valid: true,
    format: "TD3",
  };
  const vision = identityFromVision({
    number: "18D151774",
    last_name: "Boukris",
    first_name: "Benjamin",
    issued_on: "2018-03-12",
    place_of_birth: "Paris 16e",
    authority: "Préfecture de Paris",
    expires_on: "2028-03-12",
  });
  const merged = mergePassportIdentities(mrz, vision);
  assert.equal(merged?.issued_on, "2018-03-12");
  assert.equal(merged?.place_of_birth, "Paris 16e");
  assert.equal(merged?.authority, "Préfecture de Paris");
  assert.equal(merged?.personal_number, "991122");
  assert.equal(merged?.valid, true);
});

test("vision nationality adjectives fill ISO2, with issuing-country fallback", () => {
  const fromAdjective = identityFromVision({
    number: "18D151774",
    last_name: "Dupont",
    nationality: "Française",
    issuing_country: "France",
  });
  assert.equal(fromAdjective?.nationality, "FR");
  assert.equal(fromAdjective?.issuing_country, "FR");

  const fromIssuer = identityFromVision({
    number: "X1",
    last_name: "Martin",
    nationality: "illisible",
    issuing_country: "Maroc",
  });
  assert.equal(fromIssuer?.nationality, "MA");
  assert.equal(fromIssuer?.issuing_country, "MA");
});

test("merge copies passport nationality onto identity as ISO2", () => {
  const mrz = {
    ...emptyIdentity(),
    number: "18D151774",
    last_name: "Dupont",
    first_name: "Jean",
    birth_date: "1990-04-02",
    expires_on: "2028-03-12",
    nationality: "FRA",
    issuing_country: "FRA",
    valid: true,
    format: "TD3",
  };
  const vision = identityFromVision({
    number: "18D151774",
    last_name: "Dupont",
    first_name: "Jean",
    nationality: "Française",
    issuing_country: "République française",
  });
  const merged = mergePassportIdentities(mrz, vision);
  assert.equal(merged?.nationality, "FR");
  assert.equal(merged?.issuing_country, "FR");
});

test("passport form posts every extracted field", () => {
  const identity = identityFromVision({
    number: "X1",
    last_name: "Martin",
    issued_on: "2019-01-01",
    expires_on: "2029-01-01",
    place_of_birth: "Lyon",
    authority: "Mairie",
    personal_number: "AB<<<12",
  });
  const form = appendPassportForm(new FormData(), identity);
  assert.equal(form.get("issued_on"), "2019-01-01");
  assert.equal(form.get("place_of_birth"), "Lyon");
  assert.equal(form.get("authority"), "Mairie");
  assert.equal(form.get("personal_number"), "AB12");
  assert.equal(form.get("apply_identity"), "1");
});

test("mergePassportSets keeps two people and fills visual fields", () => {
  const mrzA = {
    ...emptyIdentity(),
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean",
    birth_date: "1990-04-02",
    expires_on: "2028-03-12",
    nationality: "FR",
    issuing_country: "FR",
    valid: true,
    format: "TD3",
  };
  const mrzB = {
    ...emptyIdentity(),
    number: "98CD76543",
    last_name: "Martin",
    first_name: "Marie",
    birth_date: "1985-01-01",
    expires_on: "2030-01-01",
    nationality: "FR",
    issuing_country: "FR",
    valid: true,
    format: "TD3",
  };
  const visionA = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "JEAN PIERRE",
    place_of_birth: "Paris",
  });
  const visionB = identityFromVision({
    number: "98CD76543",
    last_name: "Martin",
    first_name: "Marie Claire",
    place_of_birth: "Lyon",
  });
  const merged = mergePassportSets([mrzA, mrzB], [visionA!, visionB!]);
  assert.equal(merged.length, 2);
  const jean = merged.find((identity) => identity.number === "12AB34567");
  const marie = merged.find((identity) => identity.number === "98CD76543");
  assert.equal(jean?.first_name, "Jean Pierre");
  assert.equal(jean?.place_of_birth, "Paris");
  assert.equal(marie?.first_name, "Marie Claire");
  assert.equal(marie?.place_of_birth, "Lyon");
});

test("uniquePassports drops a duplicate number", () => {
  const first = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean",
  });
  const copy = identityFromVision({
    number: "12 AB 34567",
    last_name: "Dupont",
    first_name: "Jean Pierre",
    expires_on: "2028-03-12",
  });
  const unique = uniquePassports([first!, copy!]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].first_name, "Jean Pierre");
});

test("distinctPassportPeople keeps siblings with sequential numbers", () => {
  const jean = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean",
    expires_on: "2028-03-12",
  });
  const marie = identityFromVision({
    number: "12AB34568",
    last_name: "Dupont",
    first_name: "Marie",
    expires_on: "2028-03-12",
  });
  const people = distinctPassportPeople([jean!, marie!]);
  assert.equal(people.length, 2);
  assert.deepEqual(
    people.map((identity) => identity.first_name).sort(),
    ["Jean", "Marie"]
  );
});

test("distinctPassportPeople drops a last-name-only id card and a near-duplicate number", () => {
  const jean = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean Pierre",
    expires_on: "2028-03-12",
  });
  const marie = identityFromVision({
    number: "12AB34568",
    last_name: "Dupont",
    first_name: "Marie",
    expires_on: "2028-03-12",
  });
  const surnameCard = identityFromVision({
    doc_type: "id_card",
    last_name: "Dupont",
    number: "DUPONT",
  });
  const ocrClone = identityFromVision({
    number: "12AB34561",
    last_name: "Dupont",
    expires_on: "2028-03-12",
  });
  const people = distinctPassportPeople([jean!, marie!, surnameCard!, ocrClone!]);
  assert.equal(people.length, 2);
  assert.ok(people.every((identity) => identity.doc_type === "passport"));
  assert.ok(people.every((identity) => identity.first_name && identity.last_name));
});

test("distinctPassportPeople prefers the passport over an id card of the same person", () => {
  const passport = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean",
    expires_on: "2028-03-12",
  });
  const card = identityFromVision({
    doc_type: "id_card",
    last_name: "Dupont",
    first_name: "Jean",
    number: "X99",
  });
  const people = distinctPassportPeople([card!, passport!]);
  assert.equal(people.length, 1);
  assert.equal(people[0].doc_type, "passport");
  assert.equal(people[0].number, "12AB34567");
});

test("listedIdentities hides OCR extras when two people remain", () => {
  const jean = identityFromVision({
    number: "12AB34567",
    last_name: "Dupont",
    first_name: "Jean",
  });
  const marie = identityFromVision({
    number: "12AB34568",
    last_name: "Dupont",
    first_name: "Marie",
  });
  const extra = identityFromVision({
    doc_type: "id_card",
    last_name: "Dupont",
    number: "DUPONT",
  });
  const list = listedIdentities(jean, [jean!, marie!, extra!]);
  assert.equal(list.length, 2);
});

test("identitiesFromUnknown ignores a surname-only card on a two-passport file", () => {
  const people = identitiesFromUnknown([
    {
      number: "12AB34567",
      last_name: "Dupont",
      first_name: "Jean",
      expires_on: "2028-03-12",
    },
    {
      number: "12AB34568",
      last_name: "Dupont",
      first_name: "Marie",
      expires_on: "2028-03-12",
    },
    { doc_type: "id_card", last_name: "Dupont", number: "DUPONT" },
    { number: "12AB34561", last_name: "Dupont", expires_on: "2028-03-12" },
  ]);
  assert.equal(people.length, 2);
  assert.deepEqual(
    people.map((identity) => identity.first_name).sort(),
    ["Jean", "Marie"]
  );
});
