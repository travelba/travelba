import assert from "node:assert/strict";
import { test } from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore } from "./whatsapp-inbound";
import { buildConciergeDossier, planConciergeTurn } from "./whatsapp-concierge";
import { planConciergeConversation, type ConciergeModelReply } from "./whatsapp-conversation";

const NOW = new Date("2026-11-13T12:00:00Z");
const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp";
const TOKEN = "twilio-test-token";

const ASK =
  "Merci beaucoup ! Il y a bien le vip fast track pass pour l'aller et le retour des vols internationaux ?";

const stay = {
  id: "stay-vn",
  reference: "TB-2026-0148",
  title: "Hô Chi Minh",
  destination: "Hô Chi Minh",
  start_date: "2026-12-17",
  end_date: "2027-01-01",
  currency: "EUR",
  total_amount: 1000,
  visible_to_client: true,
  prices_visible: false,
  cover_image_path: null,
  notes_client: null,
  share_code: null,
};

function flight(id: string, number: string, from: string, to: string, cityFrom: string, cityTo: string, start: string, end: string) {
  return {
    id,
    booking_id: "stay-vn",
    kind: "flight" as const,
    title: `${cityFrom} → ${cityTo}`,
    start_at: start,
    end_at: end,
    amount: null,
    supplier: "Air France",
    details: {
      from,
      to,
      city_from: cityFrom,
      city_to: cityTo,
      flight_number: number,
      airline: "Air France",
      airline_iata: "AF",
    },
    visible_to_client: true,
  };
}

type DossierItem = NonNullable<Parameters<typeof buildConciergeDossier>[0]["items"]>[number];

function dossier(extra: DossierItem[] = []) {
  return buildConciergeDossier({
    firstName: "David",
    bookings: [stay],
    items: [
      flight("out", "258", "CDG", "SGN", "Paris", "Hô Chi Minh", "2026-12-17T13:20:00", "2026-12-18T07:40:00"),
      flight("back", "253", "SGN", "CDG", "Hô Chi Minh", "Paris", "2027-01-01T09:45:00", "2027-01-01T17:40:00"),
      ...extra,
    ],
  });
}

function badSchedule(): ConciergeModelReply {
  return {
    text: "Votre vol de retour 253 décolle vendredi 1 janvier 2027 à 9h45 et atterrit à 17h40.",
    bookingReference: "TB-2026-0148",
    handoff: null,
  };
}

test("le fast track au retour n’est pas l’horaire du vol", async () => {
  const file = dossier();
  let called = false;
  const turn = await planConciergeConversation({
    message: ASK,
    dossier: file,
    now: NOW,
    generate: async () => {
      called = true;
      return badSchedule();
    },
  });
  assert.equal(called, false);
  assert.equal(turn.handoff, "question");
  assert.equal(turn.bookingId, "stay-vn");
  assert.match(turn.text, /je regarde et je vous fais un retour/i);
  assert.equal(/pas encore réservé|proposition|devis|décolle|\b253\b/i.test(turn.text), false);
  const direct = planConciergeTurn(ASK, file, NOW);
  assert.equal(direct.handoff, "question");
  assert.match(direct.text, /je regarde et je vous fais un retour/i);
});

test("les variantes de service suivent la même phrase", () => {
  const file = dossier();
  for (const message of [
    "Et au retour, le fast track est inclus ?",
    "Le salon pour l’aller et le retour des vols internationaux est compris ?",
    "L’assistance bagage est prévue au retour ?",
  ]) {
    const turn = planConciergeTurn(message, file, NOW);
    assert.equal(turn.handoff, "question", message);
    assert.equal(turn.bookingId, "stay-vn", message);
    assert.match(turn.text, /je regarde et je vous fais un retour/i, message);
    assert.equal(/décolle|proposition|devis|pas encore/i.test(turn.text), false, message);
  }
  const english = planConciergeTurn("Is the VIP fast track included on the return?", file, NOW);
  assert.equal(english.handoff, "question");
  assert.match(english.text, /look into it and come back/i);
  assert.equal(/quote|proposal|not booked/i.test(english.text), false);
});

test("un accueil VIP déjà au dossier est confirmé", () => {
  const file = dossier([
    {
      id: "vip",
      booking_id: "stay-vn",
      kind: "accueil_vip" as const,
      title: "Accueil VIP",
      start_at: "2026-12-17T13:20:00",
      end_at: null,
      amount: null,
      supplier: null,
      details: {},
      visible_to_client: true,
    },
  ]);
  const turn = planConciergeTurn("Il y a bien l’accueil VIP au retour ?", file, NOW);
  assert.equal(turn.handoff, null);
  assert.match(turn.text, /accueil vip/i);
  assert.match(turn.text, /17 décembre/);
  assert.equal(/je regarde/i.test(turn.text), false);
});

test("un greeter de transfert n’est pas un fast track international", () => {
  const file = dossier([
    {
      id: "greeter",
      booking_id: "stay-vn",
      kind: "transfer" as const,
      title: "Greeter + Transfert",
      start_at: "2026-12-21T00:00:00",
      end_at: null,
      amount: null,
      supplier: "Transfert",
      details: {},
      visible_to_client: true,
    },
  ]);
  const turn = planConciergeTurn(ASK, file, NOW);
  assert.equal(turn.handoff, "question");
  assert.match(turn.text, /je regarde et je vous fais un retour/i);
});

test("une vraie question d’horaire sur le retour garde le raccourci, avec le code AF", async () => {
  const file = dossier();
  for (const message of [
    "À quelle heure est mon vol de retour ?",
    "Quand décolle le vol de retour ?",
    "Quel est l’horaire du vol de retour ?",
  ]) {
    let called = false;
    const turn = await planConciergeConversation({
      message,
      dossier: file,
      now: NOW,
      generate: async () => {
        called = true;
        return badSchedule();
      },
    });
    assert.equal(called, false, message);
    assert.equal(turn.handoff, null, message);
    assert.match(turn.text, /AF253/, message);
    assert.match(turn.text, /9h45/, message);
    assert.match(turn.text, /17h40/, message);
    assert.equal(/\bretour 253\b/.test(turn.text), false, `${message}\n${turn.text}`);
    assert.equal(/je regarde/i.test(turn.text), false, message);
  }
});

test("une question qui cite le retour sans demander l’heure va au modèle", async () => {
  let called = false;
  const turn = await planConciergeConversation({
    message: "Le retour est-il en classe affaires ?",
    dossier: dossier(),
    now: NOW,
    generate: async () => {
      called = true;
      return badSchedule();
    },
  });
  assert.equal(called, true);
  assert.equal(/décolle|253/.test(turn.text), false);
});

test("l’agence reçoit la question exacte, le client et le dossier", async () => {
  const alerts: { kind?: string; body?: string; customer_id?: string | null; booking_id?: string | null }[] = [];
  const sent: string[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: ASK,
    MessageSid: "SMfast-track",
  };
  const store: WhatsappStore = {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return [{ id: "cust-david", first_name: "David" }];
    },
    async loadDossier() {
      return {
        firstName: "David",
        bookings: [stay],
        items: [
          flight("out", "258", "CDG", "SGN", "Paris", "Hô Chi Minh", "2026-12-17T13:20:00", "2026-12-18T07:40:00"),
          flight("back", "253", "SGN", "CDG", "Hô Chi Minh", "Paris", "2027-01-01T09:45:00", "2027-01-01T17:40:00"),
        ],
      };
    },
    async insertMessage() {
      return { id: "msg-in" };
    },
    async insertRequest(row) {
      alerts.push(row);
    },
  };
  const result = await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: twilioRequestSignature(TOKEN, URL_HOOK, params),
    params,
    authToken: TOKEN,
    autoreply: true,
    now: NOW,
    bubbleDelayMs: 0,
    store,
    alert: async (row) => {
      alerts.push(row);
    },
    send: async (message) => {
      sent.push(message.body);
      return { ok: true, sid: "SMout" };
    },
  });
  assert.equal(result.status, 200);
  assert.match(sent.join("\n"), /je regarde et je vous fais un retour/i);
  assert.equal(/décolle|proposition|devis/i.test(sent.join("\n")), false);
  const request = alerts.find((row) => row.kind === "question");
  assert.equal(request?.body, ASK);
  assert.equal(request?.customer_id, "cust-david");
  assert.equal(request?.booking_id, "stay-vn");
});
