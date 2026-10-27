import assert from "node:assert/strict";
import { test } from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import {
  bytesContainPan,
  burstReply,
  createWhatsappSupabaseStore,
  downloadTwilioMedia,
  matchStaffByPhone,
  receiveWhatsappWebhook,
  type WhatsappStore,
} from "./whatsapp-inbound";
import {
  FOLLOW_UP_TONE,
  HANDOFF_NOT_RECORDED,
  MISSING_CLOCK,
  MISSING_FORMALITY,
  MISSING_PRICE,
  UNKNOWN_NUMBER_REPLY,
  buildConciergeDossier,
  conciergeContextText,
  planConciergeTurn,
  proactiveWhatsappAllowed,
  replyClaimsAgencyHandoff,
  transactionsClientUrl,
} from "./whatsapp-concierge";
import { sendWhatsappSession } from "./whatsapp-session";
import { issueConciergeMagicLink } from "./whatsapp-access";

const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp";
const TOKEN = "twilio-test-token";
process.env.CONCIERGE_AUTOREPLY = "1";

function signed(params: Record<string, string>, signature = "") {
  return signature || twilioRequestSignature(TOKEN, URL_HOOK, params);
}

function storeFrom(opts: {
  customers?: { id: string; first_name: string | null; email?: string | null }[];
  dossier?: Parameters<WhatsappStore["loadDossier"]>[0] extends never ? never : Awaited<ReturnType<WhatsappStore["loadDossier"]>>;
  writes: { table: string; row?: Record<string, unknown> }[];
  onCall?: (name: string) => void;
  optOut?: (customerId: string) => Promise<void>;
  savePiece?: WhatsappStore["savePiece"];
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
    optOut: opts.optOut,
    savePiece: opts.savePiece,
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
  share_code: "ABCDEFGH",
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
    ["crm_whatsapp_messages", "crm_whatsapp_requests", "crm_whatsapp_messages"]
  );
  assert.equal(writes.every((write) => write.row.customer_id == null), true);
  const lead = writes.find((write) => write.table === "crm_whatsapp_requests");
  assert.equal(lead?.row.kind, "lead");
  assert.equal(lead?.row.phone, "+33699001122");
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
  assert.match(sent[0].body, /Hôtel des Dromonts|je n’ai pas de formalité/i);
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
  assert.match(clock.text, new RegExp(MISSING_CLOCK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.equal(clock.text.includes("00h"), false);
  assert.equal(clock.text.includes("00:00"), false);

  const price = planConciergeTurn("Quel est le prix du séjour ?", dossier);
  assert.match(price.text, new RegExp(MISSING_PRICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
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
  assert.equal(withPhoto.cover, "https://travelba.fr/api/covers/sejour/PUB-1?partage=ABCDEFGH");
  const unshared = buildConciergeDossier({
    bookings: [{ ...published, cover_image_path: "bookings/stay-pub/cover.webp", share_code: null }],
  });
  assert.equal(planConciergeTurn("Parlez-moi de mon séjour", unshared).cover, null);
  assert.equal(withPhoto.text.includes("cover.webp"), false);
  assert.equal(withPhoto.text.includes("/api/covers/"), false);
  const papers = buildConciergeDossier({
    bookings: [{ ...published, cover_image_path: "bookings/stay-pub/cover.webp" }],
    travelDocuments: [
      { doc_type: "passport", first_name: "Simon", last_name: "Martin", expires_on: "2030-01-12" },
    ],
    visaRequests: [{ booking_id: "stay-pub", country: "US", status: "piece" }],
  });
  const passport = planConciergeTurn("Où est mon passeport ?", papers);
  assert.equal(passport.cover, "https://travelba.fr/whatsapp/passeport.jpg");
  const visa = planConciergeTurn("Où en est mon visa ?", papers);
  assert.equal(visa.cover, "https://travelba.fr/whatsapp/visa.jpg");
  assert.equal(visa.text.includes("/api/covers/"), false);
  const thin = planConciergeTurn("À quelle heure est le vol ?", covered);
  assert.equal(thin.cover, null);

  const formality = planConciergeTurn("Où en est mon ESTA ?", dossier);
  assert.match(formality.text, new RegExp(MISSING_FORMALITY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
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
    assert.match(turn.text, kind === "payment" ? /Je transmets à Benjamin/ : /Je transmets à l’agence/);
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
    const refused = await sendWhatsappSession({
      to: "whatsapp:+33601020304",
      body: "Relevé",
      fetchImpl: async () => new Response(JSON.stringify({ sid: "SMfail", error_code: 63016, status: "failed" }), { status: 201 }),
    });
    assert.equal(refused.ok, false);
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

test("plusieurs séjours : il demande lequel, l’encours a le lien", () => {
  const dossier = buildConciergeDossier({
    firstName: "Simon",
    bookings: [
      published,
      {
        ...published,
        id: "stay-2",
        reference: "PUB-2",
        title: "Kyoto",
        destination: "Kyoto",
        start_date: "2026-04-01",
        end_date: "2026-04-08",
      },
    ],
    balances: [{ currency: "EUR", balance: -120 }],
  });
  const stay = planConciergeTurn("Parlez-moi de mon séjour", dossier);
  assert.match(stay.text, /Lequel vous intéresse/);
  assert.match(stay.text, /PUB-1/);
  assert.match(stay.text, /PUB-2/);
  assert.equal(stay.text.includes("Hôtel des Dromonts"), false);
  assert.equal(stay.text.includes(FOLLOW_UP_TONE), false);
  assert.equal(stay.cover, null);
  assert.match(stay.text, /vous/);
  assert.equal(/\btu\b/i.test(stay.text), false);

  const named = planConciergeTurn("Parlez-moi du séjour PUB-2", dossier);
  assert.match(named.text, /PUB-2/);
  assert.equal(named.text.includes("Lequel vous intéresse"), false);

  const balance = planConciergeTurn("Quel est mon encours ?", dossier);
  assert.match(balance.text, /120/);
  assert.match(balance.text, new RegExp(transactionsClientUrl().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(balance.handoff, null);
  assert.equal(balance.text.includes(FOLLOW_UP_TONE), false);
});

test("hors dossier : conseil sans fait inventé, sinon l’agence", () => {
  const dossier = buildConciergeDossier({ firstName: "Simon", ...mixedDossier() });
  const advice = planConciergeTurn("Quel adaptateur de prise prévoir ?", dossier);
  assert.match(advice.text, /230 volts/);
  assert.equal(advice.text.includes("00h"), false);
  assert.equal(advice.text.includes("9999"), false);
  assert.equal(advice.handoff, null);

  const unknown = planConciergeTurn("Comment vont les baleines cette année ?", dossier);
  assert.match(unknown.text, /Souhaitez-vous que j’en parle à Benjamin/);
  assert.equal(unknown.text.includes("00h"), false);
  assert.equal(unknown.handoff, null);

  const complaint = planConciergeTurn("C’est inacceptable, à quelle heure part mon vol ?", dossier);
  assert.match(complaint.text, new RegExp(MISSING_CLOCK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.match(complaint.text, /Je transmets à Benjamin/);
  assert.equal(complaint.handoff, "complaint");
  assert.equal(complaint.text.includes(FOLLOW_UP_TONE), false);
});

test("anglais, stop, et lien d’accès sans mot de passe", async () => {
  const dossier = buildConciergeDossier({ firstName: "Simon", ...mixedDossier() });
  const english = planConciergeTurn("What time is my flight?", dossier);
  assert.match(english.text, /I don’t have the time/);
  assert.match(english.text, /Le Concierge/);
  assert.equal(english.text.includes("00h"), false);
  assert.equal(english.text.includes(FOLLOW_UP_TONE), false);

  assert.equal(proactiveWhatsappAllowed({ whatsapp_opt_in_at: "2026-01-01", whatsapp_opt_out_at: null }), true);
  assert.equal(proactiveWhatsappAllowed({ whatsapp_opt_in_at: "2026-01-01", whatsapp_opt_out_at: "2026-02-01" }), false);

  let opted = false;
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string; mediaUrl?: string | null }[] = [];
  const stop = {
    From: "whatsapp:+33601020304",
    Body: "Stop",
    MessageSid: "SMstop",
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(stop),
    params: stop,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: mixedDossier(),
      optOut: async () => {
        opted = true;
      },
    }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMstopout" };
    },
  });
  assert.equal(opted, true);
  assert.match(sent[0].body, /coupés/);
  assert.equal(sent[0].body.includes(FOLLOW_UP_TONE), false);
  assert.equal(sent[0].mediaUrl, null);

  const again = { ...stop, Body: "Bonjour", MessageSid: "SMencore" };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(again),
    params: again,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: mixedDossier(),
    }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMencoreout" };
    },
  });
  assert.ok(sent.length >= 2);
  assert.match(sent.map((message) => message.body).join("\n"), /Bonjour Simon/);

  const access = {
    From: "whatsapp:+33601020304",
    Body: "Ouvrez mon espace, j’ai perdu le mot de passe",
    MessageSid: "SMacces",
  };
  const secret = "Secret123";
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(access),
    params: access,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon", email: "simon@example.com" }],
      dossier: mixedDossier(),
    }),
    openAccess: async () => "https://travelba.fr/e/c/AB23EFGH",
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMaccesout" };
    },
  });
  const opened = sent.find((message) => message.body.includes("https://travelba.fr/e/c/AB23EFGH"));
  assert.ok(opened);
  assert.equal(opened.body.includes(secret), false);
  assert.equal(opened.body.includes(FOLLOW_UP_TONE), false);
  assert.equal(writes.some((write) => write.table === "crm_whatsapp_requests" && write.row?.kind === "complaint"), false);
});

test("photo ou pdf : coffre privé, pas de pan, une seule réponse au paquet", async () => {
  const pan = new TextEncoder().encode("carte 4111111111111111");
  assert.equal(bytesContainPan(pan), true);
  assert.equal(bytesContainPan(new TextEncoder().encode("0000000000 65535 xref")), false);
  assert.equal(bytesContainPan(new TextEncoder().encode("4111111111 111111")), false);
  assert.equal(bytesContainPan(new TextEncoder().encode("4111 1111 1111 1111")), true);
  const pieces: { contentType: string; bytes: Uint8Array }[] = [];
  const sent: { body: string; mediaUrl?: string | null }[] = [];
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const pdf = {
    From: "whatsapp:+33601020304",
    Body: "",
    NumMedia: "1",
    MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Media/ME1",
    MediaContentType0: "application/pdf",
    MessageSid: "SMpdf",
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(pdf),
    params: pdf,
    authToken: TOKEN,
    accountSid: "ACtest",
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: mixedDossier(),
      savePiece: async (piece) => {
        pieces.push(piece);
        if (bytesContainPan(piece.bytes)) return "pan";
        return "saved";
      },
    }),
    fetchImpl: async () => new Response(pan, { status: 200, headers: { "content-type": "application/pdf" } }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMpdfout" };
    },
  });
  assert.equal(pieces.length, 0);
  assert.match(sent[0].body, /numéro de carte/i);
  assert.equal(sent[0].body.includes("4111"), false);
  assert.equal(JSON.stringify(writes).includes("4111"), false);
  assert.equal(sent[0].mediaUrl, null);
  assert.equal(writes.some((write) => write.table === "crm_whatsapp_requests"), false);

  const photo = { ...pdf, MessageSid: "SMphoto", MediaContentType0: "image/jpeg" };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(photo),
    params: photo,
    authToken: TOKEN,
    accountSid: "ACtest",
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: mixedDossier(),
      savePiece: async (piece) => {
        pieces.push(piece);
        return "saved";
      },
    }),
    fetchImpl: async (url) => {
      assert.equal(String(url).includes("Media"), true);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    },
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMphotoout" };
    },
  });
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].contentType, "image/jpeg");
  assert.match(sent[1].body, /coffre/);
  assert.equal(sent[1].body.includes(FOLLOW_UP_TONE), false);
  assert.equal(sent[1].mediaUrl, null);

  const first = burstReply("SM1", [
    { direction: "inbound", body: "Bonjour", twilio_sid: "SM1", created_at: "2026-09-25T10:00:00Z" },
    { direction: "inbound", body: "Quel est mon encours ?", twilio_sid: "SM2", created_at: "2026-09-25T10:00:01Z" },
  ]);
  assert.equal(first.send, false);
  const second = burstReply("SM2", [
    { direction: "inbound", body: "Bonjour", twilio_sid: "SM1", created_at: "2026-09-25T10:00:00Z" },
    { direction: "inbound", body: "Quel est mon encours ?", twilio_sid: "SM2", created_at: "2026-09-25T10:00:01Z" },
  ]);
  assert.equal(second.send, true);
  assert.match(second.text || "", /encours/);

  const blocked = await downloadTwilioMedia({
    url: "https://example.com/secret.pdf",
    accountSid: "ACtest",
    authToken: TOKEN,
    fetchImpl: async () => {
      assert.fail("hors Twilio");
    },
  });
  assert.equal(blocked, null);
});

test("le lien d’accès est un magic link", async () => {
  let otp = "";
  const admin = {
    auth: {
      admin: {
        generateLink: async (args: { type: string; email: string }) => {
          otp = args.type;
          assert.equal(args.email, "simon@example.com");
          return { data: { properties: { hashed_token: "hash" } }, error: null };
        },
      },
    },
    from(table: string) {
      assert.equal(table, "crm_entry_links");
      return {
        insert: async (row: { otp_type: string; next_path: string; email: string; show_cover: boolean }) => {
          assert.equal(row.otp_type, "magiclink");
          assert.equal(row.next_path, "/mon-compte");
          assert.equal(row.email, "simon@example.com");
          assert.equal(row.show_cover, false);
          return { error: null };
        },
      };
    },
  };
  const link = await issueConciergeMagicLink(admin as never, "simon@example.com");
  assert.equal(otp, "magiclink");
  assert.match(link || "", /^https:\/\/travelba\.fr\/e\/c\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  assert.equal((link || "").includes("password"), false);
});

test("une réponse sur le séjour joint la photo du lieu", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string; mediaUrl?: string | null }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Parlez-moi de mon séjour",
    MessageSid: "SMsejourphoto",
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: {
        bookings: [{ ...published, cover_image_path: "bookings/stay-pub/cover.webp" }],
      },
    }),
    fetchImpl: async (url) => {
      assert.match(String(url), /\/api\/covers\/sejour\/PUB-1\?partage=ABCDEFGH$/);
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    },
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMsejourout" };
    },
  });
  assert.equal(sent[0].mediaUrl, "https://travelba.fr/api/covers/sejour/PUB-1?partage=ABCDEFGH");
  assert.equal(sent[0].body.includes("cover.webp"), false);
  assert.equal(sent[0].body.includes("/api/covers/"), false);
});

const victoriaOnFile = {
  voyageurId: "81844f9d-cd14-44c4-8f1d-5f054407d2be",
  bookingId: "stay-pub",
  reference: "TB-2026-0096",
  customerId: "cust-1",
  firstName: "Victoria",
  lastName: "Martin",
  usageName: null,
  companionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  isHolder: false,
  phone: null,
  email: null,
  birthDate: null,
};

test("le concierge ajoute le numéro demandé sur le voyageur du fil", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  let wrote = false;
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Peux tu ajouter le numéro de téléphone de Victoria 06 12 34 56 78 ?",
    MessageSid: "SMvictoria",
  };
  const store = storeFrom({
    writes,
    customers: [{ id: "cust-1", first_name: "Simon" }],
  });
  store.loadParty = async () => [victoriaOnFile];
  store.commitClientWrite = async () => {
    wrote = true;
    return {
      ok: true,
      summary: "J’ai ajouté le numéro de Victoria : +33 6 12 34 56 78.",
      bookingId: "stay-pub",
      customerId: "cust-1",
    };
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store,
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMvictoriaout" };
    },
  });
  assert.equal(wrote, true);
  assert.match(sent[0].body, /J’ai ajouté le numéro de Victoria/);
  assert.equal(sent[0].body.includes("0664349810"), false);
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_requests"), false);
  const outbound = writes.find((row) => row.table === "crm_whatsapp_messages" && row.row?.direction === "outbound");
  assert.deepEqual(outbound?.row?.tools, ["modifier_voyageur"]);
});

test("un numéro inconnu n’écrit pas sur un dossier", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  let wrote = false;
  const params = {
    From: "whatsapp:+33699000000",
    Body: "Peux tu ajouter le numéro de téléphone de Victoria 06 12 34 56 78 ?",
    MessageSid: "SMunknown",
  };
  const store = storeFrom({ writes, customers: [] });
  store.loadParty = async () => {
    throw new Error("party");
  };
  store.commitClientWrite = async () => {
    wrote = true;
    return { ok: false, message: "non" };
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store,
    send: async () => ({ ok: true, sid: "SMunknownout" }),
  });
  assert.equal(wrote, false);
});

test("annuler le séjour passe à l’agence, payer n’encaisse rien", async () => {
  const cancelWrites: { table: string; row?: Record<string, unknown> }[] = [];
  let space = false;
  const cancelParams = {
    From: "whatsapp:+33601020304",
    Body: "Annulez mon séjour s’il vous plaît",
    MessageSid: "SMcancelstay",
  };
  const cancelStore = storeFrom({
    writes: cancelWrites,
    customers: [{ id: "cust-1", first_name: "Simon" }],
    dossier: { bookings: [published] },
  });
  cancelStore.loadParty = async () => [victoriaOnFile];
  cancelStore.performSpace = async () => {
    space = true;
    return { ok: false, summary: "no", bookingId: null, handoff: "cancel", access: false, tool: "annuler_hotel" };
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(cancelParams),
    params: cancelParams,
    authToken: TOKEN,
    store: cancelStore,
    send: async () => ({ ok: true, sid: "SMcancelout" }),
  });
  assert.equal(space, false);
  const request = cancelWrites.find((row) => row.table === "crm_whatsapp_requests");
  assert.equal(request?.row?.kind, "cancel");

  const payWrites: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  const payParams = {
    From: "whatsapp:+33601020304",
    Body: "Je veux payer mon encours",
    MessageSid: "SMpay",
  };
  const payStore = storeFrom({
    writes: payWrites,
    customers: [{ id: "cust-1", first_name: "Simon" }],
  });
  payStore.loadParty = async () => [victoriaOnFile];
  payStore.performSpace = async (row) => {
    assert.equal(row.actionId, "regler_encours");
    assert.equal(row.holder, true);
    return {
      ok: false,
      summary: "Le règlement se confirme dans Transactions. Choisissez un moyen de règlement.",
      bookingId: null,
      handoff: null,
      access: true,
      tool: "regler_encours",
    };
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(payParams),
    params: payParams,
    authToken: TOKEN,
    store: payStore,
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMpayout" };
    },
  });
  assert.match(sent[0].body, /Transactions/);
  assert.equal(payWrites.some((row) => row.table === "crm_whatsapp_requests"), false);
});

const SHARE_SENTENCE =
  "Est-ce que tu peux envoyer la réservation partagée la réservation de Nice par WhatsApp à Victoria";

test("la phrase de Victoria part vers elle, sans dire que l’agence a la demande", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  let action = "";
  let name: string | null = null;
  const params = {
    From: "whatsapp:+33601020304",
    Body: SHARE_SENTENCE,
    MessageSid: "SMpartagevictoria",
  };
  const store = storeFrom({
    writes,
    customers: [{ id: "cust-1", first_name: "Simon" }],
    dossier: { bookings: [{ ...published, destination: "Nice", title: "Nice" }] },
  });
  store.loadParty = async () => [
    {
      ...victoriaOnFile,
      firstName: "Victoria Marie Rebecca",
      lastName: "Tétard",
      usageName: "Martin",
      phone: "+33611111111",
      stayDestination: "Nice",
      stayTitle: "Anantara Plaza Nice",
    },
  ];
  store.performSpace = async (row) => {
    action = row.actionId;
    name = row.name;
    return {
      ok: true,
      summary: "Lien envoyé à Victoria par WhatsApp.",
      bookingId: "stay-pub",
      handoff: null,
      access: false,
      tool: "partager_carnet",
    };
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store,
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMshareout" };
    },
  });
  assert.equal(action, "partager_carnet");
  assert.equal(name, "Victoria");
  assert.match(sent[0].body, /Lien envoyé à Victoria/);
  assert.equal(replyClaimsAgencyHandoff(sent[0].body), false);
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_requests"), false);
  const outbound = writes.find((row) => row.table === "crm_whatsapp_messages" && row.row?.direction === "outbound");
  assert.deepEqual(outbound?.row?.tools, ["partager_carnet"]);
});

test("un échec d’envoi est dit tel quel", async () => {
  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: SHARE_SENTENCE,
    MessageSid: "SMpartageechec",
  };
  const store = storeFrom({
    writes,
    customers: [{ id: "cust-1", first_name: "Simon" }],
  });
  store.loadParty = async () => [{ ...victoriaOnFile, stayDestination: "Nice", phone: "+33611111111" }];
  store.performSpace = async () => ({
    ok: false,
    summary: "Hors des 24 heures, WhatsApp ne peut pas envoyer ce lien. Copiez-le.",
    bookingId: "stay-pub",
    handoff: null,
    access: false,
    tool: "partager_carnet",
  });
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store,
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMsharefail" };
    },
  });
  assert.match(sent[0].body, /Hors des 24 heures/);
  assert.equal(replyClaimsAgencyHandoff(sent[0].body), false);
  assert.equal(writes.some((row) => row.table === "crm_whatsapp_requests"), false);
});

test("l’équipe demande le partage par la référence ou par le client", async () => {
  const byRef: { table: string; row?: Record<string, unknown> }[] = [];
  let reference = "";
  const refParams = {
    From: "whatsapp:+33664349810",
    Body: "Envoie le séjour TB-2026-0096 à Victoria",
    MessageSid: "SMstaffref",
  };
  const refStore = storeFrom({ writes: byRef, customers: [] });
  refStore.staffByPhone = async () => ({ id: "staff-1" });
  refStore.loadParty = async () => [];
  refStore.loadPartyByReference = async (value) => {
    reference = value;
    return [{ ...victoriaOnFile, phone: "+33611111111", stayDestination: "Nice" }];
  };
  refStore.performSpace = async (row) => ({
    ok: true,
    summary: "Lien envoyé à Victoria par WhatsApp.",
    bookingId: row.party[0]?.bookingId || null,
    handoff: null,
    access: false,
    tool: row.tool,
  });
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(refParams),
    params: refParams,
    authToken: TOKEN,
    store: refStore,
    send: async () => ({ ok: true, sid: "SMstaffrefout" }),
  });
  assert.equal(reference, "TB-2026-0096");
  assert.equal(byRef.some((row) => row.table === "crm_whatsapp_requests"), false);

  const byName: { table: string; row?: Record<string, unknown> }[] = [];
  let client = "";
  const nameParams = {
    From: "whatsapp:+33664349810",
    Body: "Partage la réservation de Camille Martin à Victoria",
    MessageSid: "SMstaffnom",
  };
  const nameStore = storeFrom({ writes: byName, customers: [] });
  nameStore.staffByPhone = async () => ({ id: "staff-1" });
  nameStore.loadParty = async () => [];
  nameStore.loadPartyByClientName = async (value) => {
    client = value;
    return { party: [{ ...victoriaOnFile, customerId: "cust-camille", phone: "+33611111111" }] };
  };
  nameStore.performSpace = async () => ({
    ok: true,
    summary: "Lien envoyé à Victoria par WhatsApp.",
    bookingId: "stay-pub",
    handoff: null,
    access: false,
    tool: "partager_carnet",
  });
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(nameParams),
    params: nameParams,
    authToken: TOKEN,
    store: nameStore,
    send: async () => ({ ok: true, sid: "SMstaffnomout" }),
  });
  assert.equal(client, "Camille Martin");
  assert.equal(byName.some((row) => row.table === "crm_whatsapp_requests"), false);
});

test("un téléphone d’équipe au format national est le même numéro", () => {
  assert.equal(matchStaffByPhone([{ id: "staff-1", phone: "06 64 34 98 10" }], "+33664349810")?.id, "staff-1");
  assert.equal(
    matchStaffByPhone(
      [
        { id: "a", phone: "06 12 34 56 78" },
        { id: "b", phone: "+33612345678" },
      ],
      "+33612345678"
    ),
    null
  );
  const admin = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        limit() {
          return api;
        },
        eq() {
          return api;
        },
        then(resolve: (value: { data: { id: string; phone: string }[]; error: null }) => void) {
          resolve(
            table === "crm_staff"
              ? { data: [{ id: "staff-1", phone: "06 64 34 98 10" }], error: null }
              : { data: [], error: null }
          );
        },
      };
      return api;
    },
  };
  return createWhatsappSupabaseStore(admin as never).staffByPhone?.("+33664349810").then((found) => {
    assert.equal(found?.id, "staff-1");
  });
});

test("dire que la demande est passée crée la ligne, sinon la phrase est retirée", async () => {
  assert.equal(replyClaimsAgencyHandoff("J’ai passé votre demande à l’agence."), true);
  assert.equal(replyClaimsAgencyHandoff("Je transmets à l’agence."), true);
  assert.equal(replyClaimsAgencyHandoff(HANDOFF_NOT_RECORDED), false);
  assert.equal(replyClaimsAgencyHandoff("Souhaitez-vous que j’en parle à Benjamin ?"), false);

  const writes: { table: string; row?: Record<string, unknown> }[] = [];
  const sent: { body: string }[] = [];
  const params = {
    From: "whatsapp:+33601020304",
    Body: "Comment vont les baleines cette année ?",
    MessageSid: "SMbaleine",
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(params),
    params,
    authToken: TOKEN,
    store: storeFrom({
      writes,
      customers: [{ id: "cust-1", first_name: "Simon" }],
      dossier: { bookings: [published] },
    }),
    converse: async () => ({
      text: "J’ai passé votre demande à l’agence.",
      bookingReference: null,
      handoff: null,
    }),
    send: async (message) => {
      sent.push(message);
      return { ok: true, sid: "SMbaleineout" };
    },
  });
  assert.match(sent.map((row) => row.body).join("\n"), /passé votre demande à l’agence/);
  assert.equal(writes.find((row) => row.table === "crm_whatsapp_requests")?.row?.kind, "question");

  const missed: { table: string; row?: Record<string, unknown> }[] = [];
  const honest: { body: string }[] = [];
  const again = {
    From: "whatsapp:+33601020304",
    Body: "Comment vont les baleines cette année ?",
    MessageSid: "SMbaleine2",
  };
  const store = storeFrom({
    writes: missed,
    customers: [{ id: "cust-1", first_name: "Simon" }],
    dossier: { bookings: [published] },
  });
  store.insertRequest = async () => {
    throw new Error("db");
  };
  await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(again),
    params: again,
    authToken: TOKEN,
    store,
    converse: async () => ({
      text: "J’ai passé votre demande à l’agence.",
      bookingReference: null,
      handoff: null,
    }),
    send: async (message) => {
      honest.push(message);
      return { ok: true, sid: "SMbaleine2out" };
    },
  });
  const body = honest.map((row) => row.body).join("\n");
  assert.match(body, /Je n’ai pas transmis cela à l’agence/);
  assert.equal(/passé votre demande/i.test(body), false);
  assert.equal(missed.some((row) => row.table === "crm_whatsapp_requests"), false);
});
