import assert from "node:assert/strict";
import test from "node:test";
import { ledgerWarning } from "./bookings";
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

test("ledgerWarning transforme un grand livre refusé en avertissement, sans rien lever", async () => {
  assert.equal(await ledgerWarning("Carte enregistrée", async () => undefined), null);
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const warning = await ledgerWarning("Carte enregistrée", async () => {
      throw new Error("Débit carte: duplicate key value");
    });
    assert.equal(warning, "Carte enregistrée, mais le grand livre n’a pas pu être mis à jour : Débit carte: duplicate key value");
    assert.deepEqual(logged, [["[crm] grand livre:", "Débit carte: duplicate key value"]]);
  } finally {
    console.error = original;
  }
});
