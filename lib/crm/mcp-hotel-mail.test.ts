import assert from "node:assert/strict";
import test from "node:test";
import { HOTEL_DESK_KINDS } from "./types";
import { HOTEL_DESK_LABELS, hotelDeskDraft } from "./hotel-desk";
import { runHotelMail, type HotelMailDraft, type HotelMailMode } from "./mcp-hotel-mail";

const DRAFT: HotelMailDraft = {
  dossier_id: "22222222-2222-4222-8222-222222222222",
  reference: "TB-2026-0100",
  carte_id: "11111111-1111-4111-8111-111111111111",
  hotel: "Le Bristol",
  demande: "Lien de paiement",
  kind: "payment_link",
  destinataires: ["reservations@bristol.test"],
  copie: [],
  objet: "Lien de paiement — Camille Martin",
  corps: "Bonjour,\n\nMerci d’envoyer le lien.\n\nTravel Business Agency",
  requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  threadId: null,
  cardChoice: null,
};

function effects(sent: HotelMailMode[]) {
  return {
    load: async () => ({ ...DRAFT }),
    sendRequest: async () => {
      sent.push("envoyer");
    },
    sendFollowUp: async () => {
      sent.push("relancer");
    },
    sendReply: async () => {
      sent.push("repondre");
    },
    skip: async () => {
      sent.push("pas_besoin");
    },
    restore: async () => {
      sent.push("remettre");
    },
  };
}

test("un courrier hôtel reste un aperçu tant que confirmer n’est pas vrai", async () => {
  const sent: HotelMailMode[] = [];
  const preview = await runHotelMail({ demande: "Lien de paiement" }, "envoyer", effects(sent));
  assert.equal(preview.envoye, false);
  assert.equal(preview.ecrit, false);
  assert.equal(preview.apercu, true);
  assert.deepEqual(preview.destinataires, ["reservations@bristol.test"]);
  assert.equal(preview.objet, DRAFT.objet);
  assert.equal(preview.corps, DRAFT.corps);
  assert.deepEqual(sent, []);

  const sentMail = await runHotelMail({ confirmer: true }, "envoyer", effects(sent));
  assert.equal(sentMail.envoye, true);
  assert.equal(sentMail.ecrit, true);
  assert.deepEqual(sent, ["envoyer"]);
});

test("la relance, la réponse et Pas besoin n’écrivent rien sans confirmer", async () => {
  const sent: HotelMailMode[] = [];
  const relay = await runHotelMail({ corps: "Nous revenons vers vous." }, "relancer", effects(sent));
  assert.equal(relay.corps, "Nous revenons vers vous.");
  assert.equal(relay.envoye, false);
  const answer = await runHotelMail({ confirmer: true, destinataires: ["desk@bristol.test"] }, "repondre", effects(sent));
  assert.deepEqual(answer.destinataires, ["desk@bristol.test"]);
  assert.equal(answer.envoye, true);
  const skipped = await runHotelMail({}, "pas_besoin", effects(sent));
  assert.equal(skipped.envoye, false);
  assert.equal(skipped.ecrit, false);
  const restored = await runHotelMail({ confirmer: true }, "remettre", effects(sent));
  assert.equal(restored.envoye, false);
  assert.equal(restored.ecrit, true);
  assert.deepEqual(sent, ["repondre", "remettre"]);
});

test("les sept modèles de courrier ont un objet et un corps", () => {
  const item = {
    id: "hotel",
    booking_id: "booking",
    kind: "hotel",
    title: "Le Bristol",
    supplier: "Direct",
    confirmation_ref: "BR-1",
    start_at: "2026-06-01",
    end_at: "2026-06-04",
    amount: null,
    currency: "EUR",
    details: { hotel_name: "Le Bristol", country: "France", email: "reservations@bristol.test" },
    lifecycle: "confirmed",
    client_hidden: false,
    sort_order: 0,
    visible_to_client: false,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  } as const;
  for (const kind of HOTEL_DESK_KINDS) {
    const letter = hotelDeskDraft({
      kind,
      item: item as never,
      items: [],
      reference: "TB-2026-0100",
      guest: "Camille Martin",
      currency: "EUR",
      holidays: [],
    });
    assert.equal(HOTEL_DESK_LABELS[kind].length > 0, true);
    assert.ok(letter.subject.trim(), kind);
    assert.ok(letter.body.includes("Travel Business Agency"), kind);
    assert.ok(letter.recipients.includes("reservations@bristol.test"), kind);
  }
});
