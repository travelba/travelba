import assert from "node:assert/strict";
import { test } from "node:test";
import { parisMoment, relativeWhen } from "./concierge-when";
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
  assert.equal(signatures(text), 1, text);
}

function reply(text: string): ConciergeModelReply {
  return { text, bookingReference: "TB-2026-1022", handoff: null };
}

test("le jeudi qui vient est le 22 octobre, pas le vol passé", () => {
  const turn = planConciergeTurn("Pouvez vous me dire à quelle heure je pars jeudi ?", dossier(), NOW);
  assert.equal(turn.handoff, null);
  assert.equal(turn.bookingId, "stay-next");
  assert.match(turn.text, /Camille/);
  assert.match(turn.text, /22 octobre 2026/);
  assert.match(turn.text, /09h15/);
  assert.match(turn.text, /AF2100/);
  assert.match(turn.text, /Marrakech/);
  assert.equal(turn.text.includes("8 octobre"), false);
  assert.equal(turn.text.includes("15h30"), false);
  assert.equal(turn.text.includes("AF1876"), false);
  assert.equal(turn.text.includes("Je regarde"), false);
  assertClientSafe(turn.text);
});

test("une réponse modèle sur le mauvais jeudi, signature doublée, est remplacée", async () => {
  const bad =
    "Vous partez jeudi 8 octobre 2026 à 15h30 de Paris Charles de Gaulle, vol AF1876 à destination de Marrakech. Je reste à votre disposition.\n\nLe Concierge.\n\nLe Concierge";
  const turn = await planConciergeConversation({
    message: "Pouvez vous me dire à quelle heure je pars jeudi ?",
    dossier: dossier(),
    now: NOW,
    generate: async () => reply(bad),
  });
  assert.match(turn.text, /22 octobre 2026/);
  assert.match(turn.text, /AF2100/);
  assert.equal(turn.text.includes("8 octobre"), false);
  assert.equal(turn.text.includes("AF1876"), false);
  assertClientSafe(turn.text);
});

test("une bonne réponse modèle ne garde la signature qu’une fois", async () => {
  const good = "Camille, vous partez jeudi 22 octobre 2026, à 09h15, vol AF2100, à Marrakech.\n\nLe Concierge.\n\nLe Concierge";
  const turn = await planConciergeConversation({
    message: "Pouvez vous me dire à quelle heure je pars jeudi ?",
    dossier: dossier(),
    now: NOW,
    generate: async () => reply(good),
  });
  assert.match(turn.text, /22 octobre 2026/);
  assert.match(turn.text, /09h15/);
  assert.match(turn.text, /AF2100/);
  assert.match(turn.text, /Marrakech/);
  assert.equal(turn.handoff, null);
  assertClientSafe(turn.text);
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
    { message: "Pouvez vous me dire à quelle heure je pars jeudi ?", expect: /AF2100/, absent: /AF1876|8 octobre|\bParis\b/, handoff: null },
    { message: "Je pars demain ?", expect: /21 octobre 2026/, absent: /AF2100/, handoff: "question" },
    { message: "Je pars après-demain", expect: /AF2100/, absent: /\bParis\b/, handoff: null },
    { message: "Quel était mon dernier voyage ?", expect: /12 octobre 2026/, absent: /AF2100|\bCDG\b/, handoff: null },
    { message: "À quelle heure est mon vol de retour ?", expect: /AF2101/, absent: /\bParis\b|\bCDG\b/, handoff: null },
    { message: "Quel est mon hôtel jeudi ?", expect: /La Mamounia/, absent: /\bCDG\b/, handoff: null },
    { message: "À quelle heure est le transfert jeudi ?", expect: /Transfert vers l'hôtel/, absent: /\bCDG\b/, handoff: null },
    { message: "Où est l’accueil VIP jeudi ?", expect: /Accueil à l.arrivée/, absent: /Charles|CDG|\bParis\b/, handoff: null },
    { message: "Où est mon passeport ?", expect: /Passeport/, absent: /12AB34567/, handoff: null },
    { message: "Où en est la formalité du séjour TB-2026-1022 ?", expect: /en cours/, handoff: null },
    { message: "Je souhaite un surclassement", expect: /Je transmets à l’agence/, handoff: "change" },
    { message: "Pouvez-vous réserver un restaurant jeudi ?", expect: /restaurant/, absent: /Nobu|Mamounia/, handoff: "question" },
    { message: "C’est inacceptable, quel est le prix ?", expect: /Je transmets à l’agence/, absent: /9999/, handoff: "complaint" },
    { message: "Parlez-moi de mon séjour", expect: /Je n’ai pas de séjour publié/, handoff: null },
    { message: "What time is my flight on Thursday?", expect: /22 October 2026/, absent: /\bParis\b|\bCDG\b/, handoff: null },
    { message: "À quelle heure suis-je parti le 8 octobre ?", expect: /AF1876/, absent: /\bParis\b|Charles/, handoff: null },
    { message: "Annulez mon vol de jeudi", expect: /Je transmets à l’agence/, handoff: "cancel" },
    { message: "J’ai fait un virement, merci de le rapprocher", expect: /Je transmets à l’agence/, handoff: "payment" },
    { message: "Quel est mon encours ?", expect: /840/, handoff: null },
    { message: "Bonjour", expect: /Bonjour Camille/, handoff: null },
    { message: "Combien coûte le séjour TB-2026-1022 ?", expect: /Je n’ai pas ce prix/, absent: /9999/, handoff: null },
    { message: "Je pars jeudi", expect: /22 octobre 2026/, absent: /15h30/, handoff: "question" },
    { message: "À quelle heure part mon vol ?", expect: /Je n’ai pas l’horaire/, handoff: null },
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
    assert.equal(turn.text.includes("Je regarde"), row.handoff === "change" || row.handoff === "cancel" || row.handoff === "payment", row.message);
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
