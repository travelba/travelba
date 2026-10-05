import assert from "node:assert/strict";
import test from "node:test";
import { readLedgerWarning } from "./ledger-warning";

test("readLedgerWarning lit l’avertissement d’une réponse 200", () => {
  assert.equal(
    readLedgerWarning({
      item: { id: "item-1" },
      ledger_warning: "Modification enregistrée, mais le grand livre n’a pas pu être mis à jour : refus",
    }),
    "Modification enregistrée, mais le grand livre n’a pas pu être mis à jour : refus"
  );
  assert.equal(readLedgerWarning({ ledger_warning: "  Dossier créé, mais…  " }), "Dossier créé, mais…");
});

test("readLedgerWarning ne voit rien sans avertissement exploitable", () => {
  assert.equal(readLedgerWarning({ item: { id: "item-1" } }), null);
  assert.equal(readLedgerWarning({ ledger_warning: "   " }), null);
  assert.equal(readLedgerWarning({ ledger_warning: 42 }), null);
  assert.equal(readLedgerWarning(null), null);
  assert.equal(readLedgerWarning(undefined), null);
  assert.equal(readLedgerWarning("ledger_warning"), null);
  assert.equal(readLedgerWarning([{ ledger_warning: "x" }]), null);
});
