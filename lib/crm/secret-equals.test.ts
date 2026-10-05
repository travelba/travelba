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
  // Deux secrets longs de même longueur ne sont pas « égaux » : la chaîne entière compte.
  assert.equal(secretEquals("a".repeat(600), "b".repeat(600)), false);
  assert.equal(secretEquals("a".repeat(599) + "b", "a".repeat(600)), false);
  assert.equal(secretEquals(undefined as unknown as string, "x"), false);
});
