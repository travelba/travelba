import assert from "node:assert/strict";
import { test } from "node:test";
import { twilioRequestSignature } from "./twilio-signature";
import { receiveWhatsappWebhook, type WhatsappStore } from "./whatsapp-inbound";
import { signalWhatsappTyping } from "./whatsapp-typing";

const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp";
const TOKEN = "twilio-test-token";
const TYPING_URL = "https://messaging.twilio.com/v2/Indicators/Typing.json";

test("l’indicateur de saisie poste le MessageSid et n’écrit rien", async () => {
  const calls: { url: string; method: string; body: string; authorization: string }[] = [];
  await signalWhatsappTyping({
    messageSid: "SMtyping",
    accountSid: "ACagence",
    authToken: TOKEN,
    fetchImpl: async (url, init) => {
      const raw = init?.body;
      calls.push({
        url: String(url),
        method: init?.method || "",
        body: raw instanceof URLSearchParams ? raw.toString() : String(raw),
        authorization: new Headers(init?.headers).get("authorization") || "",
      });
      return new Response(null, { status: 204 });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TYPING_URL);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, "messageId=SMtyping&channel=whatsapp");
  assert.equal(calls[0].authorization.startsWith("Basic "), true);
  assert.equal(calls[0].authorization.includes(TOKEN), false);
});

test("un indicateur en échec laisse partir la réponse", async () => {
  const params = {
    From: "whatsapp:+33699001122",
    Body: "Bonjour",
    MessageSid: "SMtypingfail",
  };
  const sent: string[] = [];
  let typed = 0;
  const store: WhatsappStore = {
    async findBySid() {
      return false;
    },
    async customersByPhone() {
      return [];
    },
    async loadDossier() {
      return {};
    },
    async insertMessage() {
      return { id: "m1" };
    },
    async insertRequest() {},
  };
  const result = await receiveWhatsappWebhook({
    url: URL_HOOK,
    signature: twilioRequestSignature(TOKEN, URL_HOOK, params),
    params,
    authToken: TOKEN,
    accountSid: "ACagence",
    autoreply: true,
    burstWaitMs: 0,
    typingFetch: async (url, init) => {
      typed += 1;
      assert.equal(String(url), TYPING_URL);
      const raw = init?.body;
      const body = raw instanceof URLSearchParams ? raw.toString() : "";
      assert.equal(body, "messageId=SMtypingfail&channel=whatsapp");
      throw new Error("twilio indisponible");
    },
    store,
    send: async (message) => {
      sent.push(message.body);
      return { ok: true, sid: "SMout" };
    },
  });
  assert.equal(result.status, 200);
  assert.equal(typed, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Le Concierge/);
});
