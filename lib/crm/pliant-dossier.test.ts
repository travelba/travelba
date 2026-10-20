import assert from "node:assert/strict";
import test from "node:test";
import { dossierPendingCosts, planDossierPliantSpends, singleCardBooking, type DossierSpend } from "./pliant-dossier";

const DOSSIER = "6ca304b2-ed11-4a68-882f-e6833b07359d";
const CARD = "d10f5450-4645-46e5-ab1f-803cf818f7e0";

function coral(partial: Partial<DossierSpend> = {}): DossierSpend {
  return {
    id: "315cd2ce-ac3f-456e-8570-abc12f1ea520",
    cardId: CARD,
    status: "PENDING",
    type: "PURCHASE",
    merchant: "WWW.CORALTHAILAND.COM",
    billingCents: -24082,
    billingCurrency: "EUR",
    transactionCents: -900000,
    transactionCurrency: "THB",
    bookedAt: "2026-10-19T15:33:17.000Z",
    cardLast4: "5701",
    matchStatus: "unmatched",
    ...partial,
  };
}

test("une autorisation sur la carte du dossier devient un coût en attente, puis se met à jour", () => {
  const links = new Map([[CARD, DOSSIER]]);
  const inserted = planDossierPliantSpends({ spends: [coral()], cardBookingId: links, costs: [] });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].op, "insert");
  if (inserted[0].op !== "insert") return;
  assert.equal(inserted[0].bookingId, DOSSIER);
  assert.equal(inserted[0].state, "pending");
  assert.equal(inserted[0].draft.amountEur, 240.82);
  assert.equal(inserted[0].draft.originalAmount, 9000);
  assert.equal(inserted[0].draft.originalCurrency, "THB");

  const updated = planDossierPliantSpends({
    spends: [coral({ status: "BOOKED", billingCents: -24110 })],
    cardBookingId: links,
    costs: [
      {
        id: "cost-1",
        bookingId: DOSSIER,
        sourceId: coral().id,
        amountEur: 240.82,
        originalAmount: 9000,
        originalCurrency: "THB",
        state: "pending",
        supplier: "WWW.CORALTHAILAND.COM",
        occurredOn: "2026-10-19",
      },
    ],
  });
  assert.equal(updated[0]?.op, "update");
  if (updated[0]?.op !== "update") return;
  assert.equal(updated[0].state, "posted");
  assert.equal(updated[0].draft.amountEur, 241.1);
});

test("refus, retrait et hors voyage ne recollent pas la dépense", () => {
  const links = new Map([[CARD, DOSSIER]]);
  const dropped = planDossierPliantSpends({
    spends: [coral({ status: "DECLINED" })],
    cardBookingId: links,
    costs: [
      {
        id: "cost-1",
        bookingId: DOSSIER,
        sourceId: coral().id,
        amountEur: 240.82,
        originalAmount: 9000,
        originalCurrency: "THB",
        state: "pending",
        supplier: "WWW.CORALTHAILAND.COM",
        occurredOn: "2026-10-19",
      },
    ],
  });
  assert.equal(dropped[0]?.op, "drop");
  assert.deepEqual(
    planDossierPliantSpends({ spends: [coral({ released: true })], cardBookingId: links, costs: [] }),
    []
  );
  assert.deepEqual(
    planDossierPliantSpends({ spends: [coral({ matchStatus: "ignored" })], cardBookingId: links, costs: [] }),
    []
  );
});

test("une carte ambiguë ou un coût déjà sur un autre dossier n’est pas pris", () => {
  assert.equal(singleCardBooking([
    { cardId: CARD, bookingId: DOSSIER },
    { cardId: CARD, bookingId: "autre" },
  ]).has(CARD), false);
  const stolen = planDossierPliantSpends({
    spends: [coral()],
    cardBookingId: new Map([[CARD, DOSSIER]]),
    costs: [
      {
        id: "cost-2",
        bookingId: "autre-dossier",
        sourceId: coral().id,
        amountEur: 10,
        originalAmount: null,
        originalCurrency: "EUR",
        state: "posted",
        supplier: "WWW.CORALTHAILAND.COM",
        occurredOn: "2026-10-19",
      },
    ],
  });
  assert.deepEqual(stolen, []);
});

test("l’écran montre l’autorisation tant que le coût n’est pas écrit", () => {
  const shown = dossierPendingCosts({ bookingId: DOSSIER, spends: [coral()], existingSourceIds: [] });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].id, `pending:${coral().id}`);
  assert.equal(shown[0].state, "pending");
  assert.equal(shown[0].amountEur, 240.82);
  assert.deepEqual(
    dossierPendingCosts({ bookingId: DOSSIER, spends: [coral()], existingSourceIds: [coral().id] }),
    []
  );
  assert.deepEqual(
    dossierPendingCosts({ bookingId: DOSSIER, spends: [coral({ status: "BOOKED" })], existingSourceIds: [] }),
    []
  );
});
