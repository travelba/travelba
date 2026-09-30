import assert from "node:assert/strict";
import test from "node:test";
import {
  cardSendNote,
  containsCardNumber,
  HOTEL_DESK_FROM,
  gmailAfterDate,
  gmailSubjectClause,
  hotelMailSubjectKey,
  hotelReplyForDesk,
  hotelReplyLink,
  hotelReplySearchQueries,
  deskNeedsAttention,
  hotelDeskDraft,
  deskRoster,
  hotelDeskRecipients,
  mergeDeskContacts,
  hotelDeskSuggested,
  hotelsNeedingDesk,
  keepAgencyDraft,
  nextDeskMark,
  outboundHotelLetter,
  replyMatchesHotel,
  replyMatchesRequest,
  transferCues,
} from "./hotel-desk";
import { paymentUrlFromText } from "./hotel-arrival";
import type { CrmBookingItem } from "./types";

function hotel(patch: Partial<CrmBookingItem> = {}): CrmBookingItem {
  return {
    id: "item-hotel",
    booking_id: "b1",
    kind: "hotel",
    title: "Le Bristol",
    supplier: "",
    confirmation_ref: "HB-9",
    start_at: "2026-11-04",
    end_at: "2026-11-08",
    amount: 2400,
    include_in_ledger: false,
    sort_order: 0,
    details: { hotel_name: "Le Bristol", country: "France", email: "reservations@bristol.test" },
    visible_to_client: false,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...patch,
  };
}

const base = {
  items: [] as CrmBookingItem[],
  reference: "TBA-1",
  guest: "Camille Martin",
  currency: "EUR",
  holidays: [] as string[],
};

test("lien et full credit non proposés pour Expedia", () => {
  assert.equal(hotelDeskSuggested("payment_link", "expedia"), false);
  assert.equal(hotelDeskSuggested("full_credit", "expedia"), false);
  assert.equal(hotelDeskSuggested("upgrade", "expedia"), true);
  assert.equal(hotelDeskSuggested("payment_link", "direct"), true);
});

test("brouillon français : lien, full credit sans numéro, tous les contacts", () => {
  const link = hotelDeskDraft({ ...base, kind: "payment_link", item: hotel() });
  assert.match(link.subject, /HB-9/);
  assert.match(link.body, /lien de paiement/);
  assert.equal(link.dueOn, "2026-11-02");
  assert.equal(link.status, "waiting");
  const credit = hotelDeskDraft({ ...base, kind: "full_credit", item: hotel() });
  assert.match(credit.body, /500 € par nuit/);
  assert.match(credit.body, /déjà réglé/);
  assert.equal(containsCardNumber(credit.body), false);
  const people = hotelDeskRecipients(
    {
      name: "Le Bristol",
      address: "",
      city: "",
      country: "France",
      phone: "",
      email: "reservations@bristol.test",
      website: "",
      people: [
        { type: "Concierge", first_name: "", last_name: "", email: "concierge@bristol.test", phone: "" },
        { type: "Reservations", first_name: "", last_name: "", email: "reservations@bristol.test", phone: "" },
      ],
    },
    "concierge"
  );
  assert.deepEqual(people, ["reservations@bristol.test", "concierge@bristol.test"]);
  const roster = deskRoster({
    name: "Le Bristol",
    address: "",
    city: "",
    country: "France",
    phone: "",
    email: "reservations@bristol.test",
    website: "",
    people: [
      { type: "Concierge", first_name: "", last_name: "", email: "concierge@bristol.test", phone: "" },
      { type: "Directrice", first_name: "Claire", last_name: "Martin", email: "claire@bristol.test", phone: "" },
      { type: "Réservations", first_name: "C.", last_name: "Martin", email: "claire@bristol.test", phone: "" },
    ],
  });
  assert.deepEqual(roster, [
    { email: "reservations@bristol.test", firstName: "", lastName: "", role: "" },
    { email: "concierge@bristol.test", firstName: "", lastName: "", role: "Concierge" },
    { email: "claire@bristol.test", firstName: "Claire", lastName: "Martin", role: "Directrice" },
  ]);
  assert.equal(
    mergeDeskContacts([{ email: "claire@bristol.test", type: "Directrice" }], [
      { email: "claire@bristol.test", firstName: "Claire", lastName: "Martin", role: "Directrice" },
      { email: "nouveau@bristol.test", firstName: "Paul", lastName: "Bernard", role: "Directeur" },
    ]).length,
    2
  );
});

test("anglais hors de France, transfert repris sur les vols", () => {
  const item = hotel({
    details: { hotel_name: "The Leela", country: "India", email: "stay@leela.test" },
  });
  const upgrade = hotelDeskDraft({ ...base, kind: "upgrade", item });
  assert.match(upgrade.body, /Dear team/);
  assert.match(upgrade.body, /VIP welcome amenities/);
  assert.match(upgrade.body, /Best regards/);
  assert.equal(upgrade.lang, "en");
  const flights: CrmBookingItem[] = [
    {
      ...hotel(),
      id: "in",
      kind: "flight",
      title: "Aller",
      start_at: "2026-11-04T09:40:00",
      end_at: "2026-11-04T18:00:00",
      details: { flight_number: "AF192", from: "CDG", to: "BOM" },
    },
    {
      ...hotel(),
      id: "out",
      kind: "flight",
      title: "Retour",
      start_at: "2026-11-08T22:10:00",
      details: { flight_number: "AF193", from: "BOM", to: "CDG" },
    },
  ];
  const cues = transferCues(flights, item, "fr");
  assert.match(cues.arrival, /AF192/);
  assert.match(cues.departure, /AF193/);
  const transfer = hotelDeskDraft({ ...base, kind: "transfer", item: hotel(), items: flights });
  assert.match(transfer.body, /AF192/);
});

test("une modification agence n'est pas écrasée", () => {
  const fresh = { subject: "Nouveau", body: "Modèle", recipients: ["a@hotel.test"] };
  const kept = keepAgencyDraft(
    { edited: true, status: "draft", subject: "Le mien", body: "Mon texte", recipients: ["desk@hotel.test"] },
    fresh
  );
  assert.equal(kept.subject, "Le mien");
  assert.equal(kept.body, "Mon texte");
  const refreshed = keepAgencyDraft(
    { edited: false, status: "waiting", subject: "Ancien", body: "Ancien", recipients: ["a@hotel.test"] },
    fresh
  );
  assert.equal(refreshed.subject, "Nouveau");
});

test("échéance, relance et réponse", () => {
  assert.equal(deskNeedsAttention({ status: "waiting", due_on: "2026-11-02" }, "2026-11-02"), true);
  assert.equal(deskNeedsAttention({ status: "waiting", due_on: "2026-11-02" }, "2026-11-01"), false);
  assert.equal(hotelsNeedingDesk([{ booking_item_id: "h1", status: "due", due_on: null }, { booking_item_id: "h1", status: "follow_up", due_on: null }, { booking_item_id: "h2", status: "sent", due_on: null }], "2026-11-02"), 1);
  const sent = Date.parse("2026-11-02T08:00:00.000Z");
  assert.equal(
    nextDeskMark({
      status: "sent",
      dueOn: "2026-11-02",
      parisToday: "2026-11-02",
      sentAtMs: sent,
      followUpCount: 0,
      lastFollowUpAtMs: null,
      nowMs: sent + 60_000,
      holidays: [],
    }),
    null
  );
  assert.equal(
    nextDeskMark({
      status: "sent",
      dueOn: "2026-11-02",
      parisToday: "2026-11-02",
      sentAtMs: sent,
      followUpCount: 0,
      lastFollowUpAtMs: null,
      nowMs: sent + 4 * 60 * 60 * 1000,
      holidays: [],
    }),
    "follow_up"
  );
  assert.equal(
    replyMatchesHotel({
      from: "Reservations <reservations@bristol.test>",
      receivedAtMs: sent + 1000,
      sentAtMs: sent,
      hotelEmails: ["reservations@bristol.test"],
    }),
    true
  );
  assert.equal(
    replyMatchesHotel({
      from: "other@hotel.test",
      receivedAtMs: sent + 1000,
      sentAtMs: sent,
      hotelEmails: ["reservations@bristol.test"],
    }),
    false
  );
});

test("la réponse hôtel reste dans le dossier, sans numéro de carte", () => {
  assert.equal(HOTEL_DESK_FROM, "contact@travelba.fr");
  const kept = hotelReplyForDesk("Bonjour,\nLe lien de paiement est prêt.\nBien à vous");
  assert.match(kept, /lien de paiement/);
  const stripped = hotelReplyForDesk(
    [
      "Le lien :",
      "https://pay.hotel.test/abc",
      "Numéro de réservation : MH-240",
      "Numéro : 4242 4242 4242 4242",
      "Cryptogramme : 123",
      "Merci.",
    ].join("\n")
  );
  assert.match(stripped, /pay.hotel.test/);
  assert.match(stripped, /MH-240/);
  assert.match(stripped, /Merci/);
  assert.equal(containsCardNumber(stripped), false);
  assert.equal(stripped.includes("4242"), false);
  assert.equal(stripped.toLowerCase().includes("cryptogramme"), false);
});

test("une autre boîte de l'hôtel répond au bon courrier", () => {
  const sent = Date.parse("2026-09-30T16:00:00Z");
  const subject = "Payment link — Le Bristol — HB-9";
  assert.equal(
    replyMatchesRequest({
      from: "Front desk <desk@bristol.test>",
      subject: "Re: Payment link — Le Bristol — HB-9",
      receivedAtMs: sent + 60_000,
      sentAtMs: sent,
      requestSubject: subject,
    }),
    true
  );
  assert.equal(
    replyMatchesRequest({
      from: "desk@bristol.test",
      subject: "Re: Follow-up — Payment link — Le Bristol — HB-9",
      receivedAtMs: sent + 60_000,
      sentAtMs: sent,
      requestSubject: "Follow-up — Payment link — Le Bristol — HB-9",
    }),
    true
  );
  assert.equal(hotelMailSubjectKey("Re: Fwd: Relance — Lien de paiement — Le Bristol — HB-9"), "lien de paiement - le bristol - hb-9");
  assert.equal(
    replyMatchesRequest({
      from: "desk@bristol.test",
      subject: "Re: Payment link - Le Bristol - HB-9",
      receivedAtMs: sent + 60_000,
      sentAtMs: sent,
      requestSubject: subject,
    }),
    true
  );
  assert.equal(
    replyMatchesRequest({
      from: "desk@bristol.test",
      subject: "Re: VIP welcome — Le Bristol — HB-9",
      receivedAtMs: sent + 60_000,
      sentAtMs: sent,
      requestSubject: subject,
    }),
    false
  );
  assert.equal(
    replyMatchesRequest({
      from: "Travel Business Agency <contact@travelba.fr>",
      subject: "Re: Payment link — Le Bristol — HB-9",
      receivedAtMs: sent + 60_000,
      sentAtMs: sent,
      requestSubject: subject,
    }),
    false
  );
  assert.equal(
    replyMatchesRequest({
      from: "agent@travelba.fr",
      subject,
      receivedAtMs: sent + 60_000,
      sentAtMs: sent,
      requestSubject: subject,
    }),
    false
  );
  const created = sent - 5 * 60 * 60 * 1000;
  const relance = sent + 5 * 60 * 60 * 1000;
  assert.equal(
    replyMatchesRequest({
      from: "desk@bristol.test",
      subject,
      receivedAtMs: sent + 60_000,
      sentAtMs: relance,
      createdAtMs: created,
      followUpCount: 1,
      requestSubject: subject,
    }),
    true
  );
  assert.equal(
    replyMatchesRequest({
      from: "desk@bristol.test",
      subject,
      receivedAtMs: sent - 60_000,
      sentAtMs: sent,
      requestSubject: subject,
    }),
    false
  );
});

test("la réponse garde le lien d'autorisation et retire la citation", () => {
  const body = [
    "Dear team,",
    "",
    "The link is ready:",
    "https://www.hotel.test",
    "https://secure.hotel.test/authorizations/stay-1",
    "",
    "On Tue, 30 Sep 2026, Travel Business Agency <contact@travelba.fr> wrote:",
    "> Could you please send us the payment link",
    "> Numéro : 4242 4242 4242 4242",
  ].join("\n");
  const kept = hotelReplyForDesk(body);
  assert.match(kept, /authorizations\/stay-1/);
  assert.match(kept, /www\.hotel\.test/);
  assert.equal(kept.includes("payment link"), false);
  assert.equal(kept.includes("4242"), false);
  assert.equal(hotelReplyLink(kept), "https://secure.hotel.test/authorizations/stay-1");
  assert.equal(paymentUrlFromText("https://www.hotel.test\nhttps://secure.hotel.test/authorizations/stay-1"), "https://secure.hotel.test/authorizations/stay-1");
  assert.equal(hotelReplyLink("See https://www.hotel.test"), null);
  const french = hotelReplyForDesk(
    ["Le lien est prêt.", "Le mar. 30 sept. 2026, l'hôtel a écrit :", "> Merci de renvoyer le courrier."].join("\n")
  );
  assert.match(french, /lien est prêt/);
  assert.equal(french.includes("renvoyer"), false);
  assert.equal(gmailAfterDate(Date.parse("2026-09-30T16:00:00Z")), "2026/09/29");
  assert.equal(gmailSubjectClause("Follow-up — Payment link — Le Bristol — HB-9"), 'subject:"Payment link — Le Bristol — HB-9"');
  const queries = hotelReplySearchQueries({
    subject: "Payment link — Le Bristol — HB-9",
    emails: ["Reservations <reservations@bristol.test>", "not an email"],
    after: "2026/09/29",
  });
  assert.match(queries[0] || "", /subject:"Payment link — Le Bristol — HB-9"/);
  assert.match(queries[1] || "", /from:reservations@bristol\.test/);
  assert.equal((queries[1] || "").includes("not"), false);
});

test("la carte n'entre pas dans le brouillon", () => {
  assert.equal(containsCardNumber("4242 4242 4242 4242"), true);
  const note = cardSendNote("pliant", "fr");
  const stored = "Les documents d'identité sont joints.";
  assert.equal(containsCardNumber(stored), false);
  assert.equal(containsCardNumber(outboundHotelLetter(stored, note)), false);
  assert.match(note, /jointe/);
  assert.match(cardSendNote("client", "fr"), /jointe/);
  assert.equal(note.includes("4242"), false);
});
