import assert from "node:assert/strict";
import test from "node:test";
import {
  MISTAKEN_PLIANT_LINK,
  planPliantUnlink,
  pliantLinkPhase,
  pliantLinkPhaseLabel,
  pliantUnlinkGuardOk,
  tripCostEventSentence,
  withoutRefusedSuggestions,
} from "./pliant-link";

const SPEND = MISTAKEN_PLIANT_LINK.spendId;
const TAGHAZOUT = MISTAKEN_PLIANT_LINK.bookingReference;

test("la dépense Phulay se reconnaît au commerçant, aux 4 chiffres et au montant", () => {
  assert.equal(
    pliantUnlinkGuardOk({ merchant: "PHULAY BAY A RITZCARTON", last4: "7171", billingCents: -1604211, status: "BOOKED" }),
    true
  );
  assert.equal(
    pliantUnlinkGuardOk({ merchant: "PHULAY BAY A RITZCARTON", last4: "9706", billingCents: -1604211, status: "DECLINED" }),
    false
  );
  assert.equal(
    pliantUnlinkGuardOk({ merchant: "AUTRE HOTEL", last4: "7171", billingCents: -1604211, status: "BOOKED" }),
    false
  );
});

test("seul le coût Taghazout de cette dépense est retiré", () => {
  const plan = planPliantUnlink(
    {
      spendId: SPEND,
      matchStatus: "matched",
      bookingId: null,
      costs: [{ id: "cost-1", reference: TAGHAZOUT }],
    },
    MISTAKEN_PLIANT_LINK
  );
  assert.deepEqual(plan.dropCostIds, ["cost-1"]);
  assert.equal(plan.reset, true);
  assert.equal(plan.changed, true);

  const elsewhere = planPliantUnlink(
    {
      spendId: SPEND,
      matchStatus: "matched",
      bookingId: null,
      costs: [{ id: "cost-2", reference: "TB-2026-0088" }],
    },
    MISTAKEN_PLIANT_LINK
  );
  assert.equal(elsewhere.changed, false);
  assert.equal(elsewhere.reason, "rattachée ailleurs");

  const otherSpend = planPliantUnlink(
    { spendId: "autre", matchStatus: "matched", bookingId: null, costs: [{ id: "cost-1", reference: TAGHAZOUT }] },
    MISTAKEN_PLIANT_LINK
  );
  assert.equal(otherSpend.reason, "autre dépense");
  assert.equal(otherSpend.changed, false);
});

test("une dépense déjà à proposer n’est pas réécrite", () => {
  const plan = planPliantUnlink(
    { spendId: SPEND, matchStatus: "unmatched", bookingId: null, costs: [] },
    MISTAKEN_PLIANT_LINK
  );
  assert.equal(plan.reason, "déjà à proposer");
  assert.equal(plan.changed, false);
});

test("l’écran dit À proposer tant que la dépense n’est pas sur un dossier", () => {
  assert.equal(pliantLinkPhase({ matchStatus: "unmatched", linked: false }), "a_proposer");
  assert.equal(pliantLinkPhaseLabel("a_proposer"), "À proposer");
  assert.equal(pliantLinkPhase({ matchStatus: "matched", linked: true }), "rattache");
  assert.equal(pliantLinkPhase({ matchStatus: "ignored", linked: false }), "hors_voyage");
});

test("refuser une proposition la retire sans toucher aux autres", () => {
  const left = withoutRefusedSuggestions(
    [
      { bookingId: "b1", reference: "TB-2026-0098" },
      { bookingId: "b2", reference: "TB-2026-0088" },
    ],
    ["b1"]
  );
  assert.deepEqual(left.map((row) => row.bookingId), ["b2"]);
  assert.equal(withoutRefusedSuggestions([{ bookingId: "b2" }], []).length, 1);
});

test("le journal se lit sans numéro de carte", () => {
  assert.equal(
    tripCostEventSentence({
      action: "correction",
      who: "Correction",
      fromReference: "TB-2026-0098",
      toReference: null,
      atLabel: "23 oct. 2026, 11:20",
    }),
    "Remise à proposer · retirée de TB-2026-0098 · 23 oct. 2026, 11:20"
  );
  assert.equal(
    tripCostEventSentence({
      action: "move",
      who: "Raphael Zerdoun",
      fromReference: "TB-2026-0098",
      toReference: "TB-2026-0088",
      atLabel: "23 oct. 2026, 12:00",
    }),
    "TB-2026-0098 → TB-2026-0088 · Raphael Zerdoun · 23 oct. 2026, 12:00"
  );
  assert.equal(tripCostEventSentence({ action: "detach", who: "", fromReference: null, toReference: null, atLabel: "" }).includes("7171"), false);
});
