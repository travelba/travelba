import assert from "node:assert/strict";
import { test } from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore, type WhatsappThreadRow } from "./whatsapp-inbound";
import {
  FOLLOW_UP_TONE,
  HANDOFF_LABELS,
  MISSING_CLOCK,
  MISSING_DRIVER,
  buildConciergeDossier,
  planConciergeTurn,
} from "./whatsapp-concierge";
import {
  planConciergeConversation,
  replyUsesUnknownFact,
  type ConciergeGenerator,
  type ConciergeModelReply,
} from "./whatsapp-conversation";

const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp";
const TOKEN = "twilio-test-token";
const OFFER = "Je n’ai pas cette information. Souhaitez-vous que j’en parle à l’agence ?\n\nLe Concierge";

function signed(params: Record<string, string>) {
  return twilioRequestSignature(TOKEN, URL_HOOK, params);
}

const published = {
  id: "stay-pub",
  reference: "PUB-1",
  title: "Avoriaz",
  destination: "Avoriaz",
  start_date: "2026-02-10",
  end_date: "2026-02-17",
  currency: "EUR",
  total_amount: 9999,
  visible_to_client: true,
  prices_visible: false,
  cover_image_path: null,
  notes_client: null,
  share_code: null,
};

function dossierOf(items: Parameters<typeof buildConciergeDossier>[0]["items"] = []) {
  return buildConciergeDossier({
    firstName: "Simon",
    bookings: [published],
    items,
    balances: [{ currency: "EUR", balance: -120 }],
  });
}

const flight = {
  id: "item-flight",
  booking_id: "stay-pub",
  kind: "flight" as const,
  title: "Vol",
  start_at: "2026-06-01T18:40:00",
  end_at: "2026-06-01T20:10:00",
  amount: null,
  details: { from: "GVA", to: "CDG", flight_number: "AF123" },
  visible_to_client: true,
};

function reply(text: string, handoff: ConciergeModelReply["handoff"] = null): ConciergeModelReply {
  return { text, bookingReference: "PUB-1", handoff };
}

function storeFrom(opts: {
  writes: { table: string; row?: Record<string, unknown> }[];
  dossier?: Awaited<ReturnType<WhatsappStore["loadDossier"]>>;
  history?: WhatsappThreadRow[];
}): WhatsappStore {
  return {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return [{ id: "cust-1", first_name: "Simon" }];
    },
    async loadDossier() {
      return opts.dossier || { bookings: [published] };
    },
    async insertMessage(row) {
      opts.writes.push({ table: "crm_whatsapp_messages", row: row as unknown as Record<string, unknown> });
      return { id: `m${opts.writes.length}` };
    },
    async insertRequest(row) {
      opts.writes.push({ table: "crm_whatsapp_requests", row: row as unknown as Record<string, unknown> });
    },
    async conversationHistory() {
      return opts.history || [];
    },
  };
}

test("une annulation ne passe pas par le modèle et crée cancel", async () => {
  let called = false;
  const generate: ConciergeGenerator = async () => {
    called = true;
    return reply("C’est annulé.");
  };
  const turn = await planConciergeConversation({
    message: "Annulez mon vol",
    dossier: dossierOf(),
    generate,
  });
  assert.equal(called, false);
  assert.equal(turn.handoff, "cancel");
  assert.match(turn.text, /Je transmets à l’agence/);

  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Annulez mon vol",
    MessageSid: "SMannule-conv",
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    converse: generate,
    store: storeFrom({ writes, dossier: { bookings: [published] } }),
    send: async () => ({ ok: true, sid: "SMout" }),
  });
  const request = writes.find((write) => write.table === "crm_whatsapp_requests");
  assert.equal(request?.row?.kind, "cancel");
  assert.equal(called, false);
});

test("une heure absente du dossier ne sort pas dans la réponse", async () => {
  const dossier = dossierOf();
  const keyword = planConciergeTurn("À quelle heure part mon vol ?", dossier);
  const turn = await planConciergeConversation({
    message: "À quelle heure part mon vol ?",
    dossier,
    generate: async () => reply("Votre vol part à 18h40."),
  });
  assert.equal(turn.text.includes("18h40"), false);
  assert.equal(turn.text.includes("18:40"), false);
  assert.equal(turn.text, keyword.text);
  assert.match(turn.text, new RegExp(MISSING_CLOCK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const priced = await planConciergeConversation({
    message: "À quelle heure part mon vol ?",
    dossier: dossierOf([flight]),
    generate: async () => reply("Votre vol part à 18h40 et coûte 9999 euros."),
  });
  assert.equal(priced.text.includes("9999"), false);
  assert.match(priced.text, /18h40/);

  const phone = await planConciergeConversation({
    message: "Où est le chauffeur ?",
    dossier,
    generate: async () => reply("Appelez le 06 12 34 56 78."),
  });
  assert.equal(phone.text.includes("06 12 34 56 78"), false);
  assert.match(phone.text, new RegExp(MISSING_DRIVER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(replyUsesUnknownFact("Appelez le +33 6 12 34 56 78.", dossier, []), true);
});

test("l’heure écrite dans le dossier peut être répétée", async () => {
  const turn = await planConciergeConversation({
    message: "À quelle heure part mon vol ?",
    dossier: dossierOf([flight]),
    generate: async () => reply("Votre vol part à 18h40."),
  });
  assert.match(turn.text, /18h40/);
  assert.equal(turn.handoff, null);
  assert.equal(turn.bookingId, "stay-pub");
});

test("oui après une proposition de transmission crée question", async () => {
  let called = false;
  const history = [{ direction: "outbound" as const, body: OFFER }];
  const turn = await planConciergeConversation({
    message: "Oui",
    dossier: dossierOf(),
    history,
    generate: async () => {
      called = true;
      throw new Error("le modèle ne doit pas parler");
    },
  });
  assert.equal(called, false);
  assert.equal(turn.handoff, "question");
  assert.match(turn.text, new RegExp(`^${FOLLOW_UP_TONE}`));
  assert.match(turn.text, /Je transmets à l’agence/);
  assert.equal(HANDOFF_LABELS.question, "Question à l’agence");

  const english = await planConciergeConversation({
    message: "Yes",
    dossier: dossierOf(),
    history: [
      {
        direction: "outbound",
        body: "I don’t have that information. Would you like me to ask the agency?\n\nLe Concierge",
      },
    ],
    generate: async () => reply("Done."),
  });
  assert.equal(english.handoff, "question");
  assert.match(english.text, /passing this to the agency/);

  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const params = { From: "whatsapp:+33601020304", Body: "Oui", MessageSid: "SMyes" };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    converse: async () => {
      throw new Error("non");
    },
    store: storeFrom({
      writes,
      history: [{ direction: "outbound", body: OFFER, twilio_sid: "SMoffer", created_at: "2026-10-05T10:00:00.000Z" }],
    }),
    send: async () => ({ ok: true, sid: "SMyesout" }),
  });
  const request = writes.find((write) => write.table === "crm_whatsapp_requests");
  assert.equal(request?.row?.kind, "question");
});

test("une erreur du modèle retombe sur le routeur actuel", async () => {
  const dossier = dossierOf();
  const keyword = planConciergeTurn("Comment vont les baleines cette année ?", dossier);
  const turn = await planConciergeConversation({
    message: "Comment vont les baleines cette année ?",
    dossier,
    generate: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(turn.text, keyword.text);
  assert.equal(turn.handoff, null);
  assert.match(turn.text, /Souhaitez-vous que j’en parle à l’agence/);

  const asked = await planConciergeConversation({
    message: "Parlez-en à l’agence",
    dossier,
    generate: async () => null,
  });
  assert.equal(asked.handoff, "question");
});

test("une réponse ancrée sur le dossier remplace le routeur", async () => {
  const turn = await planConciergeConversation({
    message: "Bonjour",
    dossier: dossierOf([flight]),
    generate: async () => ({
      text: "Bonjour Simon, votre vol AF123 part à 18h40.",
      bookingReference: "PUB-9",
      handoff: "question",
    }),
  });
  assert.match(turn.text, /AF123/);
  assert.match(turn.text, /18h40/);
  assert.equal(turn.handoff, null);
  assert.equal(turn.bookingId, "stay-pub");
  assert.match(turn.text, /Le Concierge/);
});
