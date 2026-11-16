import assert from "node:assert/strict";
import test from "node:test";
import {
  findPliantExpenseItem,
  pliantDebitCoversTripCard,
  pliantExpenseCoveredByTripCard,
  pliantExpenseDraft,
  pliantExpenseOrigin,
  pliantExpenseRemovable,
  pliantExpenseSyncPatch,
} from "./pliant-expense";
import { accountLines, saleLines, type TripCost } from "./trip-costs";
import { agencyFeeBaseFromItems } from "./bookings";
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

const KEMPINSKI = "2082ac5a-9486-4430-8ed8-9234cfc5a9b9";
const BIT_BRIDGE_EXPENSE = "525158fc-aa45-47b0-af93-1b9a707afa89";
const BIT_BRIDGE_TX = "acc11790-a192-4caf-8214-a7f4960de4e2";
const BIT_BRIDGE_COST = "eadde4ab-ab7d-4bfc-b986-11e6f8211299";
const DOSSIER_0170 = "f937a7f5-b592-4c84-92cc-6aef25641e85";

function tripCost(itemId: string | null): TripCost {
  return {
    id: BIT_BRIDGE_COST,
    bookingId: DOSSIER_0170,
    bookingItemId: itemId,
    source: "pliant",
    sourceId: BIT_BRIDGE_TX,
    amountEur: 2996.23,
    originalAmount: 2996.23,
    originalCurrency: "EUR",
    supplier: "BIT BRIDGE LTD",
    occurredOn: "2026-11-12",
    instrument: "pliant_card",
    instrumentDetail: null,
    state: "posted",
  };
}

const kempinski = { id: KEMPINSKI, kind: "hotel", lifecycle: "active", title: "The David Kempinski Tel Aviv", amount: 2996.23 };
const bitBridge = {
  id: BIT_BRIDGE_EXPENSE,
  kind: "expense",
  lifecycle: "active",
  title: "BIT BRIDGE LTD",
  amount: 2996.23,
  details: {
    pliant_transaction_id: BIT_BRIDGE_TX,
    pliant_merchant: "BIT BRIDGE LTD",
    pliant_amount: 2996.23,
    awaiting_validation: true,
  },
};

test("TB-2026-0170 : le débit posé sur la dépense n’est pas le coût de l’hôtel, et reste à valider", () => {
  const items = [kempinski, bitBridge];
  const onExpense = tripCost(BIT_BRIDGE_EXPENSE);
  // Le coût en base pointe la dépense automatique, pas la carte hôtel.
  assert.equal(pliantDebitCoversTripCard(BIT_BRIDGE_TX, [onExpense], items), false);
  assert.equal(pliantExpenseCoveredByTripCard(bitBridge, [onExpense], items), false);

  const sales = saleLines(
    [
      {
        id: "6abdbcdb-17b6-47bd-aa78-a3f53d2d673b",
        booking_id: DOSSIER_0170,
        direction: "debit",
        kind: "booking",
        status: "posted",
        currency: "EUR",
        amount: 2996.23,
        label: "Hôtel",
        external_id: `booking:${DOSSIER_0170}:item:${KEMPINSKI}`,
      },
    ],
    DOSSIER_0170
  );
  const accounted = accountLines(sales, [onExpense]);
  assert.equal(accounted.lines[0]?.itemId, KEMPINSKI);
  assert.equal(accounted.lines[0]?.cost, 0);
  assert.equal(accounted.unsold.length, 1);
  assert.equal(accounted.unsold[0]?.id, BIT_BRIDGE_COST);
  assert.equal(accounted.unsold[0]?.amountEur, 2996.23);
  // La dépense à valider n’entre pas dans l’assiette, qu’elle soit listée ou non.
  assert.equal(agencyFeeBaseFromItems(items), 2996.23);
});

test("un débit déjà coût d’une carte ne s’affiche plus comme dépense à valider", () => {
  const flight = { id: "3eb10475-50c4-420e-b555-edc837550f33", kind: "flight", lifecycle: "active" };
  const emirates = {
    id: "exp-emirates",
    kind: "expense",
    lifecycle: "active",
    details: { pliant_transaction_id: "tx-emirates", awaiting_validation: true },
  };
  const taxi = {
    id: "exp-taxi",
    kind: "expense",
    lifecycle: "active",
    details: { pliant_transaction_id: "tx-taxi", awaiting_validation: true },
  };
  const items = [kempinski, bitBridge, flight, emirates, taxi];
  const costs = [
    tripCost(KEMPINSKI),
    { source: "pliant", sourceId: "tx-emirates", bookingItemId: flight.id },
    { source: "pliant", sourceId: "tx-taxi", bookingItemId: taxi.id },
    { source: "revolut", sourceId: BIT_BRIDGE_TX, bookingItemId: KEMPINSKI },
  ];
  assert.equal(pliantExpenseCoveredByTripCard(bitBridge, costs, items), true);
  assert.equal(pliantExpenseCoveredByTripCard(emirates, costs, items), true);
  // Posé sur la dépense elle-même : la liste des débits de la carte le garde.
  assert.equal(pliantExpenseCoveredByTripCard(taxi, costs, items), false);
  // Une dépense déjà validée reste une dépense, même si le coût est sur l’hôtel.
  const validated = { ...bitBridge, details: { pliant_transaction_id: BIT_BRIDGE_TX } };
  assert.equal(pliantExpenseCoveredByTripCard(validated, costs, items), false);
  // Hôtel retiré : le débit redevient une dépense à valider.
  const dropped = { ...kempinski, lifecycle: "cancelled" };
  assert.equal(pliantExpenseCoveredByTripCard(bitBridge, costs, [dropped, bitBridge, flight, emirates, taxi]), false);

  const sales = saleLines(
    [
      {
        id: "sale-hotel",
        booking_id: DOSSIER_0170,
        direction: "debit",
        kind: "booking",
        status: "posted",
        currency: "EUR",
        amount: 2996.23,
        external_id: `booking:${DOSSIER_0170}:item:${KEMPINSKI}`,
      },
    ],
    DOSSIER_0170
  );
  const onHotel = accountLines(sales, [tripCost(KEMPINSKI)]);
  assert.equal(onHotel.lines[0]?.cost, 2996.23);
  assert.equal(onHotel.unsold.length, 0);
  const listed = items.filter((item) => item.kind === "expense" && !pliantExpenseCoveredByTripCard(item, costs, items));
  assert.deepEqual(listed.map((item) => item.id), [taxi.id]);
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
