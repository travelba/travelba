import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_CREATE_HOLDS, autoCreatePlan } from "./email-ingest-create";
import { decideEmailIngestAction } from "./email-match";
import { emptyBookingExtract } from "./ingest-types";
import {
  AUTO_APPLY_CONFIDENCE,
  buildImportProposal,
  canAutoApply,
  proposalLine,
  readProposalOps,
  undoImportProposal,
} from "./import-proposal";
import { importWeekMetrics } from "./import-metrics";

const rome = {
  customer_id: "marie",
  booking_id: "b-rome",
  label: "TB-1 — Rome",
  reason: "Référence fournisseur",
  score: 90,
};

const hotel = {
  id: "h1",
  kind: "hotel",
  title: "Hôtel de Russie",
  confirmation_ref: "97620170",
  start_at: "2026-06-12",
  end_at: "2026-06-15",
  amount: 2400,
  include_in_ledger: true,
  lifecycle: "active",
};

function extract() {
  return {
    ...emptyBookingExtract(),
    document_status: "confirmed" as const,
    destination: "Rome",
    start_date: "2026-06-13",
    end_date: "2026-06-16",
    items: [
      {
        kind: "hotel" as const,
        title: "Hôtel de Russie",
        supplier: null,
        confirmation_ref: "97620170",
        start_at: "2026-06-13",
        end_at: "2026-06-16",
        amount: 1800,
        details: {},
      },
    ],
  };
}

test("on n’applique que sur une référence, à 0,9, sans conflit", () => {
  assert.equal(AUTO_APPLY_CONFIDENCE, 0.9);
  assert.equal(canAutoApply({ candidates: [rome], confidence: 0.96, conflict: false }), true);
  assert.equal(canAutoApply({ candidates: [rome], confidence: 0.8, conflict: false }), false);
  assert.equal(canAutoApply({ candidates: [rome], confidence: 0.96, conflict: true }), false);
  assert.equal(
    canAutoApply({
      candidates: [{ ...rome, reason: "Ajouter au dossier", score: 83 }],
      confidence: 0.96,
      conflict: false,
    }),
    false
  );
});

test("une confiance basse laisse la mise à jour dans la file", () => {
  const body = extract();
  const decision = decideEmailIngestAction({
    extract: body,
    suggestedCustomerId: "marie",
    suggestedBookingId: "b-rome",
    candidates: [rome],
  });
  const held = autoCreatePlan({
    extract: body,
    decision,
    candidates: [rome],
    items: [hotel],
    confidence: 0.45,
  });
  assert.equal(held.plan, null);
  assert.equal(held.hold, "low_confidence");
  assert.equal(held.message, AUTO_CREATE_HOLDS.low_confidence);
  const applied = autoCreatePlan({
    extract: body,
    decision,
    candidates: [rome],
    items: [hotel],
    confidence: 0.96,
  });
  assert.equal(applied.plan && applied.plan.kind, "apply_stay");
});

test("la proposition se lit avant / après et s’inverse", () => {
  const proposal = buildImportProposal(extract(), [hotel]);
  assert.equal(proposal.conflict, false);
  assert.equal(proposal.ops.some((op) => op.op === "replace"), true);
  assert.equal(proposal.ops.some((op) => op.op === "attach_mail"), true);
  const undone = undoImportProposal(proposal);
  assert.equal(undone[0]?.op, "attach_mail");
  assert.equal(undone.some((op) => op.op === "replace"), true);
  const replace = proposal.ops.find((op) => op.op === "replace");
  assert.equal(replace ? proposalLine(replace) : "", "Remplacer · Hôtel de Russie");
  assert.equal(proposalLine({ op: "attach_mail" }), "Joindre le mail aux pièces");
  const reread = readProposalOps([{ op: "add", kind: "hotel", title: "Portrait" }, { op: "nope" }]);
  assert.deepEqual(reread, [{ op: "add", kind: "hotel", title: "Portrait" }]);
});

test("les compteurs de la semaine", () => {
  const metrics = importWeekMetrics([
    { action: "auto_apply", edited: false, wrongIgnore: false, clicks: 0, waitMs: 1000 },
    { action: "auto_apply", edited: true, wrongIgnore: false, clicks: 2, waitMs: 4000 },
    { action: "human_apply", edited: true, wrongIgnore: false, clicks: 3, waitMs: 8000 },
    { action: "duplicate", edited: false, wrongIgnore: false, clicks: 1, waitMs: 500 },
    { action: "ignore", edited: false, wrongIgnore: true, clicks: 1, waitMs: 200 },
  ]);
  assert.equal(metrics.autoSansRetouche, 1);
  assert.equal(metrics.doublons, 1);
  assert.equal(metrics.ignoresATort, 1);
  assert.equal(metrics.clicsMoyens, 3);
  assert.equal(metrics.tempsMedianMs, 1000);
});
