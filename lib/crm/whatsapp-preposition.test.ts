import assert from "node:assert/strict";
import test from "node:test";
import { hardcodedDestinationSlots, resubmitPrepositionTemplates, slotIsDestination } from "./whatsapp-preposition";

test("la préposition devant le séjour est une destination, pas l’heure d’un vol", () => {
  assert.deepEqual(hardcodedDestinationSlots("Votre séjour à {{1}} est dans votre espace.", { "1": "Avoriaz" }), ["1"]);
  assert.deepEqual(
    hardcodedDestinationSlots("Votre vol {{1}} {{2}} part désormais à {{3}}.", { "1": "AF 1789", "2": "CDG → RAK", "3": "11h20" }),
    []
  );
  assert.equal(slotIsDestination("Vous voici à {{1}}.", "1", "Marrakech"), true);
  assert.equal(slotIsDestination("Vous voici {{1}}.", "1", "à Marrakech"), true);
  assert.equal(hardcodedDestinationSlots("Vous voici {{1}}. Bienvenue.", { "1": "à Marrakech" }).length, 0);
});

test("une nouvelle version est soumise, l’ancienne reste, aucun message ne part", async () => {
  const env = {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_CONTENT_SEJOUR: process.env.TWILIO_CONTENT_SEJOUR,
  };
  process.env.TWILIO_ACCOUNT_SID = "ACexemple";
  process.env.TWILIO_AUTH_TOKEN = "jeton";
  process.env.TWILIO_CONTENT_SEJOUR = "HXancien";
  const calls: string[] = [];
  try {
    const report = await resubmitPrepositionTemplates(async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method || "GET"} ${url}`);
      assert.equal(/\/Messages/i.test(url), false);
      assert.equal(init?.method === "DELETE", false);
      if (url.includes("PageSize=50")) {
        return Response.json({
          contents: [
            {
              sid: "HXancien",
              friendly_name: "sejour_publie",
              language: "fr",
              variables: { "1": "Avoriaz", "2": "https://travelba.fr/whatsapp/hotel.jpg", "3": "c/23456789" },
              types: {
                "whatsapp/card": { body: "Votre séjour à {{1}} est dans votre espace.\n\nLe Concierge" },
              },
            },
            {
              sid: "HXheure",
              friendly_name: "vol_horaire_voix",
              variables: { "3": "11h20" },
              types: { "twilio/call-to-action": { body: "Votre vol {{1}} part désormais à {{3}}." } },
            },
          ],
          meta: { next_page_url: null },
        });
      }
      if (init?.method === "POST" && url.endsWith("/Content")) {
        const body = JSON.parse(String(init.body)) as { friendly_name: string; types: { "whatsapp/card": { body: string } } };
        assert.equal(body.friendly_name, "sejour_publie_v2");
        assert.equal(body.types["whatsapp/card"].body.includes("séjour à {{"), false);
        assert.match(body.types["whatsapp/card"].body, /séjour \{\{1\}\}/);
        return Response.json({ sid: "HXnouveau" });
      }
      if (url.endsWith("/ApprovalRequests/whatsapp")) return Response.json({ status: "received" });
      if (url.endsWith("/ApprovalRequests")) return Response.json({ whatsapp: { status: "pending" } });
      return Response.json({ message: "inattendu" }, { status: 500 });
    });
    assert.equal(report.length, 1);
    assert.equal(report[0].oldSid, "HXancien");
    assert.equal(report[0].newSid, "HXnouveau");
    assert.equal(report[0].newName, "sejour_publie_v2");
    assert.equal(report[0].env, "TWILIO_CONTENT_SEJOUR");
    assert.equal(report[0].approval, "pending");
    assert.equal(calls.some((call) => call.startsWith("DELETE")), false);
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
