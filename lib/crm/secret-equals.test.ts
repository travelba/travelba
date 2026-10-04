import assert from "node:assert/strict";
import test from "node:test";
import { secretEquals } from "./secret-equals";

test("la comparaison ne dépend pas de la longueur et ne lève pas", () => {
  assert.equal(secretEquals("secret", "secret"), true);
  assert.equal(secretEquals("secret", "Secret"), false);
  assert.equal(secretEquals("secret", "secret-plus-long"), false);
  assert.equal(secretEquals("", ""), true);
  assert.equal(secretEquals("", "x"), false);
  assert.equal(secretEquals("a".repeat(2000), "a".repeat(2000)), true);
  assert.equal(secretEquals("a".repeat(2000), "a".repeat(2001)), false);
  assert.equal(secretEquals(undefined as unknown as string, "x"), false);
});
