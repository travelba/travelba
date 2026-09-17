import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMrzFromOcr } from "./mrz-parse";

const ICAO = [
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
  "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
].join("\n");

describe("parseMrzFromOcr", () => {
  it("reads the ICAO passport sample", () => {
    const identity = parseMrzFromOcr(ICAO);
    assert.ok(identity);
    assert.equal(identity?.doc_type, "passport");
    assert.equal(identity?.number, "L898902C3");
    assert.equal(identity?.last_name, "Eriksson");
    assert.equal(identity?.first_name, "Anna Maria");
    assert.equal(identity?.birth_date, "1974-08-12");
    assert.equal(identity?.expires_on, "2012-04-15");
    assert.equal(identity?.sex, "F");
    assert.equal(identity?.format, "TD3");
  });

  it("tolerates OCR noise around the MRZ band", () => {
    const identity = parseMrzFromOcr(`Passeport République\n${ICAO}\nmerci`);
    assert.equal(identity?.number, "L898902C3");
    assert.equal(identity?.last_name, "Eriksson");
  });

  it("returns null on unrelated text", () => {
    assert.equal(parseMrzFromOcr("facture hôtel Marrakech 2026"), null);
  });
});
