import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RecentMails } from "../../components/admin/RecentMails";
import {
  DASHBOARD_MAIL_PREVIEW,
  dashboardCourriers,
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
    replyBody: "L’upgrade est confirmé.",
    hotelName: "Casa Monti",
    itemTitle: "Suite",
    reference: "TB-1042",
    replies: [
      {
        id: "reply-1",
        body: "L’upgrade est confirmé.",
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

test("le tableau ne garde que les courriers partis, le plus récent d’abord", () => {
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
    true
  );
  assert.deepEqual(
    lines.map((line) => line.id),
    ["attente", "upgrade", "lien"]
  );
  assert.equal(lines[1]?.mark, "Upgrade et accueil");
  assert.equal(lines[1]?.replyLabel, "Réponse reçue");
  assert.equal(lines[1]?.detail, "TB-1042 · L’upgrade est confirmé.");
  assert.equal(lines[1]?.href, "/admin/reservations/booking-1?hotel=item-1");
  assert.equal(lines[0]?.replyState, "waiting");
  assert.equal(lines[0]?.replyLabel, "Sans réponse");
  assert.equal(lines[0]?.href, "/admin/reservations/booking-1?hotel=item-1&relance=attente");
  assert.equal(lines[0]?.detail, "TB-1042");
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
    true
  );
  assert.equal(line?.replyState, "waiting");
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
  assert.equal(line?.replyLabel, "Réponse reçue");
  assert.equal(line?.detail, "TB-1042 · Bien reçu.");
});

test("le lien de paiement dit si la carte de l’hôtel a été débitée", () => {
  const paid = dashboardCourriers(
    [courrier({ id: "lien", kind: "payment_link", itemId: "stay-1" })],
    [spend({ bookingItemId: "stay-1", billingCents: "18650" })],
    true
  );
  assert.equal(paid[0]?.paymentState, "paid");
  assert.match(paid[0]?.paymentLabel || "", /Paiement Pliant effectué/);
  assert.match(paid[0]?.paymentLabel || "", /186,50/);
  assert.match(paid[0]?.paymentLabel || "", /14 oct\. 2026/);

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
  assert.equal(byRequest[0]?.paymentState, "paid");
  assert.match(byRequest[0]?.paymentLabel || "", /50,00/);
});

test("refus, attente, remboursement et un autre hôtel ne comptent pas comme un paiement", () => {
  assert.equal(
    latestHotelPliantPayment([spend({ status: "DECLINED" }), spend({ transactionId: "rev", status: "REVERSED" })]),
    null
  );
  assert.equal(latestHotelPliantPayment([spend({ status: "PENDING" })]), null);
  assert.equal(latestHotelPliantPayment([spend({ type: "REFUND", billingCents: 18650 })]), null);
  assert.equal(latestHotelPliantPayment([spend({ type: "STATUS_INQUIRY", status: "CONFIRMED" })]), null);
  assert.equal(latestHotelPliantPayment([spend({ billingCents: 0 })]), null);
  const latest = latestHotelPliantPayment([
    spend({ transactionId: "old", bookedAt: "2026-10-01T00:00:00.000Z", billingCents: 1000 }),
    spend({ transactionId: "new", bookedAt: "2026-10-18T00:00:00.000Z", billingCents: 2500 }),
  ]);
  assert.equal(latest?.amount, 25);
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
  assert.match(html, /Réponse reçue/);
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
  assert.match(html, /Aucun courrier d’hôtel envoyé pour le moment/);
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
  const [mail] = dashboardCourriers([courrier({ kind: "payment_link" })], [spend()], true);
  const html = renderToStaticMarkup(createElement(RecentMails, { mails: [mail!] }));
  assert.match(html, /Paiement Pliant effectué/);
  assert.match(html, /max-w-full break-words/);
  assert.equal(html.includes("Pas de paiement Pliant"), false);
  const unpaid = dashboardCourriers([courrier({ kind: "payment_link" })], [], true);
  const unpaidHtml = renderToStaticMarkup(createElement(RecentMails, { mails: unpaid }));
  assert.match(unpaidHtml, /Pas de paiement Pliant/);
});
