import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
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
  hotelMailPieceMatches,
  hotelLetterCaption,
  hotelStayChecklist,
  hotelStayContext,
  hotelThread,
  hotelTripChecklist,
  hotelsNeedingDesk,
  deskStatusLabel,
  keepAgencyDraft,
  knownHotelRecipients,
  hotelSendDefaults,
  hotelSendPeople,
  nextDeskMark,
  nextLetterStatus,
  outboundHotelLetter,
  replyMatchesHotel,
  replyMatchesRequest,
  subjectsToFollow,
  appendSentSubject,
  classifyHotelMail,
  isAutomaticHotelMail,
  transferCues,
} from "./hotel-desk";
import { paymentUrlFromText } from "./hotel-arrival";
import type { CrmBookingItem, CrmHotelMessage, CrmHotelRequest, CrmHotelThreadMessage } from "./types";

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

test("chaque courrier est envoyé, pas besoin, ou encore ouvert", () => {
  const row = (kind: CrmHotelRequest["kind"], status: CrmHotelRequest["status"], item = "h1") => ({
    booking_item_id: item,
    kind,
    status,
  });
  const stay = hotelStayChecklist("h1", [
    row("payment_link", "waiting"),
    row("upgrade", "sent"),
    row("precheckin", "skipped"),
    row("full_credit", "draft"),
    row("transfer", "replied"),
    row("concierge", "follow_up"),
  ]);
  assert.equal(stay.complete, false);
  assert.deepEqual(stay.openTitles, ["Lien de paiement", "Full credit"]);
  assert.equal(stay.summary, "Il reste Lien de paiement et Full credit");
  assert.equal(stay.lines.find((line) => line.kind === "precheckin")?.caption, "Pas besoin");
  assert.equal(stay.lines.find((line) => line.kind === "concierge")?.caption, "Envoyé · à relancer");
  assert.equal(stay.lines.find((line) => line.kind === "transfer")?.mark, "sent");
  assert.equal(hotelLetterCaption("waiting"), "À faire");
  assert.equal(deskStatusLabel({ status: "skipped" }), "Pas besoin");
  const done = hotelStayChecklist("h1", [row("payment_link", "sent"), row("upgrade", "skipped")]);
  assert.equal(done.complete, true);
  assert.equal(done.summary, "Courriers réglés");
  const relance = hotelStayChecklist("h1", [row("payment_link", "follow_up")]);
  assert.equal(relance.complete, true);
  assert.match(relance.summary, /relancer/);
  const trip = hotelTripChecklist([
    row("payment_link", "waiting", "h1"),
    row("upgrade", "sent", "h1"),
    row("payment_link", "sent", "h2"),
    row("upgrade", "skipped", "h2"),
  ]);
  assert.equal(trip.openCount, 1);
  assert.deepEqual(trip.openStays.map((item) => item.itemId), ["h1"]);
  assert.equal(trip.stays.find((item) => item.itemId === "h2")?.complete, true);
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

function letter(patch: Partial<CrmHotelRequest> = {}): CrmHotelRequest {
  return {
    id: "req-1",
    booking_id: "b1",
    booking_item_id: "item-hotel",
    kind: "payment_link",
    status: "sent",
    recipients: ["reservations@bristol.test"],
    subject: "Lien de paiement — Le Bristol — HB-9",
    body: "Pourriez-vous envoyer le lien de paiement ?",
    edited: true,
    card_choice: null,
    attach_passports: false,
    due_on: null,
    sent_at: "2026-09-28T08:00:00.000Z",
    follow_up_count: 0,
    last_follow_up_at: null,
    replied_at: "2026-09-28T14:00:00.000Z",
    reply_from: "Front desk <desk@bristol.test>",
    reply_subject: "Re: Lien de paiement — Le Bristol — HB-9",
    reply_body: "Le lien est prêt.\nhttps://secure.hotel.test/authorizations/stay-1",
    reply_message_id: "gmail-1",
    created_at: "2026-09-28T07:00:00.000Z",
    updated_at: "2026-09-28T14:00:00.000Z",
    ...patch,
  };
}

function note(patch: Partial<CrmHotelMessage> = {}): CrmHotelMessage {
  return {
    id: "msg-1",
    booking_id: "b1",
    booking_item_id: "item-hotel",
    subject: "Le Bristol — HB-9 — 4 novembre 2026",
    body: "La chambre avec vue est-elle possible ?",
    recipients: ["reservations@bristol.test"],
    sent_at: "2026-09-29T09:00:00.000Z",
    reply_from: "",
    reply_subject: "",
    reply_body: "",
    reply_message_id: null,
    replied_at: null,
    created_at: "2026-09-29T09:00:00.000Z",
    updated_at: "2026-09-29T09:00:00.000Z",
    ...patch,
  };
}

test("le fil montre le séjour, les envois et les réponses, sans liste de contacts", () => {
  const stay = hotelStayContext(hotel());
  assert.match(stay.hotel, /Bristol/);
  assert.match(stay.subtitle, /novembre/);
  assert.match(stay.subtitle, /HB-9/);
  assert.match(stay.subject, /Bristol/);
  assert.equal(stay.subject.includes("@"), false);
  const turns = hotelThread({
    item: hotel(),
    requests: [
      letter(),
      letter({ id: "draft", status: "draft", sent_at: null, reply_body: "", replied_at: null, reply_message_id: null }),
    ],
    messages: [note()],
    attached: [
      {
        id: "gmail-1",
        subject: "Re: Lien de paiement — Le Bristol — HB-9",
        from_email: "desk@bristol.test",
        received_at: "2026-09-28T14:00:00.000Z",
        body_text: "Le lien est prêt.",
        extract: { items: [{ kind: "hotel", title: "Le Bristol", confirmation_ref: "HB-9" }] },
      },
      {
        id: "confirm-1",
        subject: "Confirmation Le Bristol",
        from_email: "stay@little.test",
        received_at: "2026-09-01T10:00:00.000Z",
        body_text: "Votre séjour est confirmé.",
        extract: { items: [{ kind: "hotel", details: { hotel_name: "Le Bristol" }, confirmation_ref: "HB-9" }] },
      },
      {
        id: "ticket-1",
        subject: "Billet Camille",
        from_email: "tickets@airline.test",
        received_at: "2026-09-02T10:00:00.000Z",
        body_text: "E-ticket",
        extract: { items: [{ kind: "flight", title: "CDG → FCO" }] },
      },
    ],
  });
  assert.deepEqual(
    turns.map((turn) => turn.label),
    ["Confirmation", "Lien de paiement", "Réponse", "Message"]
  );
  assert.equal(turns[0]?.speaker, "Le Bristol");
  assert.equal(turns[1]?.speaker, "L'agence");
  assert.equal(turns[2]?.speaker, "Le Bristol");
  assert.match(turns[2]?.body || "", /authorizations/);
  assert.equal(turns[2]?.link, "https://secure.hotel.test/authorizations/stay-1");
  assert.equal(turns.some((turn) => turn.id === "mail:gmail-1"), false);
  assert.equal(turns.some((turn) => turn.id === "mail:ticket-1"), false);
  assert.equal(JSON.stringify(turns).includes("@"), false);
  assert.equal(JSON.stringify(turns).includes("desk@"), false);
  assert.deepEqual(knownHotelRecipients(hotel(), [letter()]), ["reservations@bristol.test"]);
});

test("l'envoi coche les adresses prévues et montre les autres contacts", () => {
  const item = hotel({
    details: {
      hotel_name: "Le Bristol",
      country: "France",
      email: "reservations@bristol.test",
      hotel_contacts: [
        { type: "Concierge", first_name: "", last_name: "", email: "concierge@bristol.test" },
        { type: "Directrice", first_name: "Claire", last_name: "Martin", email: "claire@bristol.test" },
      ],
    },
  });
  const requests = [{ booking_item_id: item.id, recipients: ["Reservations@bristol.test"] }];
  const people = hotelSendPeople(item, requests, [
    { booking_item_id: item.id, recipients: ["nouveau@bristol.test"] },
    { booking_item_id: "autre-sejour", recipients: ["ailleurs@hotel.test"] },
  ]);
  assert.deepEqual(
    people.map((person) => person.email),
    ["reservations@bristol.test", "concierge@bristol.test", "claire@bristol.test", "nouveau@bristol.test"]
  );
  assert.equal(people.find((person) => person.email === "claire@bristol.test")?.role, "Directrice");
  assert.deepEqual(hotelSendDefaults(item, requests), ["reservations@bristol.test"]);
  assert.deepEqual(hotelSendDefaults(hotel(), []), ["reservations@bristol.test"]);
});

test("une confirmation Milano rejoint l'hôtel Milan, un mail écarté non", () => {
  const item = hotel({
    confirmation_ref: "",
    details: { hotel_name: "Hotel Milano", city: "Milan", country: "Italy" },
  });
  const mail = {
    id: "milano",
    subject: "Booking",
    from_email: "stay@little.test",
    extract: { items: [{ kind: "hotel", title: "Milano", details: { hotel_name: "Milano" } }] },
  };
  assert.equal(hotelMailPieceMatches(item, mail), true);
  assert.equal(hotelMailPieceMatches(item, { ...mail, from_email: "contact@travelba.fr" }), false);
  assert.equal(
    hotelMailPieceMatches(item, { ...mail, warnings: [{ file: "staff", message: "écarté" }] }),
    false
  );
  assert.equal(hotelMailPieceMatches(hotel(), { id: "other", extract: { items: [{ kind: "hotel", title: "Aman Tokyo" }] } }), false);
});

test("écrire à l'hôtel n'ajoute pas d'étape et coche les destinataires à l'envoi", () => {
  const root = join(process.cwd(), "lib/crm/hotel-desk-run.ts");
  const src = readFileSync(root, "utf8");
  const start = src.indexOf("export async function sendHotelMessage");
  const end = src.indexOf("async function loadRequest");
  const fn = src.slice(start, end);
  assert.match(fn, /deliverHotelMail/);
  assert.match(fn, /crm_hotel_messages/);
  assert.match(fn, /input\.recipients/);
  assert.doesNotMatch(fn, /crm_booking_items/);
  const desk = readFileSync(join(process.cwd(), "components/admin/HotelDesk.tsx"), "utf8");
  assert.match(desk, /HotelMailTo/);
  assert.doesNotMatch(desk, /RecipientRoster/);
  const thread = readFileSync(join(process.cwd(), "components/admin/HotelThread.tsx"), "utf8");
  assert.match(thread, /Avec l’hôtel/);
  assert.match(thread, /HotelMailTo/);
  assert.match(thread, /recipients: selected/);
  assert.doesNotMatch(thread, /RecipientRoster/);
  const carnet = readFileSync(join(process.cwd(), "components/account/CarnetItinerary.tsx"), "utf8");
  assert.doesNotMatch(carnet, /HotelMailTo/);
});

test("le titre parti ignore Re, R, AW et la relance", () => {
  assert.equal(hotelMailSubjectKey("R: Payment link — Casa Monti — 36441"), "payment link - casa monti - 36441");
  assert.equal(hotelMailSubjectKey("AW: Payment link — Casa Monti — 36441"), "payment link - casa monti - 36441");
  assert.equal(hotelMailSubjectKey("Re: Follow-up — Payment link - Casa Monti - 36441"), "payment link - casa monti - 36441");
  assert.equal(
    appendSentSubject(["Payment link — Casa Monti — 36441"], "Follow-up — Payment link — Casa Monti — 36441").length,
    1
  );
  assert.equal(appendSentSubject(["Payment link — Casa Monti — 36441"], "VIP welcome — Casa Monti — 36441").length, 2);
});

test("seul un courrier envoyé lance la recherche", () => {
  const sent = letter();
  assert.deepEqual(subjectsToFollow(sent), ["Lien de paiement — Le Bristol — HB-9"]);
  assert.deepEqual(subjectsToFollow({ ...sent, sent_subjects: ["Payment link — Le Bristol — HB-9"] }), [
    "Payment link — Le Bristol — HB-9",
  ]);
  assert.deepEqual(subjectsToFollow({ ...sent, status: "waiting", sent_at: null }), []);
  assert.deepEqual(subjectsToFollow({ ...sent, status: "skipped" }), []);
  assert.deepEqual(subjectsToFollow({ ...sent, status: "draft" }), []);
});

test("une réponse d'une autre adresse reste, un objet voisin non", () => {
  const keys = ["Payment link — Le Bristol — HB-9"];
  const reply = classifyHotelMail({
    from: "Danilo <ciao@hotel.test>",
    subject: "Re: Payment link — Le Bristol — HB-9",
    body: "The link is ready:\nhttps://secure.hotel.test/authorizations/stay-1\nNuméro : 4242 4242 4242 4242",
    keys,
  });
  assert.equal(reply.keep, true);
  assert.equal(reply.countsAsReply, true);
  assert.equal(reply.direction, "in");
  assert.equal(reply.link, "https://secure.hotel.test/authorizations/stay-1");
  assert.equal(reply.body.includes("4242"), false);
  assert.equal(
    classifyHotelMail({
      from: "desk@hotel.test",
      subject: "VIP welcome — Le Bristol — HB-9",
      body: "Welcome",
      keys,
    }).keep,
    false
  );
  const copy = classifyHotelMail({
    from: "Travel Business Agency <contact@travelba.fr>",
    subject: "Payment link — Le Bristol — HB-9",
    body: "Could you please send us the payment link",
    keys,
  });
  assert.equal(copy.direction, "out");
  assert.equal(copy.countsAsReply, false);
});

test("une absence ou un bounce ne passe pas le courrier à Répondu", () => {
  const keys = ["Payment link — Le Bristol — HB-9"];
  const away = classifyHotelMail({
    from: "desk@hotel.test",
    subject: "Re: Payment link — Le Bristol — HB-9",
    body: "I am out of the office until Monday.",
    keys,
  });
  assert.equal(away.keep, true);
  assert.equal(away.countsAsReply, false);
  assert.equal(away.notice, "auto");
  const bounce = classifyHotelMail({
    from: "Mailer-Daemon <mailer-daemon@googlemail.com>",
    subject: "Re: Payment link — Le Bristol — HB-9",
    body: "Delivery status notification. The message was not delivered.",
    keys,
  });
  assert.equal(bounce.countsAsReply, false);
  assert.equal(isAutomaticHotelMail("postmaster@hotel.test", "hello"), true);
  assert.equal(nextLetterStatus("sent", false), "sent");
  assert.equal(nextLetterStatus("follow_up", true), "replied");
  assert.equal(nextLetterStatus("skipped", true), "skipped");
  assert.equal(nextLetterStatus("sent", away.countsAsReply), "sent");
});

function threadMessage(patch: Partial<CrmHotelThreadMessage> = {}): CrmHotelThreadMessage {
  return {
    id: "thread-1",
    booking_id: "b1",
    booking_item_id: "item-hotel",
    gmail_message_id: "gmail-1",
    gmail_thread_id: "thread",
    subject_key: "lien de paiement - le bristol - hb-9",
    direction: "in",
    from_email: "desk@bristol.test",
    subject: "Re: Lien de paiement — Le Bristol — HB-9",
    body: "Le lien est prêt.",
    link: "https://secure.hotel.test/authorizations/stay-1",
    received_at: "2026-09-28T14:00:00.000Z",
    counts_as_reply: true,
    source: "gmail",
    request_id: "req-1",
    message_id: null,
    ...patch,
  };
}

test("le fil garde chaque réponse et replie la copie Gmail de l'envoi", () => {
  const sentBody = "Pourriez-vous envoyer le lien de paiement ?";
  const turns = hotelThread({
    item: hotel(),
    requests: [
      letter({ reply_body: "ancienne réponse", reply_subject: "Re: Lien de paiement — Le Bristol — HB-9" }),
      letter({
        id: "req-2",
        kind: "upgrade",
        subject: "VIP welcome — Le Bristol — HB-9",
        sent_at: "2026-09-28T09:00:00.000Z",
        reply_body: "",
        reply_subject: "",
        replied_at: null,
        reply_message_id: null,
      }),
    ],
    messages: [],
    attached: [],
    thread: [
      threadMessage({
        id: "crm-out",
        gmail_message_id: "crm:request:req-1:2026-09-28T08:00:00.000Z",
        direction: "out",
        from_email: "contact@travelba.fr",
        subject: "Lien de paiement — Le Bristol — HB-9",
        body: sentBody,
        link: null,
        received_at: "2026-09-28T08:00:00.000Z",
        counts_as_reply: false,
        source: "crm",
      }),
      threadMessage({
        id: "gmail-out",
        gmail_message_id: "gmail-out",
        direction: "out",
        from_email: "contact@travelba.fr",
        subject: "Lien de paiement — Le Bristol — HB-9",
        body: sentBody,
        link: null,
        received_at: "2026-09-28T08:01:00.000Z",
        counts_as_reply: false,
        source: "gmail",
      }),
      threadMessage({ id: "reply-1", received_at: "2026-09-28T14:00:00.000Z", body: "Premier retour." }),
      threadMessage({
        id: "reply-2",
        gmail_message_id: "gmail-2",
        received_at: "2026-09-28T16:00:00.000Z",
        body: "Deuxième retour.\nhttps://secure.hotel.test/authorizations/stay-1",
        link: "https://secure.hotel.test/authorizations/stay-1",
      }),
      threadMessage({
        id: "other",
        gmail_message_id: "gmail-3",
        subject_key: "vip welcome - le bristol - hb-9",
        subject: "VIP welcome — Le Bristol — HB-9",
        direction: "out",
        source: "gmail",
        counts_as_reply: false,
        body: "Welcome.",
        link: null,
        received_at: "2026-09-28T09:00:00.000Z",
        request_id: "req-2",
      }),
    ],
  });
  assert.deepEqual(
    turns.map((turn) => turn.label),
    ["Lien de paiement", "Upgrade et accueil", "Réponse", "Réponse"]
  );
  assert.equal(turns.filter((turn) => turn.direction === "out" && turn.subject.includes("Lien")).length, 1);
  assert.equal(turns.some((turn) => turn.body === "ancienne réponse"), false);
  assert.equal(turns[3]?.link, "https://secure.hotel.test/authorizations/stay-1");
});

test("le fil hôtel coche le destinataire prévu et laisse décocher les autres", async () => {
  const nodeRequire = createRequire(import.meta.url);
  const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
  const load = Module._load;
  Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
    if (request === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    return load.call(this, request, parent, isMain);
  };
  try {
    const { HotelThread } = await import("../../components/admin/HotelThread");
    const item = hotel({
      details: {
        hotel_name: "Le Bristol",
        country: "France",
        email: "reservations@bristol.test",
        hotel_contacts: [
          { type: "Concierge", first_name: "", last_name: "", email: "concierge@bristol.test" },
          { type: "Directrice", first_name: "Claire", last_name: "Martin", email: "claire@bristol.test" },
        ],
      },
    });
    const html = renderToStaticMarkup(
      createElement(HotelThread, {
        bookingId: "b1",
        item,
        requests: [
          {
            ...letter(),
            recipients: ["reservations@bristol.test"],
            sent_at: null,
            reply_body: "",
            replied_at: null,
          },
        ],
        messages: [],
        attached: [],
      })
    );
    assert.match(html, /Destinataires/);
    assert.match(html, /Directrice · Claire Martin · claire@bristol\.test/);
    assert.match(html, /Concierge · concierge@bristol\.test/);
    assert.match(html, /reservations@bristol\.test/);
    assert.match(html, /Le message part seulement vers les adresses cochées/);
    const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) || [];
    assert.equal(boxes.length, 3);
    assert.equal(boxes.filter((box) => box.includes("checked")).length, 1);
    assert.doesNotMatch(html, /RecipientRoster/);
  } finally {
    Module._load = load;
  }
});
