import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPassportForm,
  emptyIdentity,
  identityFromVision,
  identitySummary,
  mergePassportIdentities,
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
