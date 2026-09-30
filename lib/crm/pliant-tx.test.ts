import assert from "node:assert/strict";
import test from "node:test";
import {
  mapPliantTransaction,
  pliantSignedCents,
  pliantStayForCard,
  pliantSyncSummary,
  pliantTransactionPage,
  scrubPliantPayload,
} from "./pliant-tx";

const CARD = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

test("une transaction Pliant garde le commerçant, les centimes, et retire le numéro", () => {
  const mapped = mapPliantTransaction({
    transactionId: "tx-1",
    cardId: CARD,
    status: "CONFIRMED",
    type: "PURCHASE",
    merchantData: { name: "Hôtel Bristol", pan: "4242424242424242" },
    merchantName: "Ancien libellé",
    billingAmount: { value: 12500, currency: "EUR" },
    transactionAmount: { value: 12500, currency: "EUR" },
    confirmedAt: "2026-09-30T10:00:00.000Z",
    pan: "4242424242424242",
    cvv: "123",
  });
  assert.ok(mapped);
  assert.equal(mapped.merchant, "Hôtel Bristol");
  assert.equal(mapped.billing_cents, 12500);
  assert.equal(mapped.billing_currency, "EUR");
  assert.equal(mapped.card_id, CARD);
  assert.equal(mapped.booked_at, "2026-09-30T10:00:00.000Z");
  assert.equal(mapped.raw.pan, undefined);
  assert.equal((mapped.raw.merchantData as { pan?: string }).pan, undefined);
  assert.equal(pliantSignedCents(mapped.type, mapped.billing_cents), -12500);
  assert.equal(pliantSignedCents("REFUND", 12500), 12500);
});

test("le séjour se retrouve par la carte, pas par un autre dossier", () => {
  const stays = [
    { cardId: CARD, bookingId: "b1", reference: "TB-2026-0042", last4: "4242" },
    { cardId: "autre", bookingId: "b2", reference: "TB-2026-0043", last4: "1111" },
  ];
  assert.equal(pliantStayForCard(CARD, stays)?.reference, "TB-2026-0042");
  assert.equal(pliantStayForCard(CARD, stays)?.last4, "4242");
  assert.equal(pliantStayForCard("inconnue", stays), null);
  assert.equal(pliantStayForCard(null, stays), null);
  assert.equal(mapPliantTransaction({ type: "PURCHASE" }), null);
  assert.equal(scrubPliantPayload({ cvc: "999", merchant: "Cafe" }).cvc, undefined);
  assert.equal(pliantSyncSummary(3), "Synchronisation terminée : 3 mouvements lus.");
  assert.equal(pliantTransactionPage({ data: [{ id: "a" }], hasNextPage: false }).done, true);
  assert.equal(pliantTransactionPage({ data: new Array(100).fill({ id: "a" }) }).done, false);
  assert.equal(pliantTransactionPage({ data: [{ id: "a" }] }).done, true);
});
