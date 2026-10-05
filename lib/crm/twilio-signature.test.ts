import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { formParams, twilioRequestSignature, twilioWebhookUrl, verifyTwilioSignature } from "./twilio-signature";

const TOKEN = "jeton-de-test-twilio";
const URL_HOOK = "https://travelba.fr/api/webhooks/twilio/whatsapp?foo=1&bar=2";
const PARAMS = {
  To: "whatsapp:+33700000000",
  From: "whatsapp:+33600000000",
  Body: "Bonjour",
  MessageSid: "SM00000000000000000000000000000000",
  AccountSid: "AC00000000000000000000000000000000",
};

test("la signature est le HMAC-SHA1 de l’URL suivie des champs triés par nom", () => {
  // Algorithme Twilio écrit à la main : URL complète + clé/valeur dans l'ordre alphabétique des clés.
  const payload =
    URL_HOOK +
    "AccountSid" + PARAMS.AccountSid +
    "Body" + PARAMS.Body +
    "From" + PARAMS.From +
    "MessageSid" + PARAMS.MessageSid +
    "To" + PARAMS.To;
  const expected = createHmac("sha1", TOKEN).update(payload, "utf8").digest("base64");
  assert.equal(twilioRequestSignature(TOKEN, URL_HOOK, PARAMS), expected);
  // L'ordre d'insertion des champs n'a aucun effet.
  const shuffled = { MessageSid: PARAMS.MessageSid, Body: PARAMS.Body, To: PARAMS.To, AccountSid: PARAMS.AccountSid, From: PARAMS.From };
  assert.equal(twilioRequestSignature(TOKEN, URL_HOOK, shuffled), expected);
});

test("une signature valide passe, avec espaces autour tolérés", () => {
  const signature = twilioRequestSignature(TOKEN, URL_HOOK, PARAMS);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: PARAMS, signature }), true);
  assert.equal(verifyTwilioSignature({ authToken: ` ${TOKEN} `, url: URL_HOOK, params: PARAMS, signature: ` ${signature}\n` }), true);
});

test("jeton, champ, URL ou signature altérés : refus", () => {
  const signature = twilioRequestSignature(TOKEN, URL_HOOK, PARAMS);
  assert.equal(verifyTwilioSignature({ authToken: "autre-jeton", url: URL_HOOK, params: PARAMS, signature }), false);
  assert.equal(
    verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: { ...PARAMS, Body: "Bonjour." }, signature }),
    false
  );
  assert.equal(
    verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: { ...PARAMS, Extra: "x" }, signature }),
    false
  );
  assert.equal(
    verifyTwilioSignature({ authToken: TOKEN, url: "https://travelba.fr/api/webhooks/twilio/whatsapp?foo=1", params: PARAMS, signature }),
    false
  );
  assert.equal(
    verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK.replace("https", "http"), params: PARAMS, signature }),
    false
  );
  const flipped = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: PARAMS, signature: flipped }), false);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: PARAMS, signature: signature.slice(0, -2) }), false);
});

test("sans signature, sans jeton ou sans URL : refus sans exception", () => {
  const signature = twilioRequestSignature(TOKEN, URL_HOOK, PARAMS);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: PARAMS, signature: null }), false);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: PARAMS, signature: undefined }), false);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: PARAMS, signature: "   " }), false);
  assert.equal(verifyTwilioSignature({ authToken: "", url: URL_HOOK, params: PARAMS, signature }), false);
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: "", params: PARAMS, signature }), false);
});

test("formParams accepte URLSearchParams ou un objet", () => {
  const body = new URLSearchParams();
  body.set("Body", "Bonjour");
  body.set("From", "whatsapp:+33600000000");
  assert.deepEqual(formParams(body), { Body: "Bonjour", From: "whatsapp:+33600000000" });
  const plain = { Body: "x" };
  assert.equal(formParams(plain), plain);
  const signature = twilioRequestSignature(TOKEN, URL_HOOK, formParams(body));
  assert.equal(verifyTwilioSignature({ authToken: TOKEN, url: URL_HOOK, params: formParams(body), signature }), true);
});

test("l’URL épinglée l’emporte sur l’URL vue par le serveur", () => {
  const previous = process.env.TWILIO_WHATSAPP_WEBHOOK_URL;
  process.env.TWILIO_WHATSAPP_WEBHOOK_URL = " https://travelba.fr/api/webhooks/twilio/whatsapp ";
  try {
    const request = new Request("http://localhost:3000/api/webhooks/twilio/whatsapp?x=1", {
      headers: { "x-forwarded-host": "autre.example", "x-forwarded-proto": "https" },
    });
    assert.equal(twilioWebhookUrl(request), "https://travelba.fr/api/webhooks/twilio/whatsapp");
  } finally {
    if (previous === undefined) delete process.env.TWILIO_WHATSAPP_WEBHOOK_URL;
    else process.env.TWILIO_WHATSAPP_WEBHOOK_URL = previous;
  }
});

test("sans URL épinglée : proto et hôte du proxy, chemin et requête conservés", () => {
  const previous = process.env.TWILIO_WHATSAPP_WEBHOOK_URL;
  delete process.env.TWILIO_WHATSAPP_WEBHOOK_URL;
  try {
    const proxied = new Request("http://10.0.0.1:3000/api/webhooks/twilio/whatsapp?x=1", {
      headers: { "x-forwarded-host": "travelba.fr, interne", "x-forwarded-proto": "https,http" },
    });
    assert.equal(twilioWebhookUrl(proxied), "https://travelba.fr/api/webhooks/twilio/whatsapp?x=1");
    const direct = new Request("https://travelba.fr/api/webhooks/twilio/whatsapp", { headers: { host: "travelba.fr" } });
    assert.equal(twilioWebhookUrl(direct), "https://travelba.fr/api/webhooks/twilio/whatsapp");
  } finally {
    if (previous !== undefined) process.env.TWILIO_WHATSAPP_WEBHOOK_URL = previous;
  }
});
