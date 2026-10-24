import assert from "node:assert/strict";
import { test } from "node:test";
import { badReplyCases, redactConciergeExport } from "./concierge-feedback";
import { conciergeModelId, DEFAULT_CONCIERGE_MODEL, planConciergeConversation } from "./whatsapp-conversation";
import {
  buildConciergeDossier,
  conciergeBrief,
  conciergeContextText,
  planConciergeTurn,
  scrubClientText,
} from "./whatsapp-concierge";

test("le modèle du Concierge se règle, et reste haut de gamme", () => {
  assert.equal(conciergeModelId({}), DEFAULT_CONCIERGE_MODEL);
  assert.equal(conciergeModelId({ CONCIERGE_MODEL: "gpt-4.1" }), "gpt-4.1");
  assert.equal(conciergeModelId({ CONCIERGE_MODEL: "openai/gpt-5.4" }), "gpt-5.4");
  assert.equal(conciergeModelId({ CONCIERGE_MODEL: "https://evil" }), DEFAULT_CONCIERGE_MODEL);
  assert.equal(DEFAULT_CONCIERGE_MODEL, "gpt-5.6");
});

test("le dossier préchargé cache net, fournisseur et passeport", () => {
  const now = new Date("2026-10-20T11:20:00Z");
  const dossier = buildConciergeDossier({
    firstName: "Alma",
    language: "fr",
    preferences: ["Flying Blue"],
    bookings: [
      {
        id: "stay",
        reference: "TB-2026-1022",
        title: "Tel Aviv",
        destination: "Tel Aviv",
        start_date: "2026-10-22",
        end_date: "2026-10-26",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        cover_image_path: null,
        notes_client: "Chambre calme. Commission 12 %. Net 800 €. Little Emperors.",
      },
    ],
    items: [
      {
        id: "flight",
        booking_id: "stay",
        kind: "flight",
        title: "Vol Little Emperors",
        supplier: "Hotelbeds",
        start_at: "2026-10-22T09:15:00",
        end_at: "2026-10-22T13:00:00",
        amount: 400,
        details: { from: "CDG", to: "TLV", city_from: "Paris", city_to: "Tel Aviv", flight_number: "LY320", supplier: "Expedia" },
        visible_to_client: true,
      },
      {
        id: "hotel",
        booking_id: "stay",
        kind: "hotel",
        title: "The Norman",
        supplier: "The Norman",
        start_at: "2026-10-22",
        end_at: "2026-10-26",
        amount: null,
        details: { hotel_name: "The Norman", city: "Tel Aviv" },
        visible_to_client: true,
      },
      {
        id: "transfer",
        booking_id: "stay",
        kind: "transfer",
        title: "Transfert aéroport",
        start_at: "2026-10-22T14:00:00",
        end_at: null,
        amount: null,
        details: {},
        visible_to_client: true,
      },
    ],
    travelDocuments: [
      {
        doc_type: "passport",
        first_name: "Alma",
        last_name: "Martin",
        expires_on: "2031-07-17",
        number: "NE-PAS-JOURNALISER",
      },
    ],
  });
  const brief = conciergeBrief(dossier, now);
  const packed = `${brief}\n${conciergeContextText(dossier)}`;
  assert.match(brief, /Client : Alma/);
  assert.match(brief, /Flying Blue/);
  assert.match(brief, /Chambre calme/);
  assert.match(brief, /LY320/);
  assert.match(brief, /The Norman/);
  assert.match(brief, /Transfert/);
  assert.equal(packed.includes("Little Emperors"), false);
  assert.equal(packed.includes("Hotelbeds"), false);
  assert.equal(packed.includes("Expedia"), false);
  assert.equal(/commission/i.test(packed), false);
  assert.equal(packed.includes("800"), false);
  assert.equal(packed.includes("NE-PAS-JOURNALISER"), false);
  assert.equal(scrubClientText("P<FRA\nMARTIN<<ALMA<<<<<<<<<<<<<<<<<<<\n12AB345678FRA9001011F3107171<<<<<<<<<<<<<<00").includes("MARTIN<<"), false);
});

test("renvoyer le carnet reste sur ce client, sans modèle", async () => {
  const dossier = buildConciergeDossier({
    firstName: "Alma",
    bookings: [
      {
        id: "stay",
        reference: "TB-2026-1022",
        title: "Tel Aviv",
        destination: "Tel Aviv",
        start_date: "2026-10-22",
        end_date: "2026-10-26",
        currency: "EUR",
        total_amount: 0,
        visible_to_client: true,
        cover_image_path: null,
      },
    ],
  });
  let called = false;
  const turn = await planConciergeConversation({
    message: "Renvoyez-moi mon carnet",
    dossier,
    now: new Date("2026-10-20T11:20:00Z"),
    generate: async () => {
      called = true;
      return { text: "Lien inventé https://evil.example/x", bookingReference: null, handoff: null };
    },
  });
  assert.equal(called, false);
  assert.match(turn.text, /TB-2026-1022/);
  assert.equal(turn.text.includes("evil.example"), false);
  assert.equal(turn.handoff, null);

  const table = planConciergeTurn("Pouvez-vous réserver un restaurant vendredi ?", dossier, new Date("2026-10-20T11:20:00Z"));
  assert.equal(table.handoff, "question");
  assert.match(table.text, /restaurant/);
  assert.match(table.text, /Rien n’est réservé/);

  const doubt = planConciergeTurn("Vous êtes sûr ?", dossier);
  assert.match(doubt.text, /vérifie avec Benjamin/i);
  assert.equal(doubt.handoff, "question");
});

test("une réponse notée mauvaise devient un cas, sans pièce", () => {
  const cases = badReplyCases([
    {
      id: "in",
      customer_id: "c1",
      direction: "inbound",
      body: "Mon passeport est 12AB34567",
      created_at: "2026-10-20T10:00:00Z",
      concierge_mark: null,
    },
    {
      id: "out",
      customer_id: "c1",
      direction: "outbound",
      body: "Passeport 12AB34567 au coffre.\nP<FRAMARTIN<<ALMA<<<<<<<<<<<<<<<<<<<",
      created_at: "2026-10-20T10:01:00Z",
      concierge_mark: "bad",
    },
    {
      id: "other",
      customer_id: "c2",
      direction: "inbound",
      body: "Autre client",
      created_at: "2026-10-20T10:00:30Z",
      concierge_mark: null,
    },
  ]);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].id, "out");
  assert.match(cases[0].inbound, /passeport/i);
  assert.equal(cases[0].inbound.includes("12AB34567"), false);
  assert.equal(cases[0].reply.includes("12AB34567"), false);
  assert.equal(cases[0].reply.includes("MARTIN<<"), false);
  assert.equal(cases[0].inbound.includes("Autre client"), false);
  assert.equal(redactConciergeExport("Vol AF1876").includes("AF1876"), true);
});
