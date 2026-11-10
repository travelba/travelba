import assert from "node:assert/strict";
import test from "node:test";
import { isAutoTicketingExpense, isSpareTicketingExpense } from "./ticketing-fee";
import {
  DEFAULT_EXPENSE_PRESETS,
  TICKETING_PRESET_BLOCKED,
  expenseFromPreset,
  parseExpensePresetDrafts,
  ticketingPresetBlocked,
} from "./expense-presets";

const AUTO = {
  kind: "expense",
  title: "Frais de billeterie (2 billets)",
  details: { auto_fee: "ticketing" },
  lifecycle: "active",
};

test("les trois raccourcis par défaut ont un libellé, un montant et la garde billeterie seulement sur le premier", () => {
  assert.deepEqual(
    DEFAULT_EXPENSE_PRESETS.map((preset) => [preset.label, preset.amount, preset.guard]),
    [
      ["Frais billetterie", 25, "ticketing"],
      ["Frais billetterie train", 10, null],
      ["Frais transfert", 10, null],
    ]
  );
});

test("un raccourci est une dépense saisie à la main, pas la ligne automatique", () => {
  const body = expenseFromPreset(DEFAULT_EXPENSE_PRESETS[0]);
  assert.equal(body.kind, "expense");
  assert.equal(body.quantity, 1);
  assert.equal(body.unit_price, 25);
  assert.equal(body.amount, 25);
  assert.equal(body.include_in_ledger, true);
  assert.deepEqual(body.details, {});
  assert.equal(isAutoTicketingExpense(body), false);
  assert.equal(
    isSpareTicketingExpense({ kind: body.kind, title: body.title, details: body.details, lifecycle: "active" }),
    false
  );
  assert.equal(body.title, "Frais billetterie");
});

test("la garde billeterie refuse le doublon avec la ligne automatique et laisse le train et le transfert", () => {
  assert.equal(ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "Frais billetterie", [AUTO]), true);
  assert.equal(ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "frais billetterie", [AUTO]), true);
  assert.equal(ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "Frais billetterie train", [AUTO]), false);
  assert.equal(ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "Frais transfert", [AUTO]), false);
  assert.equal(ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "Frais billetterie", []), false);
  assert.equal(
    ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "Frais billetterie", [{ ...AUTO, lifecycle: "cancelled" }]),
    false
  );
  assert.equal(
    ticketingPresetBlocked(DEFAULT_EXPENSE_PRESETS, "Frais billetterie", [
      { kind: "expense", title: "Frais de billeterie", details: {}, lifecycle: "active" },
    ]),
    true
  );
  assert.match(TICKETING_PRESET_BLOCKED, /automatiques/);
});

test("la liste des réglages accepte libellé, montant et garde, et refuse un doublon", () => {
  const parsed = parseExpensePresetDrafts({
    lignes: [
      { libelle: " Frais billetterie ", montant: "25", billeterie: true },
      { label: "Pourboire", amount: 12.5, actif: false },
    ],
  });
  assert.ok(!("error" in parsed));
  if ("error" in parsed) return;
  assert.equal(parsed.presets[0].label, "Frais billetterie");
  assert.equal(parsed.presets[0].amount, 25);
  assert.equal(parsed.presets[0].guard, "ticketing");
  assert.equal(parsed.presets[1].active, false);
  assert.equal(parsed.presets[1].guard, null);
  const duplicate = parseExpensePresetDrafts({
    presets: [
      { label: "Frais transfert", amount: 10 },
      { label: "frais transfert", amount: 15 },
    ],
  });
  assert.deepEqual(duplicate, { error: "« frais transfert » est en double." });
  assert.deepEqual(parseExpensePresetDrafts({ presets: [{ label: "", amount: 10 }] }), {
    error: "Libellé requis (80 caractères au plus).",
  });
  assert.deepEqual(parseExpensePresetDrafts({ presets: [{ label: "Taxi", amount: 0 }] }), { error: "Montant invalide." });
});
