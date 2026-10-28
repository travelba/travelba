import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ensureDockTab } from "./whatsapp-dock";
import { foldThreads, unreadThreadCount, type InboxMessage } from "./whatsapp-inbox";
import { sharedPhoneReply, UNKNOWN_NUMBER_REPLY } from "./whatsapp-concierge";
import {
  conciergeAutoreplyEnabled,
  receiveWhatsappWebhook,
  type WhatsappCustomer,
  type WhatsappStore,
} from "./whatsapp-inbound";
import { twilioRequestSignature } from "./twilio-signature";

const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp";
const TOKEN = "twilio-test-token";

function signed(params: Record<string, string>) {
  return twilioRequestSignature(TOKEN, URL_HOOK, params);
}

function harness(customers: WhatsappCustomer[] = []) {
  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const sent: { to: string; body: string; mediaUrl?: string | null }[] = [];
  const alerts: string[] = [];
  const calls: string[] = [];
  const store: WhatsappStore = {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return customers;
    },
    async loadDossier() {
      calls.push("dossier");
      return { bookings: [] };
    },
    async insertMessage(row) {
      writes.push({ table: "crm_whatsapp_messages", row: row as unknown as Record<string, unknown> });
      return { id: `m${writes.length}` };
    },
    async insertRequest(row) {
      writes.push({ table: "crm_whatsapp_requests", row: row as unknown as Record<string, unknown> });
    },
    async updateStatus(sid, status, error) {
      calls.push(`status:${sid}:${status}${error ? `:${error}` : ""}`);
    },
    async savePiece() {
      calls.push("piece");
      return "saved";
    },
  };
  return { writes, sent, alerts, calls, store };
}

async function deliver(input: {
  flag: string;
  params: Record<string, string>;
  customers?: WhatsappCustomer[];
  fetchImpl?: typeof fetch;
  openAccess?: () => Promise<string | null>;
  converse?: () => Promise<never>;
}) {
  const box = harness(input.customers);
  const result = await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: signed(input.params),
    params: input.params,
    authToken: TOKEN,
    accountSid: "ACtest",
    env: { CONCIERGE_AUTOREPLY: input.flag },
    store: box.store,
    fetchImpl: input.fetchImpl,
    openAccess: input.openAccess,
    converse: input.converse,
    alert: async (row) => {
      box.alerts.push(row.kind);
    },
    send: async (message) => {
      box.sent.push(message);
      return { ok: true, sid: "SMout" };
    },
  });
  return { ...box, result };
}

const simon: WhatsappCustomer = { id: "cust-1", first_name: "Simon", email: "simon@example.com" };

test("CONCIERGE_AUTOREPLY n’est ouvert que par 1 ou true", () => {
  for (const flag of ["", "0", "false", "yes", "on", "2", "vrai"]) {
    assert.equal(conciergeAutoreplyEnabled({ CONCIERGE_AUTOREPLY: flag }), false, flag);
  }
  for (const flag of ["1", "true", "TRUE", " true "]) {
    assert.equal(conciergeAutoreplyEnabled({ CONCIERGE_AUTOREPLY: flag }), true, flag);
  }
  assert.equal(conciergeAutoreplyEnabled({}), false);
});

test("drapeau coupé : client connu, rien ne part, le fil et l’onglet s’ouvrent", async () => {
  const params = { From: "whatsapp:+33601020304", Body: "Bonjour", MessageSid: "SMconnu" };
  let model = 0;
  const off = await deliver({
    flag: "",
    params,
    customers: [simon],
    converse: async () => {
      model += 1;
      throw new Error("modèle");
    },
  });
  assert.equal(off.result.status, 200);
  assert.equal(off.sent.length, 0);
  assert.equal(model, 0);
  assert.equal(off.calls.includes("dossier"), false);
  assert.deepEqual(
    off.writes.map((write) => write.table),
    ["crm_whatsapp_messages", "crm_whatsapp_requests"]
  );
  const inbound = off.writes[0].row;
  assert.equal(inbound.direction, "inbound");
  assert.equal(inbound.customer_id, "cust-1");
  assert.equal(inbound.phone, "+33601020304");
  assert.equal(off.writes[1].row.kind, "question");
  assert.deepEqual(off.alerts, ["question"]);
  const saved: InboxMessage = {
    id: "m1",
    phone: "+33601020304",
    customerId: "cust-1",
    customerName: "Simon",
    bookingId: null,
    bookingReference: null,
    direction: "inbound",
    body: String(inbound.body),
    createdAt: "2026-10-20T10:00:00.000Z",
    status: "received",
    templateKey: null,
    authorName: null,
    mediaPath: null,
    tools: [],
    requestId: null,
  };
  const threads = foldThreads([saved], {});
  assert.equal(unreadThreadCount(threads), 1);
  const tab = ensureDockTab([], threads[0].key);
  assert.equal(tab.length, 1);
  assert.equal(tab[0].expanded, false);

  const on = await deliver({ flag: "1", params: { ...params, MessageSid: "SMconnuOn" }, customers: [simon] });
  assert.equal(on.sent.length, 1);
  assert.match(on.sent[0].body, /Bonjour Simon/);
  assert.equal(on.writes.filter((write) => write.row.direction === "outbound").length, 1);
});

test("drapeau coupé : prospect, numéro partagé et lien, aucun appel sortant", async () => {
  const prospect = {
    From: "whatsapp:+33699001122",
    Body: "Je cherche un hôtel à Lisbonne",
    MessageSid: "SMprospect",
  };
  const offProspect = await deliver({ flag: "false", params: prospect });
  assert.equal(offProspect.sent.length, 0);
  assert.equal(offProspect.writes[0].row.direction, "inbound");
  assert.equal(offProspect.writes[0].row.customer_id, null);
  assert.equal(offProspect.writes[1].row.kind, "lead");
  assert.deepEqual(offProspect.alerts, ["lead"]);

  const onProspect = await deliver({ flag: "true", params: { ...prospect, MessageSid: "SMprospectOn" } });
  assert.equal(onProspect.sent.length, 1);
  assert.equal(onProspect.sent[0].body, UNKNOWN_NUMBER_REPLY);

  const shared = { From: "whatsapp:+33601020304", Body: "Bonjour", MessageSid: "SMpartage" };
  const holders = [simon, { id: "cust-2", first_name: "Léa", email: null }];
  const offShared = await deliver({ flag: "0", params: shared, customers: holders });
  assert.equal(offShared.sent.length, 0);
  assert.equal(offShared.writes[0].row.customer_id, null);
  assert.equal(offShared.writes[1].row.kind, "question");
  assert.deepEqual(offShared.alerts, ["question"]);

  const onShared = await deliver({ flag: "1", params: { ...shared, MessageSid: "SMpartageOn" }, customers: holders });
  assert.equal(onShared.sent.length, 1);
  assert.equal(onShared.sent[0].body, sharedPhoneReply("fr"));

  const access = {
    From: "whatsapp:+33601020304",
    Body: "Ouvrez mon espace, j’ai perdu le mot de passe",
    MessageSid: "SMlien",
  };
  let opened = 0;
  const offLink = await deliver({
    flag: "",
    params: access,
    customers: [simon],
    openAccess: async () => {
      opened += 1;
      return "https://travelba.fr/e/CODE";
    },
  });
  assert.equal(offLink.sent.length, 0);
  assert.equal(opened, 0);
  assert.equal(offLink.alerts.length, 1);

  const onLink = await deliver({
    flag: "true",
    params: { ...access, MessageSid: "SMlienOn" },
    customers: [simon],
    openAccess: async () => {
      opened += 1;
      return "https://travelba.fr/e/CODE";
    },
  });
  assert.equal(onLink.sent.length, 1);
  assert.match(onLink.sent[0].body, /https:\/\/travelba\.fr\/e\/CODE/);
  assert.equal(opened, 1);
});

test("drapeau coupé : une pièce est rangée, un statut est noté, rien n’est envoyé", async () => {
  const photo = {
    From: "whatsapp:+33601020304",
    Body: "",
    NumMedia: "1",
    MediaUrl0: "https://api.twilio.com/2010-04-01/Accounts/ACtest/Media/ME1",
    MediaContentType0: "image/jpeg",
    MessageSid: "SMphoto",
  };
  const fetchImpl: typeof fetch = async () =>
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
  const off = await deliver({ flag: "", params: photo, customers: [simon], fetchImpl });
  assert.equal(off.sent.length, 0);
  assert.equal(off.calls.includes("piece"), true);
  assert.equal(off.writes[0].row.direction, "inbound");
  assert.match(String(off.writes[0].row.body), /Pièce reçue/);
  assert.equal(off.alerts.length, 1);
  assert.equal(off.writes.some((write) => write.row.direction === "outbound"), false);

  const on = await deliver({
    flag: "1",
    params: { ...photo, MessageSid: "SMphotoOn" },
    customers: [simon],
    fetchImpl,
  });
  assert.equal(on.sent.length, 1);
  assert.match(on.sent[0].body, /coffre/);

  const status = { MessageSid: "SMstatut", MessageStatus: "delivered" };
  const offStatus = await deliver({ flag: "", params: status });
  assert.equal(offStatus.result.status, 200);
  assert.equal(offStatus.sent.length, 0);
  assert.deepEqual(offStatus.calls, ["status:SMstatut:delivered"]);
  assert.equal(offStatus.writes.length, 0);

  const onStatus = await deliver({ flag: "1", params: { ...status, MessageSid: "SMstatutOn" } });
  assert.equal(onStatus.sent.length, 0);
  assert.deepEqual(onStatus.calls, ["status:SMstatutOn:delivered"]);

  const refused = {
    MessageSid: "SMechec",
    MessageStatus: "undelivered",
    ErrorCode: "63016",
    ErrorMessage: "Failed to send freeform message because you are outside the allowed window",
  };
  const failedStatus = await deliver({ flag: "", params: refused });
  assert.equal(failedStatus.result.status, 200);
  assert.equal(failedStatus.sent.length, 0);
  assert.equal(failedStatus.calls.length, 1);
  assert.match(failedStatus.calls[0], /^status:SMechec:undelivered:/);
  assert.match(failedStatus.calls[0], /24 heures/);
  assert.equal(failedStatus.calls[0].includes("63016") || failedStatus.calls[0].includes("24 heures"), true);
  assert.equal(failedStatus.calls[0].includes("+"), false);
});

test("signature refusée : rien, drapeau ouvert ou fermé", async () => {
  for (const flag of ["", "1"]) {
    const writes: { table: string }[] = [];
    let sent = 0;
    const result = await receiveWhatsappWebhook({
      url: URL_HOOK,
      signature: "signature-invalide",
      params: { From: "whatsapp:+33601020304", Body: "Bonjour", MessageSid: "SMrefuse" },
      authToken: TOKEN,
      env: { CONCIERGE_AUTOREPLY: flag },
      store: {
        async findBySid() {
          assert.fail("store");
        },
        async customersByPhone() {
          return [];
        },
        async loadDossier() {
          return {};
        },
        async insertMessage() {
          writes.push({ table: "crm_whatsapp_messages" });
          return { id: "x" };
        },
        async insertRequest() {
          writes.push({ table: "crm_whatsapp_requests" });
        },
      },
      send: async () => {
        sent += 1;
        return { ok: true };
      },
    });
    assert.equal(result.status, 403);
    assert.equal(sent, 0);
    assert.equal(writes.length, 0);
  }
});

test("la réponse manuelle du CRM ne lit pas le drapeau", () => {
  const manual = readFileSync(new URL("../../app/api/admin/whatsapp/route.ts", import.meta.url), "utf8");
  assert.equal(manual.includes("CONCIERGE_AUTOREPLY"), false);
  assert.equal(manual.includes("conciergeAutoreplyEnabled"), false);
  const hook = readFileSync(new URL("../../app/api/webhooks/twilio/whatsapp/route.ts", import.meta.url), "utf8");
  assert.equal(hook.includes("conciergeAutoreplyEnabled"), true);
});
