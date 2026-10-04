import assert from "node:assert/strict";
import test from "node:test";
import { must } from "./must";

test("must renvoie data quand il n’y a pas d’erreur", () => {
  assert.deepEqual(must({ data: { id: "tx-1" }, error: null }, "Débit séjour"), { id: "tx-1" });
  assert.equal(must({ data: null, error: null }, "Débit séjour"), null);
});

test("must lève avec le contexte et le message Postgres", () => {
  assert.throws(
    () =>
      must(
        { data: null, error: { message: 'duplicate key value violates unique constraint "one_active_stay_debit"' } },
        "Débit séjour"
      ),
    (err: unknown) =>
      err instanceof Error &&
      err.message === 'Débit séjour: duplicate key value violates unique constraint "one_active_stay_debit"'
  );
});
