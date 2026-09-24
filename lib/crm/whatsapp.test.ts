import assert from "node:assert/strict";
import test from "node:test";
import {
  CONCIERGE_SIGNATURE,
  connexionMessage,
  greetingForWhatsapp,
  sendConnexionWhatsapp,
  whatsappAddress,
  withConciergeSignature,
} from "./whatsapp";

test("le message de connexion se présente et signe Le Concierge", () => {
  const text = connexionMessage("Simon");
  assert.match(text, /^Enchanté Simon,/);
  assert.match(text, /Je suis Le Concierge de chez TBA\./);
  assert.match(text, /Votre espace personnel vous attend\./);
  assert.match(text, /Ce lien vous y conduit, il reste valable 24 heures\./);
  assert.equal(text.trimEnd().endsWith(CONCIERGE_SIGNATURE), true);
  assert.equal(text.includes("http"), false);
});

test("le prénom d’accueil est le premier", () => {
  assert.equal(greetingForWhatsapp("Simon, Iony"), "Simon");
  assert.equal(connexionMessage("").startsWith("Enchanté,"), true);
});

test("la signature n’est pas doublée", () => {
  const once = withConciergeSignature("Bonjour Simon.");
  assert.equal(withConciergeSignature(once), once);
});

test("un téléphone invalide ne devient pas une adresse WhatsApp", () => {
  assert.equal(whatsappAddress(""), null);
  assert.equal(whatsappAddress("123"), null);
  assert.equal(whatsappAddress("+33601020304"), "whatsapp:+33601020304");
});

test("sans clés Twilio, le lien n’est pas envoyé", async () => {
  const previous = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_WHATSAPP_FROM,
    content: process.env.TWILIO_CONTENT_CONNEXION,
  };
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_WHATSAPP_FROM;
  delete process.env.TWILIO_CONTENT_CONNEXION;
  let called = false;
  const result = await sendConnexionWhatsapp({
    phone: "+33601020304",
    firstName: "Simon",
    link: "https://travelba.fr/auth/callback?token_hash=secret",
    fetchImpl: async () => {
      called = true;
      return new Response("no");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_configured");
  assert.equal(called, false);
  if (previous.sid) process.env.TWILIO_ACCOUNT_SID = previous.sid;
  if (previous.token) process.env.TWILIO_AUTH_TOKEN = previous.token;
  if (previous.from) process.env.TWILIO_WHATSAPP_FROM = previous.from;
  if (previous.content) process.env.TWILIO_CONTENT_CONNEXION = previous.content;
});
