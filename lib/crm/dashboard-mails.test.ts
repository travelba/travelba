import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentMails } from "../../components/admin/RecentMails";
import {
  DASHBOARD_MAIL_PREVIEW,
  dashboardCourriers,
  dossierCardSpendCounts,
  latestHotelPliantPayment,
  type HotelCourrierSource,
  type HotelPliantSpend,
} from "./hotel-courrier-board";

function courrier(patch: Partial<HotelCourrierSource> = {}): HotelCourrierSource {
  return {
    id: "letter-1",
    bookingId: "booking-1",
    itemId: "item-1",
    kind: "upgrade",
    status: "replied",
    sentAt: "2026-10-05T08:00:00.000Z",
    lastFollowUpAt: null,
    repliedAt: "2026-10-06T12:00:00.000Z",
    replyBody: "Bien reçu, nous préparons la chambre.",
    hotelName: "Casa Monti",
    itemTitle: "Suite",
    reference: "TB-1042",
    replies: [
      {
        id: "reply-1",
        body: "Bien reçu, nous préparons la chambre.",
        receivedAt: "2026-10-06T12:00:00.000Z",
      },
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
    billingCents: 18650,
    billingCurrency: "EUR",
    bookedAt: "2026-10-14T09:30:00.000Z",
    ...patch,
  };
}

test("le tableau garde les courriers à traiter, l’hôtel d’abord", () => {
  const lines = dashboardCourriers(
    [
      courrier({ id: "upgrade", status: "replied", kind: "upgrade" }),
      courrier({
        id: "attente",
        status: "sent",
        kind: "precheckin",
        sentAt: "2026-10-12T09:00:00.000Z",
        repliedAt: null,
        replyBody: "",
        replies: [],
        hotelName: "The NoMad",
      }),
      courrier({ id: "brouillon", status: "draft", kind: "upgrade", sentAt: null, replies: [] }),
      courrier({ id: "inconnu", status: "sent", kind: "expedia", sentAt: "2026-10-13T09:00:00.000Z" }),
      courrier({
        id: "lien",
        status: "replied",
        kind: "payment_link",
        repliedAt: "2026-10-05T09:00:00.000Z",
        replies: [{ id: "r-lien", body: "Voici le lien.", receivedAt: "2026-10-05T09:00:00.000Z" }],
      }),
    ],
    [],
    true,
    Date.parse("2026-10-29T12:00:00.000Z")
  );
  assert.deepEqual(
    lines.map((line) => line.id),
    ["upgrade", "lien", "attente"]
  );
  assert.equal(lines[0]?.mark, "Upgrade et accueil");
  assert.equal(lines[0]?.replyLabel, "Réponse à traiter");
  assert.equal(lines[0]?.lastWriter, "L'hôtel");
  assert.equal(lines[0]?.detail, "TB-1042 · Bien reçu, nous préparons la chambre.");
  assert.equal(lines[1]?.href, "/admin/reservations/booking-1?hotel=item-1");
  const waiting = lines.find((line) => line.id === "attente");
  assert.equal(waiting?.replyState, "silent");
  assert.equal(waiting?.replyLabel, "Sans réponse");
  assert.equal(waiting?.lastWriter, "L'agence");
  assert.equal(waiting?.href, "/admin/reservations/booking-1?hotel=item-1&relance=attente");
  assert.equal(waiting?.detail, "TB-1042");
  assert.equal(lines[0]?.paymentState, "hidden");
  assert.equal(lines.some((line) => line.mark === "Expedia TAAP"), false);
});

test("deux réponses du même courrier ne font qu’une ligne, la plus récente", () => {
  const [line] = dashboardCourriers(
    [
      courrier({
        replyBody: "ancien",
        replies: [
          { id: "old", body: "Première réponse.", receivedAt: "2026-10-06T08:00:00.000Z" },
          { id: "new", body: "Le lien est prêt.", receivedAt: "2026-10-07T08:00:00.000Z" },
        ],
      }),
    ],
    [],
    true
  );
  assert.equal(line?.detail, "TB-1042 · Le lien est prêt.");
  assert.equal(line?.receivedAt, "2026-10-07T08:00:00.000Z");
});

test("une relance sans réponse reste en attente, à la date de relance", () => {
  const [line] = dashboardCourriers(
    [
      courrier({
        status: "follow_up",
        repliedAt: null,
        replyBody: "",
        replies: [],
        sentAt: "2026-10-01T08:00:00.000Z",
        lastFollowUpAt: "2026-10-08T08:00:00.000Z",
      }),
    ],
    [],
    true,
    Date.parse("2026-10-08T10:00:00.000Z")
  );
  assert.equal(line?.replyState, "waiting");
  assert.equal(line?.lastWriter, "L'agence");
  assert.equal(line?.receivedAt, "2026-10-08T08:00:00.000Z");
});

test("un message qui compte vaut une réponse même si le statut n’a pas suivi", () => {
  const [line] = dashboardCourriers(
    [
      courrier({
        status: "sent",
        repliedAt: null,
        replyBody: "",
        replies: [{ id: "late", body: "Bien reçu.", receivedAt: "2026-10-09T10:00:00.000Z" }],
      }),
    ],
    [],
    true
  );
  assert.equal(line?.replyLabel, "Réponse à traiter");
  assert.equal(line?.lastWriter, "L'hôtel");
  assert.equal(line?.detail, "TB-1042 · Bien reçu.");
});

test("le lien de paiement sort s’il est payé, et le dit s’il ne l’est pas", () => {
  const paid = dashboardCourriers(
    [courrier({ id: "lien", kind: "payment_link", itemId: "stay-1" })],
    [spend({ bookingItemId: "stay-1", billingCents: "18650" })],
    true
  );
  assert.deepEqual(paid, []);

  const otherHotel = dashboardCourriers(
    [courrier({ id: "lien", kind: "payment_link", itemId: "stay-1" })],
    [spend({ bookingItemId: "stay-2" })],
    true
  );
  assert.equal(otherHotel[0]?.paymentState, "unpaid");
  assert.equal(otherHotel[0]?.paymentLabel, "Pas de paiement Pliant");

  const byRequest = dashboardCourriers(
    [courrier({ id: "lien", kind: "payment_link", itemId: "stay-9" })],
    [spend({ bookingItemId: null, hotelRequestId: "lien", billingCents: 5000, bookedAt: "2026-10-02" })],
    true
  );
  assert.deepEqual(byRequest, []);

  const asked = dashboardCourriers(
    [
      courrier({
        id: "lien",
        kind: "payment_link",
        itemId: "stay-1",
        replies: [{ id: "ask", body: "Le règlement est passé. Pouvez-vous confirmer l’heure d’arrivée ?", receivedAt: "2026-10-15T09:00:00.000Z" }],
      }),
    ],
    [spend({ bookingItemId: "stay-1" })],
    true
  );
  assert.equal(asked[0]?.replyLabel, "Réponse à traiter");
  assert.match(asked[0]?.paymentLabel || "", /Paiement Pliant effectué/);
  assert.match(asked[0]?.paymentLabel || "", /186,50/);

  const paidBeforeTheLink = dashboardCourriers(
    [
      courrier({
        id: "adyen",
        kind: "payment_link",
        itemId: "stay-1",
        replies: [
          {
            id: "link",
            body: "Please use this Adyen link to complete the payment.",
            receivedAt: "2026-10-14T08:00:00.000Z",
          },
        ],
      }),
    ],
    [spend({ bookingItemId: "stay-1", billingCents: 136775, bookedAt: "2026-10-17T10:00:00.000Z" })],
    true
  );
  assert.deepEqual(paidBeforeTheLink, []);

  const askedBeforePay = dashboardCourriers(
    [
      courrier({
        id: "avant",
        kind: "payment_link",
        itemId: "stay-1",
        replies: [
          {
            id: "q",
            body: "Pouvez-vous confirmer le nom du client ?",
            receivedAt: "2026-10-13T08:00:00.000Z",
          },
        ],
      }),
    ],
    [spend({ bookingItemId: "stay-1", bookedAt: "2026-10-17T10:00:00.000Z" })],
    true
  );
  assert.deepEqual(askedBeforePay, []);
});

test("refus, annulation, remboursement et un autre hôtel ne comptent pas comme un paiement", () => {
  assert.equal(
    latestHotelPliantPayment([spend({ status: "DECLINED" }), spend({ transactionId: "rev", status: "REVERSED" })]),
    null
  );
  assert.equal(latestHotelPliantPayment([spend({ type: "REFUND", billingCents: 18650 })]), null);
  assert.equal(latestHotelPliantPayment([spend({ type: "STATUS_INQUIRY", status: "CONFIRMED" })]), null);
  assert.equal(latestHotelPliantPayment([spend({ billingCents: 0 })]), null);
  const pending = latestHotelPliantPayment([spend({ status: "PENDING", billingCents: 299623 })]);
  assert.equal(pending?.state, "authorized");
  assert.equal(pending?.amount, 2996.23);
  const latest = latestHotelPliantPayment([
    spend({ transactionId: "old", bookedAt: "2026-10-01T00:00:00.000Z", billingCents: 1000 }),
    spend({ transactionId: "new", bookedAt: "2026-10-18T00:00:00.000Z", billingCents: 2500 }),
  ]);
  assert.equal(latest?.state, "settled");
  assert.equal(latest?.amount, 25);
  const settledWins = latestHotelPliantPayment([
    spend({ transactionId: "auth", status: "PENDING", bookedAt: "2026-10-18T00:00:00.000Z", billingCents: 1000 }),
    spend({ transactionId: "done", status: "CONFIRMED", bookedAt: "2026-10-18T00:00:00.000Z", billingCents: 2500 }),
  ]);
  assert.equal(settledWins?.state, "settled");
  assert.equal(settledWins?.amount, 25);
});

test("une autorisation Pliant se dit autorisée, un achat soldé se dit effectué", () => {
  const asked = {
    id: "lien",
    kind: "payment_link" as const,
    itemId: "stay-1",
    replies: [
      {
        id: "ask",
        body: "Le règlement est passé. Pouvez-vous confirmer l’heure d’arrivée ?",
        receivedAt: "2026-10-15T09:00:00.000Z",
      },
    ],
  };
  const [authorized] = dashboardCourriers(
    [courrier(asked)],
    [spend({ status: "PENDING", billingCents: 299623, bookingItemId: "stay-1" })],
    true
  );
  assert.equal(authorized?.paymentState, "paid");
  assert.match(authorized?.paymentLabel || "", /Paiement Pliant autorisé/);
  assert.match(authorized?.paymentLabel || "", /2\s?996,23/);
  assert.match(authorized?.paymentLabel || "", /14 oct/);

  const [settled] = dashboardCourriers(
    [courrier(asked)],
    [spend({ status: "CONFIRMED", bookingItemId: "stay-1" })],
    true
  );
  assert.match(settled?.paymentLabel || "", /Paiement Pliant effectué/);

  const closed = dashboardCourriers(
    [courrier({ id: "lien", kind: "payment_link", itemId: "stay-1" })],
    [spend({ status: "PENDING", bookingItemId: "stay-1" })],
    true
  );
  assert.deepEqual(closed, []);
});

test("une carte du dossier compte pour l’unique hôtel, pas quand deux hôtels restent ambigus", () => {
  const question = [
    {
      id: "ask",
      body: "Le lien est prêt. Pouvez-vous confirmer le nom ?",
      receivedAt: "2026-10-15T09:00:00.000Z",
    },
  ];
  const dossierSpend = spend({
    bookingItemId: null,
    bookingId: "booking-1",
    status: "PENDING",
    billingCents: 299623,
    cardPurpose: "Martin – The David Kempinski Tel Aviv – TB-2026-0170",
    costItemId: "expense-bridge",
  });
  const [single] = dashboardCourriers(
    [
      courrier({
        id: "lien",
        kind: "payment_link",
        itemId: "stay-1",
        hotelName: "The David Kempinski Tel Aviv",
        bookingId: "booking-1",
        hotelCount: 1,
        replies: question,
      }),
    ],
    [dossierSpend],
    true
  );
  assert.match(single?.paymentLabel || "", /Paiement Pliant autorisé/);

  const duringTheStay = Date.parse("2026-10-20T12:00:00.000Z");
  const [ambiguous] = dashboardCourriers(
    [
      courrier({
        id: "lien",
        kind: "payment_link",
        itemId: "stay-1",
        hotelName: "The David Kempinski Tel Aviv",
        bookingId: "booking-1",
        hotelCount: 2,
        siblingItemIds: ["stay-2"],
        siblingHotelNames: ["The Setai Tel Aviv"],
        stayStart: "2026-11-01",
        itemEnd: "2026-11-05",
        stayAmountCents: 299623,
        stayAmountCurrency: "EUR",
        replies: question,
      }),
    ],
    [spend({ ...dossierSpend, cardPurpose: "Visa", bookedAt: "2026-10-20T09:00:00.000Z" })],
    true,
    duringTheStay
  );
  assert.equal(ambiguous?.paymentLabel, "Pas de paiement Pliant");
  assert.equal(
    dossierCardSpendCounts(
      courrier({
        itemId: "stay-1",
        hotelName: "The David Kempinski Tel Aviv",
        bookingId: "booking-1",
        hotelCount: 2,
        siblingHotelNames: ["The Setai Tel Aviv"],
      }),
      dossierSpend
    ),
    false
  );

  const [named] = dashboardCourriers(
    [
      courrier({
        id: "lien",
        kind: "payment_link",
        itemId: "stay-1",
        hotelName: "The David Kempinski Tel Aviv",
        bookingId: "booking-1",
        hotelCount: 2,
        siblingItemIds: ["stay-2"],
        siblingHotelNames: ["The Setai Tel Aviv"],
        stayStart: "2026-11-01",
        itemEnd: "2026-11-05",
        stayAmountCents: 299623,
        stayAmountCurrency: "EUR",
        replies: question,
      }),
    ],
    [spend({ ...dossierSpend, bookedAt: "2026-10-14T09:00:00.000Z" })],
    true,
    duringTheStay
  );
  assert.match(named?.paymentLabel || "", /Paiement Pliant autorisé/);

  const [other] = dashboardCourriers(
    [
      courrier({
        id: "autre",
        kind: "payment_link",
        itemId: "stay-2",
        hotelName: "The Setai Tel Aviv",
        bookingId: "booking-1",
        hotelCount: 2,
        siblingItemIds: ["stay-1"],
        siblingHotelNames: ["The David Kempinski Tel Aviv"],
        stayStart: "2026-11-06",
        itemEnd: "2026-11-08",
        stayAmountCents: 120000,
        stayAmountCurrency: "EUR",
        replies: question,
      }),
    ],
    [spend({ ...dossierSpend, bookedAt: "2026-10-20T09:00:00.000Z" })],
    true,
    duringTheStay
  );
  assert.equal(other?.paymentLabel, "Pas de paiement Pliant");

  const [onTheLine] = dashboardCourriers(
    [
      courrier({
        id: "ligne",
        kind: "payment_link",
        itemId: "stay-2",
        hotelName: "The Setai Tel Aviv",
        bookingId: "booking-1",
        hotelCount: 2,
        siblingItemIds: ["stay-1"],
        siblingHotelNames: ["The David Kempinski Tel Aviv"],
        replies: question,
      }),
    ],
    [spend({ ...dossierSpend, costItemId: "stay-2", cardPurpose: "Visa" })],
    true
  );
  assert.match(onTheLine?.paymentLabel || "", /Paiement Pliant autorisé/);
});

test("sans lecture Pliant, on n’écrit pas qu’il n’y a pas eu de paiement", () => {
  const [line] = dashboardCourriers([courrier({ kind: "payment_link" })], [], false);
  assert.equal(line?.paymentState, "hidden");
  assert.equal(line?.paymentLabel, null);
});

test("la liste montre trois courriers et replie le reste", () => {
  assert.equal(DASHBOARD_MAIL_PREVIEW, 3);
  const mails = dashboardCourriers(
    ["Casa Monti", "Fairmont", "NoMad", "Méridien"].map((hotel, index) =>
      courrier({
        id: `letter-${index}`,
        hotelName: hotel,
        sentAt: `2026-10-0${index + 1}T08:00:00.000Z`,
        repliedAt: `2026-10-1${index}T08:00:00.000Z`,
        replies: [{ id: `reply-${index}`, body: "Bien reçu.", receivedAt: `2026-10-1${index}T08:00:00.000Z` }],
      })
    ),
    [],
    true
  );
  const html = renderToStaticMarkup(createElement(RecentMails, { mails }));
  assert.match(html, /Réponses d’hôtel/);
  assert.match(html, /Courriers envoyés aux hôtels, et leur réponse/);
  assert.match(html, /Réponse à traiter/);
  assert.match(html, /L(?:'|&#x27;)hôtel/);
  assert.match(html, /Bien reçu/);
  assert.match(html, /Voir plus/);
  assert.match(html, /Voir moins/);
  assert.match(html, /flex-col items-start/);
  assert.match(html, /break-words/);
  const detailsAt = html.indexOf("<details");
  assert.ok(detailsAt > html.indexOf("Méridien"));
  assert.ok(detailsAt < html.indexOf("Casa Monti"));
  assert.equal(html.includes("Expedia"), false);
});

test("trois courriers ou moins n’affichent pas Voir plus", () => {
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: dashboardCourriers([courrier()], [], true) }));
  assert.equal(html.includes("Voir plus"), false);
  assert.match(html, /Casa Monti/);
  assert.match(html, /Upgrade et accueil/);
});

test("sans courrier, la liste le dit", () => {
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: [] }));
  assert.match(html, /Rien à traiter pour le moment/);
});

test("une relance de moins de 48 h reste en attente, au-delà elle est sans réponse", () => {
  const now = Date.parse("2026-10-08T10:00:00.000Z");
  const [fresh] = dashboardCourriers(
    [
      courrier({
        status: "sent",
        sentAt: "2026-10-08T08:00:00.000Z",
        repliedAt: null,
        replyBody: "",
        replies: [],
        followUpCount: 0,
      }),
    ],
    [],
    true,
    now
  );
  assert.equal(fresh?.replyLabel, "En attente de réponse");
  assert.equal(fresh?.followUpLabel, null);

  const [old] = dashboardCourriers(
    [
      courrier({
        status: "follow_up",
        sentAt: "2026-10-01T08:00:00.000Z",
        lastFollowUpAt: "2026-10-08T08:00:00.000Z",
        repliedAt: null,
        replyBody: "",
        replies: [],
        followUpCount: 2,
      }),
    ],
    [],
    true,
    Date.parse("2026-10-12T08:00:00.000Z")
  );
  assert.equal(old?.replyLabel, "Sans réponse");
  assert.equal(old?.followUpLabel, "2 relances");
  assert.match(old?.href || "", /relance=/);
});

test("le paiement s’affiche sous le titre, pas à côté", () => {
  const [mail] = dashboardCourriers(
    [
      courrier({
        kind: "payment_link",
        replies: [{ id: "ask", body: "Le règlement est passé. Pouvez-vous confirmer l’heure ?", receivedAt: "2026-10-15T09:00:00.000Z" }],
      }),
    ],
    [spend()],
    true
  );
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: [mail!] }));
  assert.match(html, /Paiement Pliant effectué/);
  assert.match(html, /max-w-full break-words/);
  assert.equal(html.includes("Pas de paiement Pliant"), false);
  const unpaid = dashboardCourriers([courrier({ kind: "payment_link" })], [], true);
  const unpaidHtml = renderToStaticMarkup(createElement(RecentMails, { mails: unpaid }));
  assert.match(unpaidHtml, /Pas de paiement Pliant/);
});

test("une réponse de l’agence dans Gmail retire le courrier", () => {
  const lines = dashboardCourriers(
    [
      courrier({
        turns: [
          { id: "out", at: "2026-10-05T08:00:00.000Z", direction: "out", body: "Pourriez-vous envoyer le lien ?", countsAsReply: false },
          { id: "in", at: "2026-10-06T12:00:00.000Z", direction: "in", body: "Voici le lien de paiement pour le séjour.", countsAsReply: true },
          { id: "gmail", at: "2026-10-06T15:00:00.000Z", direction: "out", body: "Merci, nous réglons aujourd’hui.", countsAsReply: false },
        ],
      }),
    ],
    [],
    true
  );
  assert.deepEqual(lines, []);
});

test("l’extrait ne montre ni une image cid ni un Hello vide", () => {
  const [line] = dashboardCourriers(
    [
      courrier({
        replies: [
          {
            id: "cid",
            body: "Hello,\n\n[cid:f04a9214-82c1-45e2-bcd8-e1323435a689]\n\nLe transfert est prévu à 18:40.\n\nBest regards,\nDesk",
            receivedAt: "2026-10-06T12:00:00.000Z",
          },
        ],
      }),
    ],
    [],
    true
  );
  assert.equal(line?.excerpt, "Le transfert est prévu à 18:40.");
  assert.equal(line?.excerpt.includes("cid:"), false);
  assert.equal(line?.excerpt.includes("Hello"), false);
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: [line!] }));
  assert.equal(html.includes("[cid:"), false);
  assert.equal(html.includes(">Hello"), false);

  const [empty] = dashboardCourriers(
    [
      courrier({
        replies: [{ id: "hi", body: "Hello,\n[cid:f04a9214-82c1-45e2-bcd8-e1323435a689]", receivedAt: "2026-10-06T12:00:00.000Z" }],
      }),
    ],
    [],
    true
  );
  assert.equal(empty?.replyLabel, "Réponse à traiter");
  assert.equal(empty?.excerpt, "");
  const bare = renderToStaticMarkup(createElement(RecentMails, { mails: [empty!] }));
  assert.equal(bare.includes("Hello"), false);
  assert.equal(bare.includes("cid:"), false);
});

test("confirmation, annulation, paiement dit et séjour passé sortent le courrier", () => {
  const now = Date.parse("2026-10-29T12:00:00.000Z");
  assert.deepEqual(
    dashboardCourriers(
      [courrier({ replies: [{ id: "ok", body: "L’upgrade est confirmé.", receivedAt: "2026-10-06T12:00:00.000Z" }] })],
      [],
      true,
      now
    ),
    []
  );
  assert.deepEqual(
    dashboardCourriers([courrier({ bookingStatus: "cancelled" })], [], true, now),
    []
  );
  assert.deepEqual(
    dashboardCourriers(
      [
        courrier({
          kind: "payment_link",
          replies: [{ id: "paid", body: "The payment has been received. Thank you.", receivedAt: "2026-10-06T12:00:00.000Z" }],
        }),
      ],
      [],
      true,
      now
    ),
    []
  );
  assert.deepEqual(
    dashboardCourriers(
      [
        courrier({
          bookingEnd: "2026-09-01",
          sentAt: "2026-08-20T08:00:00.000Z",
          repliedAt: null,
          replyBody: "",
          replies: [],
          status: "sent",
        }),
      ],
      [],
      true,
      now
    ),
    []
  );
  const linkStillOpen = dashboardCourriers(
    [
      courrier({
        kind: "payment_link",
        replies: [{ id: "link", body: "The booking is confirmed. Here is the payment link.", receivedAt: "2026-10-06T12:00:00.000Z" }],
      }),
    ],
    [],
    true,
    now
  );
  assert.equal(linkStillOpen[0]?.replyLabel, "Réponse à traiter");
  const fresh = dashboardCourriers(
    [
      courrier({
        bookingEnd: "2026-10-20",
        replies: [{ id: "late", body: "Nous avons une question sur l’arrivée.", receivedAt: "2026-10-28T12:00:00.000Z" }],
      }),
    ],
    [],
    true,
    now
  );
  assert.equal(fresh[0]?.replyLabel, "Réponse à traiter");
  assert.equal(fresh[0]?.lastWriter, "L'hôtel");
});

test("un classement manuel prime jusqu’au message entrant suivant", () => {
  const held = dashboardCourriers(
    [
      courrier({
        classifiedAt: "2026-10-18T09:00:00.000Z",
        replies: [{ id: "ask", body: "Please use this Adyen link.", receivedAt: "2026-10-14T08:00:00.000Z" }],
      }),
    ],
    [],
    true
  );
  assert.deepEqual(held, []);

  const reopened = dashboardCourriers(
    [
      courrier({
        classifiedAt: "2026-10-18T09:00:00.000Z",
        replies: [
          { id: "ask", body: "Please use this Adyen link.", receivedAt: "2026-10-14T08:00:00.000Z" },
          { id: "later", body: "Avez-vous reçu notre lien ?", receivedAt: "2026-10-19T08:00:00.000Z" },
        ],
      }),
    ],
    [],
    true
  );
  assert.equal(reopened[0]?.replyLabel, "Réponse à traiter");
  assert.equal(reopened[0]?.lastWriter, "L'hôtel");
});
