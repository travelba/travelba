import assert from "node:assert/strict";
import test from "node:test";
import { parseMrzFromOcr, parseMrzFromOcrAll } from "./mrz-parse";

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

test("two TD3 blocks on one scan yield two identities", () => {
  const identities = parseMrzFromOcrAll(
    [
      "P<FRADUPONT<<JEAN<PIERRE<MARIE<<<<<<<<<<<<<<",
      "12AB345679FRA9004026M2803129<<<<<<<<<<<<<<06",
      "P<FRAMARTIN<<MARIE<CLAIRE<<<<<<<<<<<<<<<<<<<",
      "98CD765432FRA8501018F3001015<<<<<<<<<<<<<<04",
    ].join("\n")
  );
  const lastNames = identities.map((identity) => identity.last_name).sort();
  assert.equal(identities.length, 2);
  assert.deepEqual(lastNames, ["Dupont", "Martin"]);
  const numbers = identities.map((identity) => identity.number).sort();
  assert.equal(new Set(numbers).size, 2);
});
