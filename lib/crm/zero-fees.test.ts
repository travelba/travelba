import assert from "node:assert/strict";
import test from "node:test";
import { customerZeroFees, feesLockedByPieces } from "./zero-fees";

test("Zéro frais ne suit que la fiche propriétaire", () => {
  assert.equal(customerZeroFees({ zero_fees: true }), true);
  assert.equal(customerZeroFees({ zero_fees: false }), false);
  assert.equal(customerZeroFees(null), false);
});

test("une facture imprimée, numérotée ou en préparation garde ses frais", () => {
  assert.equal(feesLockedByPieces([]), false);
  assert.equal(feesLockedByPieces([{ attempt_status: "failed" }]), false);
  assert.equal(feesLockedByPieces([{ printed_at: "2026-11-01" }]), true);
  assert.equal(feesLockedByPieces([{ piece_number: "F-12" }]), true);
  assert.equal(feesLockedByPieces([{ attempt_status: "preparing" }]), true);
});
