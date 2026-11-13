import assert from "node:assert/strict";
import test from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore } from "./whatsapp-inbound";
import {
  MISSING_PRICE,
  buildConciergeDossier,
  planConciergeTurn,
  voiceNoteUnheardReply,
} from "./whatsapp-concierge";
import { planConciergeConversation, usesTutoiement } from "./whatsapp-conversation";
import { planPhase2 } from "./concierge-phase2";
import { replyCore, varyAutomaticText } from "./concierge-quote";

const NOW = new Date("2026-11-12T10:25:00Z");
const FLIGHT =
  "Bonjour, je cherche des billets d'avion pour 2 adultes et 3 enfants (3, 7 et 10 ans) : Nice-Dubaï le 13 avril, Dubaï-Athènes le 20 avril, le 2 mai Athènes-Nice. Quels sont les tarifs ?";

const niceStay = {
  id: "stay-nice",
  reference: "TB-NICE",
  title: "Nice",
  destination: "Nice",
  start_date: "2026-06-01",
  end_date: "2026-06-08",
  currency: "EUR",
  total_amount: 5000,
  visible_to_client: true,
  prices_visible: false,
  cover_image_path: null,
  notes_client: null,
  share_code: null,
};

function niceDossier(firstName = "Raphaël") {
  return buildConciergeDossier({ firstName, bookings: [niceStay] });
}

function pricedDossier() {
  return buildConciergeDossier({
    firstName: "Camille",
    bookings: [{ ...niceStay, id: "stay-priced", reference: "TB-PRIX", prices_visible: true, total_amount: 845, destination: "Marrakech", title: "Marrakech" }],
  });
}

test("une demande de billets hors dossier est un devis, pas un prix manquant", () => {
  const turn = planConciergeTurn(FLIGHT, niceDossier(), NOW);
  const text = turn.text;
  assert.equal(turn.handoff, "quote");
  assert.equal(turn.bookingId, null);
  assert.match(text, /Nice–Dubaï le 13 avril/);
  assert.match(text, /Dubaï–Athènes le 20 avril/);
  assert.match(text, /Athènes–Nice le 2 mai/);
  assert.match(text, /2 adultes/);
  assert.match(text, /3 enfants \(3, 7 et 10 ans\)/);
  assert.match(text, /Un conseiller vous transmet le chiffrage très rapidement/);
  assert.match(text, /En quelle classe souhaitez-vous voyager/);
  assert.equal(text.includes(MISSING_PRICE), false);
  assert.equal(text.includes("€"), false);
  assert.equal(text.includes("5000"), false);
  assert.equal(text.includes("9999"), false);
  assert.equal(usesTutoiement(text), false);
  assert.ok((turn.messages || []).length <= 3);
  assert.equal(text.includes("TB-NICE"), false);
});

test("un hôtel qui n’est pas dans le dossier part aussi en devis", () => {
  const dossier = buildConciergeDossier({
    firstName: "Camille",
    bookings: [{ ...niceStay, destination: "Marrakech", title: "Marrakech" }],
  });
  const turn = planConciergeTurn("Je cherche un hôtel à Santorin du 4 au 8 juin pour 2 adultes.", dossier, NOW);
  assert.equal(turn.handoff, "quote");
  assert.equal(turn.bookingId, null);
  assert.match(turn.text, /hôtel à Santorin/);
  assert.match(turn.text, /du 4 au 8 juin/);
  assert.match(turn.text, /2 adultes/);
  assert.match(turn.text, /chiffrage/);
  assert.equal(turn.text.includes(MISSING_PRICE), false);
  assert.equal(/classe/i.test(turn.text), false);
  assert.equal(turn.text.includes("Marrakech"), false);
  assert.equal(turn.text.includes("€"), false);
});

test("le prix manquant d’un séjour du dossier le dit, puis un conseiller", () => {
  const turn = planConciergeTurn("Quel est le prix du séjour ?", niceDossier("Simon"), NOW);
  assert.equal(turn.handoff, "question");
  assert.equal(turn.bookingId, "stay-nice");
  assert.match(turn.text, new RegExp(MISSING_PRICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(turn.text, /Un conseiller vous confirme le montant rapidement/);
  assert.equal(turn.text.includes("5000"), false);
  assert.equal(turn.text.includes("€"), false);

  const known = planConciergeTurn("Quel est le prix du séjour ?", pricedDossier(), NOW);
  assert.equal(known.handoff, null);
  assert.match(known.text, /845/);
  assert.equal(known.text.includes(MISSING_PRICE), false);
});

test("un vocal transcrit suit le devis, un vocal sans texte ne répète pas le prix", () => {
  const dossier = niceDossier();
  const first = planConciergeTurn(FLIGHT, dossier, NOW);
  const history = [
    { direction: "inbound" as const, body: FLIGHT, at: NOW.toISOString() },
    { direction: "outbound" as const, body: first.text, at: NOW.toISOString() },
  ];
  const repeated = planConciergeTurn(`Note vocale : ${FLIGHT}`, dossier, NOW, history);
  assert.equal(repeated.handoff, "quote");
  assert.equal(repeated.text.includes(MISSING_PRICE), false);
  assert.notEqual(replyCore(repeated.text), replyCore(first.text));
  assert.match(repeated.text, /conseiller/i);

  const fareOnly = planConciergeTurn("Note vocale : Quels sont les tarifs ?", dossier, NOW, history);
  assert.equal(fareOnly.text.includes(MISSING_PRICE), false);
  assert.match(fareOnly.text, /conseiller|chiffrage/i);
  assert.notEqual(replyCore(fareOnly.text), replyCore(first.text));

  const heard = planConciergeTurn("Note vocale : J'ai adoré la vue ce matin", dossier, NOW, history);
  assert.notEqual(heard.handoff, "quote");
  assert.equal(heard.text.includes(MISSING_PRICE), false);

  const unheard = voiceNoteUnheardReply("fr");
  assert.match(unheard, /bien reçu/);
  assert.match(unheard, /conseiller/);
  assert.equal(unheard.includes(MISSING_PRICE), false);
  assert.equal(/pas pu entendre/i.test(unheard), false);
  const again = varyAutomaticText(unheard, voiceNoteUnheardReply("fr"), "fr");
  assert.notEqual(replyCore(again), replyCore(unheard));
  assert.match(again, /conseiller/);
});

test("le modèle n’est pas appelé et le parcours devis vague reste une question", async () => {
  const dossier = niceDossier();
  let called = false;
  const turn = await planConciergeConversation({
    message: FLIGHT,
    dossier,
    now: NOW,
    generate: async () => {
      called = true;
      return { text: "Le tarif est de 9999 euros.", bookingReference: null, handoff: null };
    },
  });
  assert.equal(called, false);
  assert.equal(turn.handoff, "quote");
  assert.equal(turn.text.includes("9999"), false);
  assert.match(turn.text, /Dubaï/);

  const phase = await planPhase2({
    phone: "+33601020304",
    message: FLIGHT,
    dossier,
    now: NOW,
    generate: async () => {
      called = true;
      return null;
    },
  });
  assert.equal(called, false);
  assert.equal(phase.turn.handoff, "quote");
  assert.match(phase.turn.text, /Athènes–Nice le 2 mai/);
  assert.equal(/pour quelle destination/i.test(phase.turn.text), false);
  assert.equal(phase.proposal, null);

  const vague = await planPhase2({
    phone: "+33601020304",
    message: "Je voudrais un devis pour un nouveau séjour",
    dossier,
    now: NOW,
  });
  assert.equal(vague.turn.handoff, "quote");
  assert.match(vague.turn.text, /destination/i);
  assert.equal(vague.turn.text.includes("€"), false);
});

test("le webhook enregistre le devis sans envoyer un vrai message", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { to: string; body: string }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: FLIGHT,
    MessageSid: "SMdevis",
  };
  const store: WhatsappStore = {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return [{ id: "cust-raphael", first_name: "Raphaël" }];
    },
    async loadDossier() {
      return { firstName: "Raphaël", bookings: [niceStay] };
    },
    async insertMessage(row) {
      writes.push({ table: "crm_whatsapp_messages", row: row as unknown as Record<string, unknown> });
      return { id: `m${writes.length}` };
    },
    async insertRequest(row) {
      writes.push({ table: "crm_whatsapp_requests", row: row as unknown as Record<string, unknown> });
    },
  };
  const result = await receiveWhatsappWebhook({
    url: "https://travelba.fr/api/webhooks/twilio/whatsapp",
    signature: twilioRequestSignature("twilio-test-token", "https://travelba.fr/api/webhooks/twilio/whatsapp", params),
    params,
    authToken: "twilio-test-token",
    autoreply: true,
    bubbleDelayMs: 0,
    now: NOW,
    store,
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMout" };
    },
  });
  assert.equal(result.status, 200);
  const body = sent.map((row) => row.body).join("\n");
  assert.match(body, /Dubaï/);
  assert.match(body, /3 enfants/);
  assert.match(body, /chiffrage/);
  assert.equal(body.includes(MISSING_PRICE), false);
  assert.equal(body.includes("5000"), false);
  assert.equal(sent.every((row) => row.to === "whatsapp:+33601020304"), true);
  const request = writes.find((row) => row.table === "crm_whatsapp_requests");
  assert.equal(request?.row?.kind, "quote");
  assert.equal(request?.row?.customer_id, "cust-raphael");
  assert.equal(request?.row?.booking_id ?? null, null);
  assert.match(String(request?.row?.body || ""), /Athènes/);
});
