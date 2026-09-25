import assert from "node:assert/strict";
import { test } from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore } from "./whatsapp-inbound";
import {
  FOLLOW_UP_TONE,
  MISSING_CLOCK,
  MISSING_FORMALITY,
  MISSING_PRICE,
  UNKNOWN_NUMBER_REPLY,
  buildConciergeDossier,
  conciergeContextText,
  planConciergeTurn,
} from "./whatsapp-concierge";
import { sendWhatsappSession } from "./whatsapp-session";

const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp";
const TOKEN = "twilio-test-token";

function signed(params: Record<string, string>, signature = "") {
  return signature || twilioRequestSignature(TOKEN, URL_HOOK, params);
}

function storeFrom(opts: {
  customers?: { id: string; first_name: string | null }[];
  dossier?: Parameters<WhatsappStore["loadDossier"]>[0] extends never ? never : Awaited<ReturnType<WhatsappStore["loadDossier"]>>;
  writes: { table: string; row?: Record<string, unknown> }[];
  onCall?: (name: string) => void;
}): WhatsappStore {
  return {
    async findBySid() {
      opts.onCall?.("findBySid");
      return false;
    },
    async customersByPhone() {
      opts.onCall?.("customersByPhone");
      return opts.customers || [];
    },
    async loadDossier() {
      opts.onCall?.("loadDossier");
      return opts.dossier || {};
    },
    async insertMessage(row) {
      opts.onCall?.("insertMessage");
      opts.writes.push({ table: "crm_whatsapp_messages", row: row as unknown as Record<string, unknown> });
      return { id: `m${opts.writes.length}` };
    },
    async insertRequest(row) {
      opts.onCall?.("insertRequest");
      opts.writes.push({ table: "crm_whatsapp_requests", row: row as unknown as Record<string, unknown> });
    },
  };
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
  notes_internal: "note interne secrète",
};

const draft = {
  id: "stay-draft",
  reference: "DRAFT-9",
  title: "Séjour secret brouillon",
  destination: "Tokyo secret",
  start_date: "2026-03-01",
  end_date: "2026-03-08",
  currency: "EUR",
  total_amount: 4200,
  visible_to_client: false,
  prices_visible: true,
  cover_image_path: "bookings/draft/cover.webp",
  notes_client: "note brouillon",
  notes_internal: "note interne secrète",
};

function mixedDossier() {
  return {
    bookings: [draft, published],
    items: [
      {
        id: "item-draft",
        booking_id: "stay-draft",
        kind: "hotel" as const,
        title: "Hôtel brouillon",
        start_at: "2026-03-01",
        end_at: "2026-03-08",
        amount: 4200,
        details: { hotel_name: "Hôtel Brouillon Secret", city: "Tokyo" },
        visible_to_client: true,
      },
      {
        id: "item-hidden",
        booking_id: "stay-pub",
        kind: "hotel" as const,
        title: "Hôtel non publié",
        start_at: "2026-02-10",
        end_at: "2026-02-17",
        amount: 100,
        details: { hotel_name: "Hôtel Masqué", city: "Avoriaz" },
        visible_to_client: false,
      },
      {
        id: "item-hotel",
        booking_id: "stay-pub",
        kind: "hotel" as const,
        title: "Hôtel des Dromonts",
        start_at: "2026-02-10",
        end_at: "2026-02-17",
        amount: 800,
        details: { hotel_name: "Hôtel des Dromonts", city: "Avoriaz" },
        visible_to_client: true,
      },
      {
        id: "item-flight",
        booking_id: "stay-pub",
        kind: "flight" as const,
        title: "Vol",
        start_at: "2026-02-10T00:00:00",
        end_at: "2026-02-10T00:00:00",
        amount: null,
        details: { from: "GVA", to: "CDG", flight_number: "AF123" },
        visible_to_client: true,
      },
    ],
    visaRequests: [
      { booking_id: "stay-draft", country: "US", status: "piece", step: "piece" },
    ],
    travelDocuments: [
      {
        doc_type: "passport" as const,
        first_name: "Simon",
        last_name: "Martin",
        expires_on: "2030-01-12",
        number: "12AB34567",
      },
    ],
    transactions: [
      {
        booking_id: "stay-draft",
        direction: "debit" as const,
        kind: "booking" as const,
        amount: 4200,
        currency: "EUR",
        occurred_on: "2026-01-02",
        label: "Ajustement",
        status: "posted" as const,
      },
    ],
    balances: [{ currency: "EUR", balance: -120 }],
  };
}

test("signature Twilio refusée : rien n’est lu ni envoyé", async () => {
  const writes: { table: string }[] = [];
  let sent = 0;
  const result = await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: "signature-invalide",
    params: { From: "whatsapp:+33601020304", Body: "Bonjour", MessageSid: "SMrefuse" },
    authToken: TOKEN,
    store: storeFrom({ writes, onCall: () => assert.fail("le store ne doit pas être appelé") }),
    send: async () => {
      sent += 1;
      return { ok: true, sid: "SMx" };
    },
  });
  assert.equal(result.status, 403);
  assert.equal(sent, 0);
  assert.equal(writes.length, 0);
});

test("numéro inconnu : une phrase, pas de dossier", async () => {
  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const sent: { body: string; mediaUrl?: string | null }[] = [];
  const params = {
    From: "whatsapp:+33699001122",
    Body: "Créez mon dossier pour Tokyo",
    MessageSid: "SMinconnu",
  };
  const result = await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store: storeFrom({ writes, customers: [] }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMout" };
    },
  });
  assert.equal(result.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, UNKNOWN_NUMBER_REPLY);
  assert.equal(sent[0].body.includes(FOLLOW_UP_TONE), false);
  assert.equal(sent[0].mediaUrl ?? null, null);
  assert.deepEqual(
    writes.map((write) => write.table),
    ["crm_whatsapp_messages", "crm_whatsapp_messages"]
  );
  assert.equal(writes.every((write) => write.row.customer_id == null), true);
  assert.equal(writes.some((write) => write.table === "crm_whatsapp_requests"), false);
  assert.equal(JSON.stringify(writes).includes("Tokyo"), true);
  assert.equal(JSON.stringify(writes).includes("crm_bookings"), false);
});

test("le contexte du Concierge ignore le brouillon", async () => {
  const dossier = buildConciergeDossier({ firstName: "Simon", ...mixedDossier() });
  const context = conciergeContextText(dossier);
  assert.equal(context.includes("brouillon"), false);
  assert.equal(context.includes("secret"), false);
  assert.equal(context.includes("DRAFT-9"), false);
  assert.equal(context.includes("Masqué"), false);
  assert.equal(context.includes("12AB34567"), false);
  assert.equal(context.includes("note interne"), false);
  assert.equal(context.includes("Hôtel des Dromonts"), true);
  assert.equal(context.includes("PUB-1"), true);
  assert.equal(context.includes("9999"), false);

  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Où en est ma formalité et mon hôtel ?",
    MessageSid: "SMbrouillon",
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: mixedDossier(),
    }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMreply" };
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.includes(FOLLOW_UP_TONE), false);
  assert.match(sent[0].body, /Le Concierge/);
  assert.match(sent[0].body, /Hôtel des Dromonts|Je n’ai pas de formalité/);
  assert.equal(sent[0].body.includes("brouillon"), false);
  assert.equal(sent[0].body.includes("secret"), false);
  assert.equal(sent[0].body.includes("12AB34567"), false);
  assert.equal(sent[0].body.includes("prête"), false);
  assert.equal(sent[0].body.includes("00h"), false);
});

test("une demande d’annulation est transmise sans écriture métier", async () => {
  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const sent: { body: string; mediaUrl?: string | null }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Annulez mon séjour s’il vous plaît",
    MessageSid: "SMannule",
  };
  const result = await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: mixedDossier(),
    }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMhandoff" };
    },
  });
  assert.equal(result.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, new RegExp(`^${FOLLOW_UP_TONE}`));
  assert.match(sent[0].body, /Je transmets à l’agence/);
  assert.match(sent[0].body, /PUB-1/);
  assert.match(sent[0].body, /Le Concierge/);
  assert.equal(sent[0].body.includes("brouillon"), false);
  assert.equal(sent[0].mediaUrl ?? null, null);
  assert.deepEqual(
    [...new Set(writes.map((write) => write.table))].sort(),
    ["crm_whatsapp_messages", "crm_whatsapp_requests"]
  );
  const request = writes.find((write) => write.table === "crm_whatsapp_requests");
  assert.equal(request?.row.kind, "cancel");
  assert.equal(request?.row.customer_id, "cust-1");
  assert.equal(request?.row.booking_id, "stay-pub");
  assert.equal(JSON.stringify(writes).includes("crm_bookings"), false);
  assert.equal(JSON.stringify(writes).includes("crm_transactions"), false);
  assert.equal(JSON.stringify(writes).includes("crm_visa"), false);
});

test("sans horaire, sans prix publié et sans couverture, rien n’est inventé", () => {
  const dossier = buildConciergeDossier({ firstName: "Simon", ...mixedDossier() });
  const clock = planConciergeTurn("À quelle heure part mon vol ?", dossier);
  assert.equal(clock.text.includes(FOLLOW_UP_TONE), false);
  assert.match(clock.text, new RegExp(MISSING_CLOCK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(clock.text.includes("00h"), false);
  assert.equal(clock.text.includes("00:00"), false);

  const price = planConciergeTurn("Quel est le prix du séjour ?", dossier);
  assert.match(price.text, new RegExp(MISSING_PRICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(price.text.includes("9999"), false);
  assert.equal(price.text.includes("4"), false);

  const bare = buildConciergeDossier({
    bookings: [
      {
        ...published,
        destination: "Nullepartxyz",
        title: "Nullepartxyz",
        cover_image_path: null,
      },
    ],
  });
  const stay = planConciergeTurn("Parlez-moi de mon séjour", bare);
  assert.equal(stay.cover, null);
  assert.equal(stay.text.includes(FOLLOW_UP_TONE), false);
  assert.match(stay.text, /Le Concierge/);
  assert.match(stay.text, /https:\/\/travelba\.fr\/mon-compte\/reservations\/PUB-1/);

  const covered = buildConciergeDossier({
    bookings: [{ ...published, cover_image_path: "bookings/stay-pub/cover.webp" }],
  });
  const withPhoto = planConciergeTurn("Parlez-moi de mon séjour", covered);
  assert.deepEqual(withPhoto.cover, { kind: "file", path: "bookings/stay-pub/cover.webp" });
  assert.equal(withPhoto.text.includes("cover.webp"), false);

  const formality = planConciergeTurn("Où en est mon ESTA ?", dossier);
  assert.match(formality.text, new RegExp(MISSING_FORMALITY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(formality.text.includes("approuv"), false);
});

test("changer, rapprocher, déposer ou commander part à l’agence", () => {
  const dossier = buildConciergeDossier({ firstName: "Simon", ...mixedDossier() });
  const cases = [
    ["Je voudrais modifier les dates du séjour", "change"],
    ["Annulez mon séjour", "cancel"],
    ["J’ai fait un virement, merci de le rapprocher", "payment"],
    ["Déposez ma formalité ESTA", "formality"],
    ["Commandez un chauffeur pour l’arrivée", "chauffeur"],
  ] as const;
  for (const [message, kind] of cases) {
    const turn = planConciergeTurn(message, dossier);
    assert.equal(turn.handoff, kind);
    assert.match(turn.text, new RegExp(`^${FOLLOW_UP_TONE}`));
    assert.match(turn.text, /Je transmets à l’agence/);
    assert.match(turn.text, /Le Concierge/);
    assert.equal(turn.cover, null);
    assert.equal(turn.text.includes("brouillon"), false);
  }
});

test("la réponse de chat est du texte libre, pas un modèle", async () => {
  const previous = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_WHATSAPP_FROM,
  };
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
  try {
    let raw = "";
    const result = await sendWhatsappSession({
      to: "whatsapp:+33601020304",
      body: "Je transmets à l’agence.\n\nLe Concierge",
      mediaUrl: "https://travelba.fr/api/covers/photo-avoriaz",
      fetchImpl: async (_url, init) => {
        raw = String(init?.body ?? "");
        return new Response(JSON.stringify({ sid: "SMchat" }), { status: 201 });
      },
    });
    assert.equal(result.ok, true);
    const params = new URLSearchParams(raw);
    assert.equal(params.get("Body")?.includes("Je transmets à l’agence."), true);
    assert.equal(params.get("ContentSid"), null);
    assert.equal(params.get("ContentVariables"), null);
    assert.equal(params.get("MediaUrl"), "https://travelba.fr/api/covers/photo-avoriaz");
  } finally {
    for (const [key, value] of Object.entries({
      TWILIO_ACCOUNT_SID: previous.sid,
      TWILIO_AUTH_TOKEN: previous.token,
      TWILIO_WHATSAPP_FROM: previous.from,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
