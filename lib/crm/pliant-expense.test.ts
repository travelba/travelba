import assert from "node:assert/strict";
import test from "node:test";
import {
  findPliantExpenseItem,
  pliantExpenseDraft,
  pliantExpenseOrigin,
  pliantExpenseRemovable,
  pliantExpenseSyncPatch,
} from "./pliant-expense";
import { prepareExpenseUpdate, McpWriteError } from "./mcp-write";

const draft = {
  sourceId: "11111111-1111-4111-8111-111111111111",
  amountEur: 148.5,
  supplier: "  Trattoria   Da Enzo ",
  occurredOn: "2026-10-28",
};

test("une dépense Pliant devient une ligne Dépense pré-remplie, une seule par transaction", () => {
  const expense = pliantExpenseDraft(draft);
  assert.ok(expense);
  assert.equal(expense.title, "Trattoria Da Enzo");
  assert.equal(expense.amount, 148.5);
  assert.equal(expense.start_at, "2026-10-28");
  assert.equal(expense.details.pliant_transaction_id, draft.sourceId);
  assert.equal(expense.details.pliant_amount, 148.5);
  assert.equal(expense.details.pliant_merchant, "Trattoria Da Enzo");
  assert.equal(expense.details.pliant_date, "2026-10-28");
  assert.equal(expense.details.quantity, 1);
  assert.equal(expense.details.unit_price, 148.5);
  // Sans commerçant : « Dépense ». Un remboursement n’est pas une dépense à refacturer.
  assert.equal(pliantExpenseDraft({ ...draft, supplier: null })?.title, "Dépense");
  assert.equal(pliantExpenseDraft({ ...draft, amountEur: -40 }), null);
  assert.equal(pliantExpenseDraft({ ...draft, amountEur: 0 }), null);

  const items = [
    { id: "a", kind: "hotel", lifecycle: "active", details: {} },
    { id: "b", kind: "expense", lifecycle: "cancelled", details: { pliant_transaction_id: draft.sourceId } },
    { id: "c", kind: "expense", lifecycle: "active", details: { pliant_transaction_id: draft.sourceId } },
    { id: "d", kind: "expense", lifecycle: "active", details: { pliant_transaction_id: "autre" } },
  ];
  assert.equal(findPliantExpenseItem(items, draft.sourceId)?.id, "c");
  assert.equal(findPliantExpenseItem(items, "inconnue"), null);
});

test("le règlement Pliant corrige une ligne non touchée ; une ligne modifiée garde son montant", () => {
  const created = pliantExpenseDraft(draft)!;
  const untouched = { amount: created.amount, details: created.details };
  const origin = pliantExpenseOrigin(untouched.details, untouched.amount);
  assert.ok(origin);
  assert.equal(origin.edited, false);
  assert.equal(origin.merchant, "Trattoria Da Enzo");
  assert.equal(pliantExpenseRemovable(untouched), true);

  // Autorisation 148,50 → écriture 151,20 : la ligne suit.
  const settled = pliantExpenseSyncPatch(untouched, { ...draft, amountEur: 151.2 });
  assert.ok(settled);
  assert.equal(settled.amount, 151.2);
  assert.equal(settled.details.pliant_amount, 151.2);
  assert.equal(settled.details.unit_price, 151.2);
  assert.equal(settled.details.pliant_transaction_id, draft.sourceId);
  // Rien n’a changé : rien à écrire.
  assert.equal(pliantExpenseSyncPatch(untouched, draft), null);

  // L’agence a refacturé 200 € : la ligne ne suit plus Pliant, et une autorisation refusée ne la retire pas.
  const edited = { amount: 200, details: { ...created.details, quantity: 2, unit_price: 100 } };
  assert.equal(pliantExpenseOrigin(edited.details, edited.amount)?.edited, true);
  assert.equal(pliantExpenseSyncPatch(edited, { ...draft, amountEur: 151.2 }), null);
  assert.equal(pliantExpenseRemovable(edited), false);

  // Ligne d’avant cette mémoire (pas de pliant_amount) : origine connue, jamais réécrite.
  const legacy = { amount: 90, details: { pliant_transaction_id: draft.sourceId } };
  const legacyOrigin = pliantExpenseOrigin(legacy.details, legacy.amount);
  assert.equal(legacyOrigin?.amount, null);
  assert.equal(legacyOrigin?.edited, false);
  assert.equal(pliantExpenseSyncPatch(legacy, { ...draft, amountEur: 95 })?.amount, 95);
  assert.equal(pliantExpenseOrigin({}, 90), null);
});

test("mettre_a_jour_dossier.depense lit la ligne, la quantité, le prix unitaire ou le montant", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  assert.deepEqual(prepareExpenseUpdate({ carte_id: id, quantite: 2, prix_unitaire: "45,00" }), {
    carteId: id,
    quantity: 2,
    unitPrice: "45,00",
  });
  assert.deepEqual(prepareExpenseUpdate({ carte_id: id, libelle: " Transferts ", montant: 90 }), {
    carteId: id,
    title: "Transferts",
    amount: 90,
  });
  // Valider seul suffit : la dépense automatique devient visible côté client.
  assert.deepEqual(prepareExpenseUpdate({ carte_id: id, valider: true }), { carteId: id, validate: true });
  assert.deepEqual(prepareExpenseUpdate({ carte_id: id, valider: false, montant: 120 }), { carteId: id, amount: 120, validate: false });
  assert.throws(() => prepareExpenseUpdate({ carte_id: id, valider: "oui" }), McpWriteError);
  assert.throws(() => prepareExpenseUpdate({ carte_id: id }), McpWriteError);
  assert.throws(() => prepareExpenseUpdate({ carte_id: "pas-un-uuid", montant: 90 }), McpWriteError);
  assert.throws(() => prepareExpenseUpdate({ carte_id: id, quantite: { n: 2 } }), McpWriteError);
  assert.throws(() => prepareExpenseUpdate(null), McpWriteError);
});
