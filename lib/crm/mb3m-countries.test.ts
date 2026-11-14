import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MB3M_COUNTRY_CODES, mapMb3mCountry, mb3mUnknownCountryMessage } from "./mb3m-countries";

describe("pays MB3M", () => {
  it("reprend les 256 codes de GetCountries, sans le Kosovo", () => {
    const codes: readonly string[] = MB3M_COUNTRY_CODES;
    assert.equal(codes.length, 256);
    assert.equal(new Set(codes).size, 256);
    assert.equal(codes.includes("XK"), false);
    assert.equal(codes.includes("RS"), true);
    assert.equal(codes.includes("FR"), true);
  });

  it("envoie XK en RS, laisse FR, et nomme un pays inconnu", () => {
    assert.deepEqual(mapMb3mCountry("XK"), { code: "RS" });
    assert.deepEqual(mapMb3mCountry("xk"), { code: "RS" });
    assert.deepEqual(mapMb3mCountry("FR"), { code: "FR" });
    assert.deepEqual(mapMb3mCountry("fr"), { code: "FR" });
    assert.deepEqual(mapMb3mCountry(""), {});
    assert.deepEqual(mapMb3mCountry("XX"), { rejected: "XX" });
    assert.equal(mb3mUnknownCountryMessage("XX", "BEELYNQ LLC"), "BEELYNQ LLC : MB3M ne connaît pas le pays XX.");
  });
});
