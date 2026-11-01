import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPENSE_AWAITING_KEY,
  awaitingExpenseDetails,
  expenseAwaitsValidation,
  expenseCountsForClient,
  validatedExpenseDetails,
} from "./expense-validation";
import { agencyFeeBaseFromItems, bookingDebitIntent, itemIncludedInLedger } from "./bookings";
import { displayedStayAmount } from "./displayed-stay";
import { pliantExpenseDraft } from "./pliant-expense";
import { clientStayExpenseLines } from "./ledger-display";

const awaiting = {
  id: "a",
  kind: "expense",
  title: "Trattoria Da Enzo",
  amount: 148.5,
  lifecycle: "active",
  include_in_ledger: true,
  details: { pliant_transaction_id: "tx-1", [EXPENSE_AWAITING_KEY]: true },
};
const validated = { ...awaiting, id: "b", title: "Transferts", amount: 90, details: { quantity: 2, unit_price: 45 } };
const hotel = { id: "h", kind: "hotel", title: "Hôtel", amount: 1000, lifecycle: "active", include_in_ledger: false, details: {} };

test("une dépense automatique attend la validation ; une dépense saisie compte tout de suite", () => {
  assert.equal(expenseAwaitsValidation(awaiting), true);
  assert.equal(expenseAwaitsValidation(validated), false);
  assert.equal(expenseAwaitsValidation(hotel), false);
  assert.equal(expenseAwaitsValidation({ kind: "expense", details: null }), false);
  assert.equal(expenseCountsForClient(awaiting), false);
  assert.equal(expenseCountsForClient(validated), true);
  assert.equal(expenseCountsForClient(hotel), false);

  // Valider retire le drapeau et garde le reste ; remettre à valider le repose.
  const kept = validatedExpenseDetails(awaiting.details);
  assert.equal(kept.pliant_transaction_id, "tx-1");
  assert.equal(EXPENSE_AWAITING_KEY in kept, false);
  assert.equal(awaitingExpenseDetails(kept)[EXPENSE_AWAITING_KEY], true);
  assert.deepEqual(validatedExpenseDetails(null), {});

  // La ligne née d’une dépense Pliant naît « à valider ».
  const draft = pliantExpenseDraft({ sourceId: "tx-9", amountEur: 40, supplier: "Taxi", occurredOn: "2026-10-28" });
  assert.equal(draft?.details[EXPENSE_AWAITING_KEY], true);
  assert.equal(expenseAwaitsValidation({ kind: "expense", details: draft?.details }), true);
});

test("une dépense à valider ne compte nulle part côté client", () => {
  // Grand livre : pas de débit, et un débit déjà là serait annulé.
  assert.equal(itemIncludedInLedger(awaiting, false), false);
  assert.equal(itemIncludedInLedger(validated, false), true);
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 148.5, hasOpenDebit: false, includeInLedger: itemIncludedInLedger(awaiting, false), visibleToClient: true }),
    "noop"
  );
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 148.5, hasOpenDebit: true, includeInLedger: itemIncludedInLedger(awaiting, false), visibleToClient: true }),
    "void"
  );
  assert.equal(
    bookingDebitIntent({ status: "confirmed", amount: 90, hasOpenDebit: false, includeInLedger: itemIncludedInLedger(validated, false), visibleToClient: true }),
    "insert"
  );

  // Assiette de la commission d’agence : la dépense validée seulement.
  assert.equal(agencyFeeBaseFromItems([hotel, awaiting, validated]), 1090);
  assert.equal(agencyFeeBaseFromItems([hotel, validated]), 1090);

  // Prix affiché au client (liste, réservation, règlement) : sans la dépense à valider.
  const booking = { status: "confirmed", total_amount: 1000, agency_commission: false, fee_mode: null };
  assert.equal(displayedStayAmount(booking, [hotel, validated], 2), 1090);
  assert.equal(displayedStayAmount(booking, [hotel, validated, awaiting], 2), 1090);
  // Une fois validée, elle entre.
  const validatedNow = { ...awaiting, details: validatedExpenseDetails(awaiting.details) };
  assert.equal(displayedStayAmount(booking, [hotel, validated, validatedNow], 2), 1238.5);

  // Section Dépenses de la réservation client : les lignes passées au filtre seulement.
  const lines = clientStayExpenseLines({
    expenses: [hotel, awaiting, validated].filter((item) => expenseCountsForClient(item)).map((item) => ({ id: item.id, title: item.title, amount: item.amount })),
    agencyCommission: false,
    stayTotal: 1000,
    currency: "EUR",
    pricesVisible: true,
  });
  assert.deepEqual(
    lines.map((line) => line.id),
    ["b"]
  );
});
