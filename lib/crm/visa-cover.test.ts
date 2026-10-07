import assert from "node:assert/strict";
import test from "node:test";
import { settledAuthorizationCountries } from "./visa-cover";

test("un ESTA valable pour chaque voyageur ne se propose plus", () => {
  assert.deepEqual(
    settledAuthorizationCountries({
      travelerIds: ["a", "b"],
      estaTones: [
        { travelerId: "a", tone: "ok" },
        { travelerId: "b", tone: "ok" },
      ],
      ukEtaTones: [{ travelerId: "a", tone: "warn" }],
    }),
    ["US"]
  );
});

test("un voyageur sans ESTA valable laisse la proposition", () => {
  assert.deepEqual(
    settledAuthorizationCountries({
      travelerIds: ["a", "b"],
      estaTones: [{ travelerId: "a", tone: "ok" }],
      ukEtaTones: [],
    }),
    []
  );
});
