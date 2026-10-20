import assert from "node:assert/strict";
import { test } from "node:test";
import { conciergeSkillVersion } from "../concierge/bubbles";
import { parisMoment, relativeWhen } from "./concierge-when";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore } from "./whatsapp-inbound";
import { UNKNOWN_NUMBER_REPLY, buildConciergeDossier, conciergeBrief, planConciergeTurn, replyMentionsForbiddenPlace, replyMissesAskedDay } from "./whatsapp-concierge";
import { planConciergeConversation, type ConciergeModelReply } from "./whatsapp-conversation";

const NOW = new Date("2026-10-20T11:20:00Z");
const THURSDAY = new Date("2026-10-22T10:00:00Z");

const pastStay = {
  id: "stay-past",
  reference: "TB-2026-1008",
  title: "Marrakech",
  destination: "Marrakech",
  start_date: "2026-10-08",
  end_date: "2026-10-12",
  currency: "EUR",
  total_amount: 9999,
  visible_to_client: true,
  prices_visible: false,
  cover_image_path: null,
  notes_client: null,
  share_code: null,
};

const nextStay = {
  id: "stay-next",
  reference: "TB-2026-1022",
  title: "Marrakech",
  destination: "Marrakech",
  start_date: "2026-10-22",
  end_date: "2026-10-29",
  currency: "EUR",
  total_amount: 9999,
  visible_to_client: true,
  prices_visible: false,
  cover_image_path: null,
  notes_client: null,
  share_code: null,
};

function dossier() {
  return buildConciergeDossier({
    firstName: "Camille",
    bookings: [pastStay, nextStay],
    items: [
      {
        id: "flight-past",
        booking_id: "stay-past",
        kind: "flight",
        title: "Vol",
        start_at: "2026-10-08T15:30:00",
        end_at: "2026-10-08T18:00:00",
        amount: null,
        details: { from: "CDG", to: "RAK", city_from: "Paris", city_to: "Marrakech", flight_number: "AF1876" },
        visible_to_client: true,
      },
      {
        id: "flight-next",
        booking_id: "stay-next",
        kind: "flight",
        title: "Vol",
        start_at: "2026-10-22T09:15:00",
        end_at: "2026-10-22T11:40:00",
        amount: null,
        details: {
          from: "CDG",
          to: "RAK",
          city_from: "Paris",
          city_to: "Marrakech",
          flight_number: "AF2100",
          terminal: "2E",
        },
        visible_to_client: true,
      },
      {
        id: "flight-back",
        booking_id: "stay-next",
        kind: "flight",
        title: "Vol",
        start_at: "2026-10-29T18:40:00",
        end_at: "2026-10-29T22:10:00",
        amount: null,
        details: { from: "RAK", to: "CDG", city_from: "Marrakech", city_to: "Paris", flight_number: "AF2101" },
        visible_to_client: true,
      },
      {
        id: "hotel-next",
        booking_id: "stay-next",
        kind: "hotel",
        title: "La Mamounia",
        start_at: "2026-10-22T15:00:00",
        end_at: "2026-10-29T11:00:00",
        amount: null,
        details: { hotel_name: "La Mamounia", city: "Marrakech" },
        visible_to_client: true,
      },
      {
        id: "transfer-next",
        booking_id: "stay-next",
        kind: "transfer",
        title: "Transfert vers l'hôtel",
        start_at: "2026-10-22T11:00:00",
        end_at: null,
        amount: null,
        details: {},
        visible_to_client: true,
      },
      {
        id: "vip-next",
        booking_id: "stay-next",
        kind: "accueil_vip",
        title: "Accueil à l'arrivée",
        start_at: "2026-10-22T11:40:00",
        end_at: null,
        amount: null,
        details: {},
        visible_to_client: true,
      },
    ],
    travelDocuments: [
      {
        doc_type: "passport",
        first_name: "Camille",
        last_name: "Martin",
        expires_on: "2030-04-02",
        number: "12AB34567",
      },
    ],
    visaRequests: [{ booking_id: "stay-next", country: "MA", status: "en_cours" }],
    balances: [{ currency: "EUR", balance: -840 }],
  });
}

function signatures(text: string) {
  return text.match(/Le Concierge/g)?.length ?? 0;
}

function assertClientSafe(text: string) {
  assert.equal(/\bParis\b/.test(text), false, text);
  assert.equal(/\bCDG\b/.test(text), false, text);
  assert.equal(/Charles de Gaulle/.test(text), false, text);
  assert.equal(/ — /.test(text), false, text);
  assert.equal(signatures(text), 1, text);
}

function assertChat(text: string, name: string, english = false, messages: string[] = []) {
  const bubbles = messages.length ? messages : [text];
  assert.ok(bubbles.length >= 1 && bubbles.length <= 3, text);
  for (const bubble of bubbles) assert.ok(bubble.length <= 260, bubble);
  const hello = english ? new RegExp(`^Hello ${name}, [a-z]`) : new RegExp(`^Bonjour ${name}, [a-zàâäéèêëïîôùûüçœ]`);
  assert.match(bubbles[0], hello, bubbles[0]);
  assert.equal(bubbles[0].includes("Le Concierge"), true, bubbles[0]);
  for (const extra of bubbles.slice(1)) {
    assert.equal(/^(Bonjour|Hello)\b/.test(extra), false, extra);
    assert.equal(extra.includes("Le Concierge"), false, extra);
  }
  assert.equal((text.match(/Le Concierge/g) || []).length, 1, text);
  assert.equal(/ — /.test(text), false, text);
}

function reply(text: string): ConciergeModelReply {
  return { text, bookingReference: "TB-2026-1022", handoff: null };
}

test("le jeudi qui vient est le 22 octobre, pas le vol passé", () => {
  const turn = planConciergeTurn("Pouvez vous me dire à quelle heure je pars jeudi ?", dossier(), NOW);
  assert.equal(turn.handoff, "question");
  assert.equal(turn.bookingId, "stay-next");
  assert.equal(turn.messages?.length, 2);
  assert.match(turn.messages?.[0] || "", /votre vol AF2100 pour Marrakech décolle jeudi 22 octobre à 9h15 et atterrit à 11h40/);
  assert.match(turn.messages?.[1] || "", /Le transfert vers l'hôtel sera confirmé par l'équipe/);
  assert.equal((turn.text.match(/Marrakech/g) || []).length, 1);
  assert.equal(/\b11h(?!40)/.test(turn.text), false);
  assert.equal(turn.text.includes("La Mamounia"), false);
  assert.equal(turn.text.includes("8 octobre"), false);
  assert.equal(turn.text.includes("15h30"), false);
  assert.equal(turn.text.includes("09h15"), false);
  assert.equal(turn.text.includes("AF1876"), false);
  assert.equal(turn.text.includes("Je regarde"), false);
  assertClientSafe(turn.text);
  assertChat(turn.text, "Camille", false, turn.messages);
});

test("un jeudi incohérent n’appelle pas le modèle", async () => {
  let called = false;
  const turn = await planConciergeConversation({
    message: "Pouvez vous me dire à quelle heure je pars jeudi ?",
    dossier: dossier(),
    now: NOW,
    generate: async () => {
      called = true;
      return reply("Vous partez jeudi 8 octobre, vol AF1876.");
    },
  });
  assert.equal(called, false);
  assert.equal(turn.handoff, "question");
  assert.match(turn.text, /AF2100/);
  assert.equal(turn.text.includes("AF1876"), false);
  assert.equal(turn.text.includes("8 octobre"), false);
  assertClientSafe(turn.text);
  assertChat(turn.text, "Camille", false, turn.messages);
});

test("une bonne réponse modèle ne garde la signature qu’une fois", async () => {
  const good = "Votre vol de retour AF2101 décolle jeudi 29 octobre à 18h40 et atterrit à 22h10.\n\nLe Concierge.\n\nLe Concierge";
  const turn = await planConciergeConversation({
    message: "À quelle heure est mon vol de retour ?",
    dossier: dossier(),
    now: NOW,
    generate: async () => reply(good),
  });
  assert.match(turn.text, /^Bonjour Camille, votre vol de retour AF2101/);
  assert.match(turn.text, /atterrit à 22h10/);
  assert.equal(turn.text.includes("Marrakech"), false);
  assert.equal(turn.handoff, null);
  assert.equal((turn.text.match(/Le Concierge/g) || []).length, 1);
  assert.equal(turn.messages?.length, 1);
  assertClientSafe(turn.text);
  assertChat(turn.text, "Camille", false, turn.messages);
});

test("le contexte garde le passé et date aujourd’hui à Paris", () => {
  const brief = conciergeBrief(dossier(), NOW);
  assert.match(brief, /mardi 20 octobre 2026, 13:20/);
  assert.match(brief, /8 octobre 2026/);
  assert.match(brief, /22 octobre 2026/);
  assert.match(brief, /AF1876/);
  assert.match(brief, /AF2100/);
  assert.match(brief, /Ne pas citer : Paris/);
  assert.equal(parisMoment(NOW).time, "13:20");
  const today = new Date("2026-10-22T10:00:00Z");
  assert.equal(relativeWhen("je pars jeudi prochain", today)?.kind, "date");
  assert.equal(relativeWhen("je pars jeudi prochain", today) && (relativeWhen("je pars jeudi prochain", today) as { date: string }).date, "2026-10-29");
});

test("vingt-cinq questions du carnet, passées et à venir", () => {
  const file = dossier();
  const cases: { message: string; now?: Date; expect: RegExp; absent?: RegExp; handoff?: string | null }[] = [
    { message: "Pouvez vous me dire à quelle heure je pars jeudi ?", expect: /AF2100/, absent: /AF1876|8 octobre|\bParis\b|11h(?!40)/, handoff: "question" },
    { message: "Je pars demain ?", expect: /21 octobre/, absent: /AF2100/, handoff: "question" },
    { message: "Je pars après-demain", expect: /AF2100/, absent: /\bParis\b|11h(?!40)/, handoff: "question" },
    { message: "Quel était mon dernier voyage ?", expect: /s’est achevé le 12 octobre/, absent: /AF2100|AF1876|\bCDG\b/, handoff: null },
    { message: "À quelle heure est mon vol de retour ?", expect: /AF2101/, absent: /\bParis\b|\bCDG\b|Marrakech/, handoff: null },
    { message: "Quel est mon hôtel jeudi ?", expect: /séjournez à La Mamounia du 22 au 29 octobre/, absent: /\bCDG\b|Marrakech|transfert/i, handoff: null },
    { message: "À quelle heure est le transfert jeudi ?", expect: /sera confirmé par l'équipe/, absent: /\bCDG\b|11h(?!40)|Mamounia/, handoff: "question" },
    { message: "Où est l’accueil VIP jeudi ?", expect: /accueil à l.arrivée/i, absent: /Charles|CDG|\bParis\b|Mamounia/, handoff: null },
    { message: "Où est mon passeport ?", expect: /Passeport/, absent: /12AB34567/, handoff: null },
    { message: "Où en est la formalité du séjour TB-2026-1022 ?", expect: /en cours/, handoff: null },
    { message: "Je souhaite un surclassement", expect: /Je transmets à l’agence/, handoff: "change" },
    { message: "Pouvez-vous réserver un restaurant jeudi ?", expect: /restaurant/, absent: /Nobu|Mamounia/, handoff: "question" },
    { message: "C’est inacceptable, quel est le prix ?", expect: /Je transmets à l’agence/, absent: /9999/, handoff: "complaint" },
    { message: "Parlez-moi de mon séjour", expect: /n’ai pas de séjour publié/, handoff: null },
    { message: "What time is my flight on Thursday?", expect: /22 October/, absent: /\bParis\b|\bCDG\b|09:15|11:00/, handoff: "question" },
    { message: "À quelle heure suis-je parti le 8 octobre ?", expect: /AF1876/, absent: /\bParis\b|Charles/, handoff: null },
    { message: "Annulez mon vol de jeudi", expect: /Je transmets à l’agence/, handoff: "cancel" },
    { message: "J’ai fait un virement, merci de le rapprocher", expect: /Je transmets à l’agence/, handoff: "payment" },
    { message: "Quel est mon encours ?", expect: /840/, handoff: null },
    { message: "Bonjour", expect: /Bonjour Camille/, handoff: null },
    { message: "Combien coûte le séjour TB-2026-1022 ?", expect: /n’ai pas ce prix/, absent: /9999/, handoff: null },
    { message: "Je pars jeudi", expect: /22 octobre/, absent: /15h30/, handoff: "question" },
    { message: "À quelle heure part mon vol ?", expect: /n’ai pas l’horaire/, handoff: null },
    { message: "Comment vont les baleines cette année ?", expect: /Souhaitez-vous que j’en parle à l’agence/, handoff: null },
    { message: "Je pars jeudi prochain", now: THURSDAY, expect: /AF2101/, absent: /AF2100|\bParis\b/, handoff: null },
  ];
  assert.equal(cases.length, 25);
  const bare = buildConciergeDossier({ firstName: "Camille", bookings: [] });
  const pastOnly = buildConciergeDossier({
    firstName: "Camille",
    bookings: [pastStay],
    items: [
      {
        id: "flight-past",
        booking_id: "stay-past",
        kind: "flight",
        title: "Vol",
        start_at: "2026-10-08T15:30:00",
        end_at: null,
        amount: null,
        details: { from: "CDG", to: "RAK", city_from: "Paris", city_to: "Marrakech", flight_number: "AF1876" },
        visible_to_client: true,
      },
    ],
  });
  const noClock = buildConciergeDossier({
    firstName: "Simon",
    bookings: [{ ...nextStay, id: "stay-one", reference: "PUB-1" }],
    items: [
      {
        id: "flight-midnight",
        booking_id: "stay-one",
        kind: "flight",
        title: "Vol",
        start_at: "2026-10-22T00:00:00",
        end_at: null,
        amount: null,
        details: { from: "CDG", to: "RAK", flight_number: "AF1" },
        visible_to_client: true,
      },
    ],
  });
  for (const row of cases) {
    const source =
      row.message === "Parlez-moi de mon séjour" ? bare : row.message === "Je pars jeudi" ? pastOnly : row.message === "À quelle heure part mon vol ?" ? noClock : file;
    const turn = planConciergeTurn(row.message, source, row.now || NOW);
    assert.equal(turn.handoff, row.handoff ?? null, row.message);
    assert.match(turn.text, row.expect, row.message);
    if (row.absent) assert.equal(row.absent.test(turn.text), false, `${row.message}\n${turn.text}`);
    assert.equal(signatures(turn.text), 1, row.message);
    assert.ok((turn.messages || []).length <= 3, row.message);
    const greetings = (turn.messages || []).filter((bubble) => /^(Bonjour|Hello)\b/.test(bubble));
    assert.ok(greetings.length <= 1, row.message);
    assert.equal(turn.text.includes("Je regarde"), row.handoff === "change" || row.handoff === "cancel" || row.handoff === "payment", row.message);
    if (row.handoff !== "change" && row.handoff !== "cancel" && row.handoff !== "payment") {
      const name = row.message === "À quelle heure part mon vol ?" ? "Simon" : "Camille";
      assertChat(turn.text, name, row.message.startsWith("What "), turn.messages);
    }
  }
  assert.match(UNKNOWN_NUMBER_REPLY, /conseiller/);
  assert.equal(signatures(UNKNOWN_NUMBER_REPLY), 1);
  assert.equal(replyMentionsForbiddenPlace("départ de Paris Charles de Gaulle", file), true);
  assert.equal(replyMentionsForbiddenPlace("à Marrakech", file), false);
  assert.equal(
    replyMissesAskedDay("Pouvez vous me dire à quelle heure je pars jeudi ?", "Vous partez le 8 octobre, vol AF1876, à 15:30.", file, NOW),
    true
  );
});

test("la skill est versionnée et un fil déjà ouvert ne resalue pas", () => {
  assert.equal(conciergeSkillVersion(), "1");
  const history = [{ direction: "outbound" as const, body: "Bonjour Camille,\n\nLe Concierge", at: NOW.toISOString() }];
  const turn = planConciergeTurn("Quel est mon hôtel jeudi ?", dossier(), NOW, history);
  assert.equal(/^(Bonjour|Hello)\b/.test(turn.text), false);
  assert.equal(turn.text.includes("Le Concierge"), false);
  assert.match(turn.text, /Vous séjournez à La Mamounia du 22 au 29 octobre/);
  assert.equal(turn.handoff, null);
  assert.ok((turn.messages || []).length <= 2);
});

test("deux bulles partent l’une après l’autre et s’enregistrent chacune", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Pouvez vous me dire à quelle heure je pars jeudi ?",
    MessageSid: "SMjeudi",
  };
  const raw = dossier();
  const store: WhatsappStore = {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return [{ id: "cust-1", first_name: "Camille" }];
    },
    async loadDossier() {
      return {
        bookings: [pastStay, nextStay],
        items: [
          {
            id: "flight-next",
            booking_id: "stay-next",
            kind: "flight",
            title: "Vol",
            start_at: "2026-10-22T09:15:00",
            end_at: "2026-10-22T11:40:00",
            amount: null,
            details: { from: "CDG", to: "RAK", city_from: "Paris", city_to: "Marrakech", flight_number: "AF2100" },
            visible_to_client: true,
          },
          {
            id: "transfer-next",
            booking_id: "stay-next",
            kind: "transfer",
            title: "Transfert vers l'hôtel",
            start_at: "2026-10-22T11:00:00",
            end_at: null,
            amount: null,
            details: {},
            visible_to_client: true,
          },
        ],
      };
    },
    async insertMessage(row) {
      writes.push({ table: "crm_whatsapp_messages", row: row as unknown as Record<string, unknown> });
      return { id: `m${writes.length}` };
    },
    async insertRequest(row) {
      writes.push({ table: "crm_whatsapp_requests", row: row as unknown as Record<string, unknown> });
    },
  };
  const gaps: number[] = [];
  let last = 0;
  await receiveWhatsappWebhook({
    url: "https://travelba.fr/api/webhooks/twilio/whatsapp",
    signature: twilioRequestSignature("twilio-test-token", "https://travelba.fr/api/webhooks/twilio/whatsapp", params),
    params,
    authToken: "twilio-test-token",
    now: NOW,
    bubbleDelayMs: 0,
    autoreply: true,
    store,
    send: async (message) => {
      const at = Date.now();
      if (last) gaps.push(at - last);
      last = at;
      sent.push(message);
      return { ok: true, sid: `SMout${sent.length}` };
    },
  });
  assert.equal(raw.firstName, "Camille");
  assert.equal(sent.length, 2);
  assert.match(sent[0].body, /^Bonjour Camille, votre vol AF2100/);
  assert.match(sent[0].body, /Le Concierge/);
  assert.match(sent[1].body, /sera confirmé/);
  assert.equal(sent[1].body.includes("Le Concierge"), false);
  assert.equal(writes.filter((row) => row.table === "crm_whatsapp_messages" && row.row?.direction === "outbound").length, 2);
  assert.equal(writes.find((row) => row.table === "crm_whatsapp_requests")?.row?.kind, "question");
  assert.equal(gaps.length, 1);
});
