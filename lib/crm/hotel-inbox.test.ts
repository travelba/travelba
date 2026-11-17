import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") return { useRouter: () => ({ refresh() {}, push() {} }) };
  return load.call(this, request, parent, isMain);
};

const inboxView = import("../../components/admin/HotelInbox");

import {
  buildHotelInbox,
  HOTEL_INBOX_LOAD_ERROR,
  hotelInboxActionCount,
  hotelInboxExcerpt,
  hotelPaymentAmountCents,
  hotelPaymentSignal,
  matchHotelInboxCard,
  merchantResemblesHotel,
  pliantCardCaption,
  type HotelInboxCard,
  type HotelInboxRequest,
  type HotelInboxTurn,
  type HotelPaymentEvidence,
} from "./hotel-inbox";
import type { HotelPliantSpend } from "./hotel-courrier-board";

const NOW = Date.parse("2026-11-12T12:00:00+01:00");

function turn(patch: Partial<HotelInboxTurn> & Pick<HotelInboxTurn, "id" | "at" | "direction" | "body">): HotelInboxTurn {
  return { from: "desk@hotel.test", link: null, countsAsReply: patch.direction === "in", ...patch };
}

function request(patch: Partial<HotelInboxRequest> = {}): HotelInboxRequest {
  return {
    id: "letter-1",
    bookingId: "booking-1",
    itemId: "item-1",
    kind: "upgrade",
    status: "replied",
    sentAt: "2026-11-01T08:00:00.000Z",
    lastFollowUpAt: null,
    followUpCount: 0,
    classifiedAt: null,
    hotelName: "Rosewood London",
    city: "Londres",
    reference: "TB-2026-0142",
    clientName: "Camille Martin",
    clientFirst: "Camille",
    clientLast: "Martin",
    stayStart: "2026-11-10T15:00:00+01:00",
    itemEnd: "2026-11-20T11:00:00+01:00",
    bookingEnd: "2026-11-25",
    bookingStatus: "confirmed",
    bookingArchived: false,
    itemLifecycle: null,
    turns: [
      turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Pourriez-vous confirmer l’upgrade ?", countsAsReply: false }),
      turn({
        id: "in",
        at: "2026-11-02T09:00:00.000Z",
        direction: "in",
        body: "Here is the payment link for the upgrade.\nTotal 1 240,00 €.",
        link: "https://secure.hotel.test/pay/stay-1",
      }),
    ],
    ...patch,
  };
}

function spend(patch: Partial<HotelPliantSpend> = {}): HotelPliantSpend {
  return {
    bookingItemId: "item-1",
    hotelRequestId: null,
    transactionId: "tx-1",
    status: "BOOKED",
    type: "PURCHASE",
    billingCents: 124000,
    billingCurrency: "EUR",
    bookedAt: "2026-11-03T09:00:00.000Z",
    ...patch,
  };
}

function card(patch: Partial<HotelInboxCard> = {}): HotelInboxCard {
  return {
    id: "card-1",
    bookingId: "booking-1",
    pliantCardId: "pliant-1",
    label: "Martin – Rosewood London",
    last4: "4242424242421234",
    limitCents: 160000,
    currency: "EUR",
    status: "active",
    createdAt: "2026-11-01T00:00:00.000Z",
    ...patch,
  };
}

test("un lien dans une demande Upgrade entre dans Paiement, avec le montant", () => {
  const inbox = buildHotelInbox([request()], [], true, [], [], NOW);
  assert.deepEqual(inbox.payment.map((row) => row.id), ["booking-1:item-1"]);
  assert.equal(inbox.payment[0]?.kind, "upgrade");
  assert.equal(inbox.payment[0]?.signal, "Lien");
  assert.equal(inbox.payment[0]?.paymentState, "unpaid");
  assert.equal(hotelPaymentAmountCents("Total 1 240,00 €"), 124000);
  assert.match(inbox.payment[0]?.amountLabel || "", /240/);
  assert.equal(inbox.replies.length, 0);
});

function evidence(patch: Partial<HotelPaymentEvidence> & Pick<HotelPaymentEvidence, "place">): HotelPaymentEvidence {
  return {
    id: "ev-1",
    source: "pliant",
    bookingId: "booking-1",
    bookingItemId: patch.place === "stay" ? "item-1" : null,
    status: "BOOKED",
    type: "PURCHASE",
    billingCents: 124000,
    amount: null,
    currency: "EUR",
    at: "2026-11-03T09:00:00.000Z",
    merchant: null,
    cardLabel: null,
    confidence: null,
    ...patch,
  };
}

test("un paiement déjà reçu sort de Paiement", () => {
  const paid = buildHotelInbox([request()], [spend()], true, [], [], NOW);
  assert.deepEqual(paid.payment, []);
  assert.deepEqual(paid.replies, []);
  assert.equal(paid.paid.length, 1);
  assert.match(paid.paid[0]?.status || "", /Payé le/);
  assert.equal(paid.unanswered.length, 0);
  const asked = buildHotelInbox(
    [
      request({
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Le lien ?", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-04T09:00:00.000Z",
            direction: "in",
            body: "Payment received. Pouvez-vous confirmer l’heure d’arrivée ?",
          }),
        ],
      }),
    ],
    [spend({ bookedAt: "2026-11-03T09:00:00.000Z" })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(asked.payment.length, 0);
  assert.equal(asked.replies[0]?.status, "Réponse à traiter");
  assert.match(asked.replies[0]?.paidLabel || "", /Payé le/);
});

test("newsletter et code à usage unique vont dans Le reste", () => {
  const inbox = buildHotelInbox(
    [
      request({
        id: "news",
        itemId: "item-news",
        hotelName: "Leading Hotels",
        turns: [
          turn({ id: "out-n", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "news-in",
            at: "2026-11-02T08:00:00.000Z",
            direction: "in",
            body: "View in browser. Unsubscribe from our offers.",
            from: "Leading Hotels <newsletter@leadinghotels.com>",
          }),
        ],
      }),
      request({
        id: "code",
        itemId: "item-code",
        hotelName: "Marriott",
        kind: "payment_link",
        turns: [
          turn({ id: "out-c", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "code-in",
            at: "2026-11-02T08:00:00.000Z",
            direction: "in",
            body: "Your one-time code is 483920.",
            from: "Marriott Bonvoy <noreply@marriott.com>",
          }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW
  );
  assert.deepEqual(
    inbox.rest.map((row) => row.itemId).sort(),
    ["item-code", "item-news"]
  );
  assert.equal(inbox.payment.length, 0);
  assert.equal(inbox.replies.length, 0);
});

test("un hôtel terminé disparaît avant la fin du dossier, le jour du départ reste", () => {
  const onDeparture = Date.parse("2026-11-12T18:00:00+01:00");
  const nextDay = Date.parse("2026-11-13T08:00:00+01:00");
  const visible = buildHotelInbox(
    [
      request({
        id: "late",
        itemId: "still",
        hotelName: "Savoy",
        itemEnd: "2026-11-12T11:00:00+01:00",
        bookingEnd: "2026-11-01",
        kind: "transfer",
        turns: [
          turn({ id: "o", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Le transfert ?", countsAsReply: false }),
          turn({ id: "i", at: "2026-11-02T08:00:00.000Z", direction: "in", body: "Le chauffeur sera là à 18 h.", link: null }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    onDeparture
  );
  assert.equal(visible.replies[0]?.itemId, "still");
  const hidden = buildHotelInbox(
    [
      request({
        id: "done",
        itemId: "done-hotel",
        hotelName: "Rosewood London",
        itemEnd: "2026-11-01T11:00:00+01:00",
        bookingEnd: "2026-11-25",
        turns: [
          turn({ id: "o2", at: "2026-10-20T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({ id: "i2", at: "2026-10-21T08:00:00.000Z", direction: "in", body: "Bien reçu.", link: null }),
        ],
      }),
      request({
        id: "open",
        itemId: "open-hotel",
        hotelName: "Savoy",
        itemEnd: "2026-11-20T11:00:00+01:00",
        bookingEnd: "2026-11-25",
        kind: "transfer",
        turns: [
          turn({ id: "o3", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Le transfert ?", countsAsReply: false }),
          turn({ id: "i3", at: "2026-11-02T08:00:00.000Z", direction: "in", body: "Le chauffeur sera là.", link: null }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW
  );
  assert.equal(hidden.replies.some((row) => row.itemId === "done-hotel"), false);
  assert.equal(hidden.payment.some((row) => row.itemId === "done-hotel"), false);
  assert.equal(hidden.replies.some((row) => row.itemId === "open-hotel"), true);
  const after = buildHotelInbox(
    [
      request({
        itemEnd: "2026-11-12T11:00:00+01:00",
        bookingEnd: "2026-12-01",
        kind: "transfer",
        turns: [
          turn({ id: "o4", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({ id: "i4", at: "2026-11-02T08:00:00.000Z", direction: "in", body: "Bien reçu.", link: null }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    nextDay
  );
  assert.equal(after.replies.length + after.payment.length + after.unanswered.length, 0);
});

test("sans lecture Pliant, on n’écrit pas qu’il n’y a pas eu de paiement", async () => {
  const inbox = buildHotelInbox([request()], [], false, [], [], NOW);
  assert.equal(inbox.payment[0]?.paymentState, "unknown");
  const { HotelInbox } = await inboxView;
  const html = renderToStaticMarkup(createElement(HotelInbox, { inbox }));
  assert.equal(html.includes("Pas de paiement"), false);
  assert.equal(html.includes("À payer"), false);
  assert.match(html, /Paiement Pliant à faire/);
  assert.match(html, /Lien/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /Créer la carte/);
  assert.equal(html.includes("Confirmer la création"), false);
  assert.match(html, /Classer/);
  assert.equal(html.includes("4242 4242"), false);
});

test("la carte active suit l’hôtel et le montant, jamais le numéro complet", () => {
  const matched = matchHotelInboxCard({
    bookingId: "booking-1",
    hotelName: "Rosewood London",
    amountCents: 124000,
    otherHotels: ["Savoy"],
    linkedPliantIds: [],
    cards: [
      card({ id: "old", pliantCardId: "old", createdAt: "2026-11-01T00:00:00.000Z", limitCents: 124000, last4: "4242424242424242" }),
      card({ id: "new", pliantCardId: "new", createdAt: "2026-11-05T00:00:00.000Z", limitCents: 124000, last4: "1111" }),
      card({ id: "far", pliantCardId: "far", createdAt: "2026-11-06T00:00:00.000Z", limitCents: 900000, last4: "2222" }),
      card({ id: "other", pliantCardId: "other", label: "Martin – Savoy", createdAt: "2026-11-07T00:00:00.000Z", last4: "9999" }),
    ],
  });
  assert.equal(matched?.pliantCardId, "new");
  const caption = pliantCardCaption(matched!);
  assert.match(caption, /••1111/);
  assert.match(caption, /active/);
  assert.equal(caption.includes("4242424242424242"), false);
  const inbox = buildHotelInbox([request()], [], true, [matched!], [], NOW);
  assert.match(inbox.payment[0]?.cardLabel || "", /••1111/);
  assert.equal((inbox.payment[0]?.cardLabel || "").includes("4242"), false);
});

test("l’extrait tient sur deux lignes et retire le numéro de carte", () => {
  const excerpt = hotelInboxExcerpt("Bonjour,\nLe transfert est à 18 h.\nCarte 4242 4242 4242 4242\nMerci de confirmer le nom.");
  assert.equal(excerpt.includes("4242"), false);
  assert.equal(excerpt.split("\n").length <= 2, true);
  assert.match(excerpt, /18 h/);
});

test("les signaux ne dépendent pas du type de demande", () => {
  assert.equal(hotelPaymentSignal("Please complete the pre-authorization.", null), "Préautorisation");
  assert.equal(hotelPaymentSignal("Credit card authorization form attached.", null), "Demande de carte");
  assert.equal(hotelPaymentSignal("Please find the proforma invoice.", null), "Facture");
  assert.equal(hotelPaymentSignal("Voici le virement.", null), "Facture");
});

test("la page groupe, replie l’attente et le reste, et compte le séjour terminé impayé", async () => {
  const inbox = buildHotelInbox(
    [
      request(),
      request({
        id: "same-hotel",
        kind: "transfer",
        turns: [turn({ id: "only-out", at: "2026-11-11T08:00:00.000Z", direction: "out", body: "Autre demande", countsAsReply: false })],
      }),
      request({
        id: "quiet",
        itemId: "quiet",
        hotelName: "NoMad",
        status: "sent",
        kind: "precheckin",
        sentAt: "2026-11-01T08:00:00.000Z",
        turns: [turn({ id: "quiet-out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Pré-enregistrement", countsAsReply: false })],
      }),
      request({
        id: "fresh",
        itemId: "fresh",
        hotelName: "The Ned",
        status: "sent",
        kind: "concierge",
        sentAt: "2026-11-12T08:00:00.000Z",
        turns: [turn({ id: "fresh-out", at: "2026-11-12T08:00:00.000Z", direction: "out", body: "Concierge", countsAsReply: false })],
      }),
      request({
        id: "ended-pay",
        itemId: "ended",
        hotelName: "Ritz",
        itemEnd: "2026-10-01T11:00:00+01:00",
        bookingEnd: "2026-12-01",
        turns: [
          turn({ id: "e-out", at: "2026-09-20T08:00:00.000Z", direction: "out", body: "Le lien ?", countsAsReply: false }),
          turn({
            id: "e-in",
            at: "2026-09-21T08:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/ritz",
          }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW
  );
  assert.equal(inbox.payment.length, 1);
  assert.equal(inbox.unanswered.some((row) => row.itemId === "quiet"), true);
  assert.match(inbox.unanswered.find((row) => row.itemId === "quiet")?.status || "", /Sans réponse depuis/);
  assert.equal(inbox.waiting.some((row) => row.itemId === "fresh"), true);
  assert.equal(inbox.endedUnpaid[0]?.itemId, "ended");
  const { HotelInbox } = await inboxView;
  const html = renderToStaticMarkup(createElement(HotelInbox, { inbox }));
  assert.ok(html.indexOf("Paiement Pliant à faire") < html.indexOf("Autres réponses à traiter") || !html.includes("Autres réponses à traiter"));
  assert.ok(html.indexOf("Paiement Pliant à faire") < html.indexOf("Envoyé sans réponse"));
  assert.ok(html.indexOf("Envoyé sans réponse") < html.indexOf("1 en attente"));
  assert.match(html, /séjour terminé avec un lien de paiement jamais réglé/);
  assert.match(html, /TB-2026-0142/);
  assert.match(html, /Camille Martin/);
  assert.match(html, /Répondre/);
  assert.match(html, /Relancer/);
  assert.match(html, /Ouvrir le dossier/);
});

test("Bangkok Marriott : « please kindly see the attached file » après le paiement ne rouvre pas", () => {
  const inbox = buildHotelInbox(
    [
      request({
        hotelName: "Bangkok Marriott",
        reference: "TB-2026-0137",
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Le lien ?", countsAsReply: false }),
          turn({
            id: "link",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/bkk",
          }),
          turn({ id: "file", at: "2026-11-04T09:00:00.000Z", direction: "in", body: "Please kindly see the attached file." }),
        ],
      }),
    ],
    [spend({ bookedAt: "2026-11-03T09:00:00.000Z" })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(inbox.payment.length, 0);
  assert.equal(inbox.replies.length, 0);
  assert.equal(inbox.rest.length, 0);
  assert.match(inbox.paid[0]?.status || "", /Payé le/);
});

test("Fairmont Singapore : un fil classé et payé est masqué", () => {
  const inbox = buildHotelInbox(
    [
      request({
        hotelName: "Fairmont Singapore",
        reference: "TB-2026-0079",
        classifiedAt: "2026-11-10T09:00:00.000Z",
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/fm",
          }),
        ],
      }),
    ],
    [spend()],
    true,
    [],
    [],
    NOW
  );
  assert.equal(inbox.payment.length, 0);
  assert.equal(inbox.replies.length, 0);
  assert.equal(inbox.rest.length, 0);
  assert.equal(inbox.paid.length, 0);
  assert.equal(inbox.unanswered.length, 0);
});

test("Park Hyatt Saigon : PENDING proposé en confiance haute, sans carte du dossier", () => {
  assert.equal(merchantResemblesHotel("ONEPAYJ*PARK HYATT SAI", "Park Hyatt Saigon"), true);
  assert.equal(merchantResemblesHotel("ONEPAYJ*PARK HYATT SAI", "Park Hyatt Phu Quoc"), false);
  assert.equal(merchantResemblesHotel("HYATT", "Park Hyatt Saigon"), false);
  const proposal = evidence({
    id: "onepay",
    place: "proposal",
    status: "PENDING",
    merchant: "ONEPAYJ*PARK HYATT SAI",
    confidence: "haute",
    billingCents: 2500000,
    cardLabel: null,
  });
  const inbox = buildHotelInbox(
    [
      request({
        hotelName: "Park Hyatt Saigon",
        reference: "TB-2026-0148",
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Please complete the payment link.",
            link: "https://pay.hotel.test/sgn",
          }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW,
    [proposal]
  );
  assert.equal(inbox.payment.length, 0);
  assert.equal(inbox.unanswered.length, 0);
  assert.equal(inbox.paid[0]?.paymentState, "probable");
  assert.equal(inbox.paid[0]?.status, "Payé probablement, à pointer");
  const low = buildHotelInbox(
    [
      request({
        hotelName: "Park Hyatt Saigon",
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/sgn",
          }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW,
    [{ ...proposal, confidence: "moyenne" }]
  );
  assert.equal(low.payment.length, 1);
  assert.equal(low.paid.length, 0);
});

test("Park Hyatt Phu Quoc : seulement nos envois, le paiement est quand même lu", () => {
  const inbox = buildHotelInbox(
    [
      request({
        hotelName: "Park Hyatt Phu Quoc",
        status: "sent",
        kind: "payment_link",
        turns: [turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false })],
      }),
    ],
    [spend()],
    true,
    [],
    [],
    NOW
  );
  assert.equal(inbox.payment.length, 0);
  assert.equal(inbox.unanswered.length, 0);
  assert.equal(inbox.waiting.length, 0);
  assert.match(inbox.paid[0]?.status || "", /Payé le/);
});

test("un coût Revolut rattaché au séjour paie le fil, même sans mot de paiement", () => {
  const inbox = buildHotelInbox(
    [
      request({
        status: "sent",
        turns: [turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false })],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW,
    [evidence({ source: "revolut", place: "stay", status: null, billingCents: null, amount: 980, currency: "EUR" })]
  );
  assert.equal(inbox.unanswered.length, 0);
  assert.match(inbox.paid[0]?.status || "", /Payé le/);
  assert.match(inbox.paid[0]?.status || "", /980/);
});

test("une dépense du dossier sur la carte dédiée paie l’hôtel", () => {
  const inbox = buildHotelInbox(
    [
      request({
        hotelName: "Fairmont Singapore",
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/fm",
          }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW,
    [
      evidence({
        place: "dossier",
        merchant: "ADYEN NV",
        cardLabel: "Martin – Fairmont Singapore",
        billingCents: 210000,
      }),
    ]
  );
  assert.equal(inbox.payment.length, 0);
  assert.match(inbox.paid[0]?.status || "", /Payé le/);
  const elsewhere = buildHotelInbox(
    [
      request({
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/rw",
          }),
        ],
      }),
    ],
    [spend({ bookingItemId: "autre-hotel" })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(elsewhere.payment.length, 1);
  assert.equal(elsewhere.paid.length, 0);
});

test("un PENDING non nul et non refusé sort de Paiement et d’Envoyé sans réponse", () => {
  const pending = buildHotelInbox(
    [
      request({
        status: "sent",
        turns: [turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false })],
      }),
    ],
    [spend({ status: "PENDING", billingCents: 50000 })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(pending.payment.length, 0);
  assert.equal(pending.unanswered.length, 0);
  assert.equal(pending.paid[0]?.paymentState, "authorized");
  assert.equal(pending.paid[0]?.status, "Paiement autorisé, en attente Pliant");
  const declined = buildHotelInbox(
    [
      request({
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "in",
            at: "2026-11-02T09:00:00.000Z",
            direction: "in",
            body: "Payment link enclosed.",
            link: "https://pay.hotel.test/no",
          }),
        ],
      }),
    ],
    [spend({ status: "DECLINED" })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(declined.payment.length, 1);
  assert.equal(declined.paid.length, 0);
});

test("une facture d’un autre montant rouvre le fil, pas vers Paiement à faire", () => {
  const other = buildHotelInbox(
    [
      request({
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({
            id: "bill",
            at: "2026-11-04T09:00:00.000Z",
            direction: "in",
            body: "Please find the invoice for 2 400,00 €.",
          }),
        ],
      }),
    ],
    [spend({ bookedAt: "2026-11-03T09:00:00.000Z" })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(other.payment.length, 0);
  assert.equal(other.replies.length, 1);
  const same = buildHotelInbox(
    [
      request({
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({ id: "bill", at: "2026-11-04T09:00:00.000Z", direction: "in", body: "Invoice 1 240,00 €." }),
        ],
      }),
    ],
    [spend({ bookedAt: "2026-11-03T09:00:00.000Z", billingCents: 124000 })],
    true,
    [],
    [],
    NOW
  );
  assert.equal(same.payment.length, 0);
  assert.equal(same.replies.length, 0);
  assert.equal(same.paid.length, 1);
});

test("le groupe Payé ne propose pas de relance", async () => {
  const inbox = buildHotelInbox(
    [
      request({
        status: "sent",
        turns: [turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false })],
      }),
    ],
    [spend()],
    true,
    [],
    [],
    NOW
  );
  const { HotelInbox } = await inboxView;
  const html = renderToStaticMarkup(createElement(HotelInbox, { inbox }));
  const paidBlock = html.split("Payé · 1")[1] || "";
  assert.match(html, /Payé le/);
  assert.equal(paidBlock.includes("Relancer"), false);
  assert.equal(paidBlock.includes("Répondre"), false);
  assert.equal(html.includes("Paiement Pliant à faire"), false);
});

test("l’agence a écrit en dernier après une vraie réponse : Le reste, replié", async () => {
  const inbox = buildHotelInbox(
    [
      request({
        hotelName: "Park Hyatt Saigon",
        turns: [
          turn({ id: "out-1", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({ id: "in-1", at: "2026-11-02T09:00:00.000Z", direction: "in", body: "Nous avons bien noté votre demande.", link: null }),
          turn({ id: "out-2", at: "2026-11-03T10:00:00.000Z", direction: "out", body: "Merci, c’est noté.", countsAsReply: false }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW
  );
  assert.equal(inbox.rest.length, 1);
  assert.equal(inbox.rest[0]?.lastWriter, "L'agence");
  assert.equal(inbox.payment.length + inbox.replies.length + inbox.unanswered.length + inbox.waiting.length, 0);
  assert.equal(hotelInboxActionCount(inbox), 0);
  const { HotelInbox } = await inboxView;
  const html = renderToStaticMarkup(createElement(HotelInbox, { inbox }));
  assert.match(html, /Le reste · 1/);
  assert.match(html, /Park Hyatt Saigon/);
  assert.equal(/<details class="group\/rest[^"]*" open/.test(html), false);
});

test("une lecture impossible montre le bandeau et n’annonce pas une boîte vide", async () => {
  const inbox = { ...buildHotelInbox([], [], true, [], [], NOW), loadError: HOTEL_INBOX_LOAD_ERROR };
  const { HotelInbox } = await inboxView;
  const html = renderToStaticMarkup(createElement(HotelInbox, { inbox }));
  assert.match(html, /Lecture des courriers impossible, réessayez/);
  assert.equal(html.includes("Rien à traiter pour le moment"), false);
  assert.equal(html.includes("Aucun envoi en attente"), false);
});

test("un fil classé reste dans Le reste", () => {
  const inbox = buildHotelInbox(
    [
      request({
        classifiedAt: "2026-11-10T09:00:00.000Z",
        turns: [
          turn({ id: "out", at: "2026-11-01T08:00:00.000Z", direction: "out", body: "Bonjour", countsAsReply: false }),
          turn({ id: "in", at: "2026-11-02T09:00:00.000Z", direction: "in", body: "Bien reçu, merci.", link: null }),
        ],
      }),
    ],
    [],
    true,
    [],
    [],
    NOW
  );
  assert.equal(inbox.rest.length, 1);
  assert.equal(inbox.payment.length, 0);
  assert.equal(inbox.replies.length, 0);
});
