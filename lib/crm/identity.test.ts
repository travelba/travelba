import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  identityFieldScore,
  identityScanWarning,
  type ExtractedIdentity,
} from "./identity";

function identity(partial: Partial<ExtractedIdentity>): ExtractedIdentity {
  return {
    doc_type: "passport",
    number: null,
    issuing_country: null,
    expires_on: null,
    first_name: null,
    last_name: null,
    birth_date: null,
    nationality: null,
    sex: null,
    format: null,
    valid: false,
    ...partial,
  };
}

describe("identityScanWarning", () => {
  it("is silent when MRZ checksums are valid", () => {
    assert.equal(identityScanWarning(identity({ valid: true, last_name: "Dupont" })), null);
  });

  it("is silent when five identity fields are filled", () => {
    const full = identity({
      number: "12AB12345",
      last_name: "Boukris",
      first_name: "Benjamin",
      birth_date: "1990-01-02",
      expires_on: "2030-05-01",
      nationality: "FR",
    });
    assert.equal(identityFieldScore(full), 6);
    assert.equal(identityScanWarning(full), null);
  });

  it("asks to verify when the extract is thin", () => {
    const thin = identity({ last_name: "Dupont", first_name: "Jean" });
    assert.equal(identityFieldScore(thin), 2);
    assert.match(identityScanWarning(thin) || "", /partielle/);
  });
});
