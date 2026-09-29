import assert from "node:assert/strict";
import test from "node:test";
import {
  cardSendNote,
  containsCardNumber,
  HOTEL_DESK_FROM,
  hotelReplyForDesk,
  deskNeedsAttention,
  hotelDeskDraft,
  hotelDeskRecipients,
  hotelDeskSuggested,
  hotelsNeedingDesk,
  keepAgencyDraft,
  nextDeskMark,
  outboundHotelLetter,
  replyMatchesHotel,
  transferCues,
} from "./hotel-desk";
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

test("la carte n'entre dans le message qu'à l'envoi", () => {
  assert.equal(containsCardNumber("4242 4242 4242 4242"), true);
  const note = cardSendNote("pliant", "fr", {
    holder: "Camille Martin",
    pan: "4242424242424242",
    expiry: "06/28",
    cvc: "123",
  });
  const stored = "Les documents d'identité sont joints.";
  assert.equal(containsCardNumber(stored), false);
  assert.match(outboundHotelLetter(stored, note), /4242424242424242/);
  assert.match(cardSendNote("client", "fr", null), /carte personnelle/);
  assert.equal(cardSendNote("client", "fr", null).includes("4242"), false);
});
