import assert from "node:assert/strict";
import test from "node:test";
import {
  annotatePliantPayload,
  pliantCardLimits,
  pliantLimitMismatchMessage,
  pliantLimitsApplied,
  pliantLimitUpdateBody,
  mapPliantTransaction,
  pliantAuthorizationAt,
  pliantAvailableLimit,
  pliantCardDisplay,
  pliantDossierLabels,
  pliantExpenseCaption,
  pliantDeclineCode,
  pliantDeclineMotif,
  pliantDebitState,
  pliantRefusalLabel,
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
  assert.equal(
    pliantAuthorizationAt({ createdAt: "2026-11-03T08:00:00.000Z", confirmedAt: "2026-11-06T10:00:00.000Z" }, "2026-11-06T10:00:00.000Z"),
    "2026-11-03"
  );
  assert.equal(pliantAuthorizationAt({}, "2026-11-06T10:00:00.000Z"), "2026-11-06");
  assert.equal(mapped.raw.pan, undefined);
  assert.equal((mapped.raw.merchantData as { pan?: string }).pan, undefined);
  assert.equal(pliantSignedCents(mapped.type, mapped.billing_cents), -12500);
  assert.equal(pliantSignedCents("REFUND", 12500), 12500);
});

test("le détail Pliant nomme le commerçant, la carte et le porteur", () => {
  const annotated = annotatePliantPayload(
    {
      transactionId: "tx-2",
      cardId: CARD,
      type: "PURCHASE",
      status: "DECLINED",
      category: "TRAVEL_AND_ACCOMMODATION",
      comment: "Hôtel",
      merchantRawData: { descriptionAuthorization: "MAEVA VACANSOL", pan: "4111111111111111" },
      billingAmount: { value: -562600, currency: "EUR" },
      transactionAmount: { value: -864450, currency: "USD" },
    },
    { cardId: CARD, label: "Slimane", refNum: "0641", pan: "4111111111114242" },
    { firstName: "Benjamin", lastName: "Boukris" }
  );
  const mapped = mapPliantTransaction(annotated);
  assert.ok(mapped);
  assert.equal(mapped.merchant, "MAEVA VACANSOL");
  assert.equal(mapped.card_label, "Slimane");
  assert.equal(mapped.card_last4, "0641");
  assert.equal(mapped.holder_name, "Benjamin Boukris");
  assert.equal(mapped.category, "TRAVEL_AND_ACCOMMODATION");
  assert.equal(mapped.comment, "Hôtel");
  assert.equal(mapped.raw.pan, undefined);
  assert.equal(mapped.card_last4, "0641");
  assert.equal(mapPliantTransaction({ transactionId: "tx-3", cardLast4: "12345" })?.card_last4, null);
  assert.deepEqual(pliantCardDisplay("Slimane", "0641"), { label: "Slimane", number: "•••• 0641" });
  assert.deepEqual(pliantCardDisplay(null, "5701"), { label: "Sans libellé", number: "•••• 5701" });
  assert.deepEqual(pliantCardDisplay("AMADEUS", null), { label: "AMADEUS", number: "Carte inconnue" });
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
  assert.equal(
    pliantSyncSummary(3, 2),
    "Synchronisation terminée : 3 mouvements lus. 2 dépenses rapprochées."
  );
  assert.equal(pliantTransactionPage({ data: [{ id: "a" }], hasNextPage: false }).done, true);
  assert.equal(pliantTransactionPage({ data: new Array(100).fill({ id: "a" }) }).done, false);
  assert.equal(pliantTransactionPage({ data: [{ id: "a" }] }).done, true);
  assert.deepEqual(pliantAvailableLimit({ availableLimit: { value: 250000, currency: "EUR" } }), {
    cents: 250000,
    currency: "EUR",
  });
  assert.deepEqual(
    pliantAvailableLimit({ data: { balance: { value: 90000, currency: "eur" } } }),
    { cents: 90000, currency: "EUR" }
  );
  assert.equal(pliantAvailableLimit({ name: "Travelba" }), null);
});

test("un refus Pliant porte un motif français et n’est pas proposable", () => {
  const raw = { declineReason: { type: "SCA_REQUIRED_VIRTUAL", title: { en: "SCA required", de: "SCA erforderlich" } } };
  assert.equal(pliantDeclineCode(raw), "SCA_REQUIRED_VIRTUAL");
  assert.equal(pliantDeclineMotif(raw), "Authentification 3DS exigée : le commerçant ne l’a pas lancée");
  assert.equal(pliantRefusalLabel("DECLINED", raw), "Refusé : Authentification 3DS exigée : le commerçant ne l’a pas lancée");
  assert.equal(pliantRefusalLabel("BOOKED", raw), null);
  assert.deepEqual(pliantDebitState("DECLINED", "unmatched"), { etat: "refusé", proposable: false });
  assert.deepEqual(pliantDebitState("BOOKED", "unmatched"), { etat: "à pointer", proposable: true });
  assert.equal(pliantDeclineMotif({ decline_reason: { code: "INSUFFICIENT_FUNDS" } }), "Plafond ou solde insuffisant");
  assert.equal(pliantDeclineMotif({ declineReasonType: "LOCKED_CARD" }), "Carte bloquée");
  assert.equal(pliantDeclineMotif({ declineReason: "UNKNOWN_CODE" }), "Paiement refusé");
  assert.equal(pliantDeclineMotif({ declineReason: { type: "  " } }), null);
  assert.equal(pliantRefusalLabel("DECLINED", {}), "Refusé : Motif non précisé");
  assert.equal(pliantDeclineCode({ pan: "4242424242424242", declineReason: { type: "DO_NOT_HONOUR" } }), "DO_NOT_HONOUR");
});

test("une carte de dossier nomme le séjour et le client avant le membre Pliant", () => {
  const caption = pliantExpenseCaption({
    holderName: "Benjamin Boukris",
    type: "PURCHASE",
    category: "FOOD_AND_DRINKS",
    dossier: {
      reference: "TB-2026-0088",
      title: "Phuket & Krabi",
      client: "Andréa Bensaïd",
      company: "AB GLOBAL VENTURES",
    },
  });
  assert.equal(caption.stay, "TB-2026-0088 · Phuket & Krabi");
  assert.equal(caption.who, "Andréa Bensaïd · AB GLOBAL VENTURES");
  assert.equal(caption.detail, "Achat · Restaurants · Benjamin Boukris");
  assert.ok(caption.detail.endsWith("Benjamin Boukris"));
  const alone = pliantExpenseCaption({
    holderName: "Benjamin Boukris",
    type: "PURCHASE",
    category: "FOOD_AND_DRINKS",
  });
  assert.equal(alone.stay, "");
  assert.equal(alone.detail.startsWith("Benjamin Boukris"), true);
  const labels = pliantDossierLabels({
    links: [
      { cardId: CARD, bookingId: "6ca304b2-ed11-4a68-882f-e6833b07359d", last4: "5701" },
      { cardId: CARD, bookingId: "autre", last4: "1111" },
    ],
    bookings: [
      {
        id: "6ca304b2-ed11-4a68-882f-e6833b07359d",
        reference: "TB-2026-0088",
        title: "Phuket & Krabi",
        destination: "Phuket",
        customerId: "client",
        companyId: "societe",
      },
    ],
    people: [{ id: "client", name: "Andréa Bensaïd", companyName: "AB GLOBAL VENTURES" }],
    companies: [{ id: "societe", name: "AB GLOBAL VENTURES" }],
  });
  assert.equal(labels.length, 1);
  assert.equal(labels[0].reference, "TB-2026-0088");
  assert.equal(labels[0].client, "Andréa Bensaïd");
  assert.equal(labels[0].company, "AB GLOBAL VENTURES");
  assert.equal(labels[0].last4, "5701");
});

const OLD = 165_228;
const NEXT = 168_597;

test("le plafond et le montant par transaction partent ensemble, le nombre reste", () => {
  const body = pliantLimitUpdateBody({
    limit: { value: NEXT, currency: "EUR" },
    transactionLimit: { value: NEXT, currency: "EUR" },
    count: 1,
  });
  assert.deepEqual(body.limit, { value: NEXT, currency: "EUR" });
  assert.deepEqual(body.transactionLimit, { value: NEXT, currency: "EUR" });
  assert.equal(body.limitRenewFrequency, "TOTAL");
  assert.equal(body.maxTransactionCount, 1);
  assert.equal("additionalLimits" in body, false);
  assert.equal("cardControls" in body, false);
  const open = pliantLimitUpdateBody({ limit: { value: NEXT, currency: "EUR" }, count: null });
  assert.equal("maxTransactionCount" in open, false);
  assert.deepEqual(open.transactionLimit, open.limit);
});

test("la relecture refuse un montant par transaction resté à l’ancien plafond", () => {
  const stale = {
    data: {
      limit: { value: NEXT, currency: "EUR" },
      transactionLimit: { value: OLD, currency: "EUR" },
      maxTransactionCount: 1,
    },
  };
  const applied = pliantLimitsApplied(stale, {
    limit: { value: NEXT, currency: "EUR" },
    transactionLimit: { value: NEXT, currency: "EUR" },
  });
  assert.equal(applied.ok, false);
  if (applied.ok) return;
  assert.equal(applied.limitCents, NEXT);
  assert.equal(applied.transactionLimitCents, OLD);
  const message = pliantLimitMismatchMessage(applied);
  assert.match(message, /n’a pas appliqué/);
  assert.match(message, /1 685,97 €/);
  assert.match(message, /1 652,28 €/);
  const live = {
    limit: { value: NEXT, currency: "EUR" },
    transactionLimit: { value: NEXT, currency: "EUR" },
    maxTransactionCount: 1,
  };
  assert.equal(
    pliantLimitsApplied(live, {
      limit: { value: NEXT, currency: "EUR" },
      transactionLimit: { value: NEXT, currency: "EUR" },
    }).ok,
    true
  );
  assert.equal(pliantCardLimits(live).maxTransactionCount, 1);
});
