import assert from "node:assert/strict";
import test from "node:test";
import { parseMrzFromOcr } from "./mrz-parse";

test("MRZ TD3 keeps every given name after <<, in order", () => {
  const identity = parseMrzFromOcr(
    [
      "P<FRADUPONT<<JEAN<PIERRE<MARIE<<<<<<<<<<<<<<",
      "12AB345679FRA9004026M2803129<<<<<<<<<<<<<<06",
    ].join("\n")
  );
  assert.ok(identity);
  assert.equal(identity.last_name, "Dupont");
  assert.equal(identity.first_name, "Jean Pierre Marie");
  assert.equal(identity.nationality, "FR");
  assert.equal(identity.issuing_country, "FR");
});
