import assert from "node:assert/strict";
import test from "node:test";
import { assignPassportsToParty, identityForPerson } from "./passport-assign";
import { emptyIdentity } from "./passport-extract";
import type { ExtractedIdentity } from "./identity";

function person(
  first: string,
  last: string,
  extra: Partial<ExtractedIdentity> = {}
): ExtractedIdentity {
  return {
    ...emptyIdentity(),
    first_name: first,
    last_name: last,
    number: extra.number || `${first[0]}${last[0]}1`,
    ...extra,
  };
}

test("two unknown passports: current card then new companion", () => {
  const assignments = assignPassportsToParty(
    [person("Jean", "Dupont"), person("Marie", "Martin")],
    { first_name: "", last_name: "" },
    [],
    { kind: "holder" }
  );
  assert.equal(assignments.length, 2);
  assert.equal(assignments[0].target.kind, "holder");
  assert.equal(assignments[0].identity.last_name, "Dupont");
  assert.equal(assignments[1].target.kind, "create");
  assert.equal(assignments[1].identity.last_name, "Martin");
});

test("holder match plus unknown creates the companion", () => {
  const assignments = assignPassportsToParty(
    [person("Marie", "Martin"), person("Jean", "Dupont")],
    { first_name: "Jean Pierre", last_name: "Dupont" },
    [],
    { kind: "holder" }
  );
  const holder = assignments.find((row) => row.target.kind === "holder");
  const created = assignments.find((row) => row.target.kind === "create");
  assert.equal(holder?.identity.last_name, "Dupont");
  assert.equal(created?.identity.last_name, "Martin");
});

test("existing companion absorbs the matching passport", () => {
  const assignments = assignPassportsToParty(
    [person("Camille", "Beaumont"), person("Jeremy", "Martin")],
    { first_name: "Jérémy Moïse", last_name: "Martin" },
    [{ id: "c1", first_name: "Camille Rose", last_name: "Beaumont" }],
    { kind: "holder" }
  );
  assert.deepEqual(
    assignments.map((row) => row.target),
    [{ kind: "companion", id: "c1" }, { kind: "holder" }]
  );
});

test("identityForPerson prefers the matching name", () => {
  const list = [person("Marie", "Martin"), person("Jean", "Dupont")];
  const mine = identityForPerson(list, { first_name: "Jean", last_name: "Dupont" });
  assert.equal(mine?.last_name, "Dupont");
});
