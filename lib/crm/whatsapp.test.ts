import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CONCIERGE_SIGNATURE,
  CONNEXION_BUTTON_URL,
  connexionContentCreateBody,
  connexionContentVariables,
  connexionMessage,
  connexionTemplateBody,
  greetingForWhatsapp,
  inviteWhatsappNotice,
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

test("l’invitation dit si WhatsApp est parti", () => {
  assert.equal(
    inviteWhatsappNotice({ ok: true, sid: "SM1" }),
    "Invitation envoyée par e-mail et sur WhatsApp."
  );
  assert.match(inviteWhatsappNotice({ ok: false, reason: "no_phone" }), /téléphone/);
  assert.match(
    inviteWhatsappNotice({ ok: false, reason: "not_configured" }),
    /n’est pas configuré/
  );
});

test("le modèle reprend le texte du concierge et un bouton à domaine fixe", () => {
  assert.equal(connexionTemplateBody().replace("{{1}}", "Simon"), connexionMessage("Simon"));
  const draft = connexionContentCreateBody();
  assert.equal(draft.language, "fr");
  assert.equal(draft.types["twilio/call-to-action"].actions[0].url, CONNEXION_BUTTON_URL);
  assert.equal(draft.types["twilio/call-to-action"].body.includes("http"), false);
  assert.deepEqual(connexionContentVariables("Simon, Iony", "https://travelba.fr/e/K7MQ2PX4"), {
    "1": "Simon",
    "2": "K7MQ2PX4",
  });
  assert.equal(connexionContentVariables("Simon", "https://travelba.fr/auth/callback?token_hash=secret"), null);
});

describe("envoi Twilio", { concurrency: false }, () => {
  const keys = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "TWILIO_CONTENT_CONNEXION",
    "TWILIO_WHATSAPP_CONTENT_SID",
  ] as const;

  function snapshot() {
    return Object.fromEntries(keys.map((key) => [key, process.env[key]])) as Record<
      (typeof keys)[number],
      string | undefined
    >;
  }

  function restore(previous: ReturnType<typeof snapshot>) {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }

  test("sans clés Twilio, le lien n’est pas envoyé", async () => {
    const previous = snapshot();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
    delete process.env.TWILIO_CONTENT_CONNEXION;
    process.env.TWILIO_WHATSAPP_CONTENT_SID = "HXancien";
    try {
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
      assert.equal(process.env.TWILIO_WHATSAPP_CONTENT_SID, "HXancien");
    } finally {
      restore(previous);
    }
  });

  test("avec le modèle connexion, Twilio reçoit le prénom et le code", async () => {
    const previous = snapshot();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "+33756841315";
    process.env.TWILIO_CONTENT_CONNEXION = "HXconnexion";
    try {
      let raw = "";
      const result = await sendConnexionWhatsapp({
        phone: "+33601020304",
        firstName: "Simon, Iony",
        link: "https://www.travelba.fr/e/K7MQ2PX4",
        fetchImpl: async (_url, init) => {
          raw = String(init?.body ?? "");
          return new Response(JSON.stringify({ sid: "SM123" }), { status: 201 });
        },
      });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.sid, "SM123");
      const params = new URLSearchParams(raw);
      assert.equal(params.get("ContentSid"), "HXconnexion");
      assert.equal(params.get("From"), "whatsapp:+33756841315");
      assert.equal(params.get("To"), "whatsapp:+33601020304");
      assert.deepEqual(JSON.parse(params.get("ContentVariables") || "{}"), {
        "1": "Simon",
        "2": "K7MQ2PX4",
      });
      assert.equal(raw.includes("http"), false);
      assert.equal(raw.includes("token"), false);
    } finally {
      restore(previous);
    }
  });

  test("un lien qui n’est pas /e/CODE n’appelle pas Twilio", async () => {
    const previous = snapshot();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
    process.env.TWILIO_CONTENT_CONNEXION = "HXconnexion";
    try {
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
      assert.equal(called, false);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.detail, "lien court absent");
    } finally {
      restore(previous);
    }
  });

  test("une panne Twilio ne remonte pas le lien", async () => {
    const previous = snapshot();
    process.env.TWILIO_ACCOUNT_SID = "ACtest";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
    process.env.TWILIO_CONTENT_CONNEXION = "HXconnexion";
    try {
      const result = await sendConnexionWhatsapp({
        phone: "+33601020304",
        firstName: "Simon",
        link: "https://travelba.fr/e/K7MQ2PX4",
        fetchImpl: async () => {
          throw new Error("https://travelba.fr/e/K7MQ2PX4 down");
        },
      });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.detail, undefined);
    } finally {
      restore(previous);
    }
  });
});
