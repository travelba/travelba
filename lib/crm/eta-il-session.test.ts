import assert from "node:assert/strict";
import test from "node:test";
import { buildEtaIlDraft } from "./eta-il-draft";
import {
  astraRefusalMessage,
  buildEtaIlRequest,
  portalUrlAllowed,
  readPortalStep,
  redactPassportNumbers,
  runEtaIlSession,
  stepDecision,
  type PortalPage,
} from "./eta-il-session";
import type { CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Ada",
    last_name: "Martin",
    created_at: "",
  };
}

function passport(): CrmTravelDocument {
  return {
    id: "d1",
    customer_id: "c1",
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: "12AB34567",
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2030-01-01",
    first_name: "Ada",
    last_name: "Martin",
    birth_date: "1991-02-03",
    nationality: "FR",
    sex: "F",
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: null,
    file_name: null,
    mime_type: null,
    created_at: "",
    updated_at: "",
  };
}

function draft() {
  return buildEtaIlDraft({
    items: [{ kind: "flight", details: { to: "TLV" } }],
    travelers: [traveler()],
    documents: [passport()],
    startDate: "2026-12-14",
    endDate: "2026-12-23",
    agencyEmail: "contact@travelba.fr",
  });
}

function page(): PortalPage {
  let current = "";
  return {
    url: () => current,
    open: async (url) => {
      current = url;
    },
    click: async () => {},
    type: async () => {},
    scroll: async () => {},
    describe: async () => "page ok",
  };
}

test("la requête Astra reste sur gpt-6-astra et le portail officiel", () => {
  const body = buildEtaIlRequest(draft());
  assert.equal(body.model, "gpt-6-astra");
  assert.equal(JSON.stringify(body).includes("gpt-4o"), false);
  assert.match(body.instructions, /israel-entry.piba.gov.il/);
  assert.match(body.instructions, /Ne paie pas/);
  assert.equal(portalUrlAllowed("https://israel-entry.piba.gov.il/apply"), true);
  assert.equal(portalUrlAllowed("https://example.com/"), false);
  assert.equal(portalUrlAllowed("http://israel-entry.piba.gov.il/"), false);
});

test("un clic d’envoi s’arrête, un autre site et une carte sont refusés", () => {
  assert.equal(stepDecision({ action: "click", target: "Envoyer la demande" }), "hold");
  assert.equal(stepDecision({ action: "click", target: "Paiement" }), "hold");
  assert.equal(stepDecision({ action: "open", url: "https://evil.example/" }), "stop");
  assert.equal(
    stepDecision({ action: "type", target: "Numéro de carte", text: "4242424242424242" }),
    "stop"
  );
  assert.equal(stepDecision({ action: "type", target: "Nom", text: "Ada Martin" }), "run");
  assert.equal(stepDecision({ action: "hold", summary: "Ada, 14–23 déc. 2026" }), "hold");
});

test("le résumé confirmé ne contient pas le numéro de passeport", async () => {
  const body = JSON.stringify({
    id: "resp_1",
    output: [
      {
        type: "function_call",
        name: "portal_step",
        call_id: "call_1",
        arguments: JSON.stringify({
          action: "hold",
          url: "",
          target: "",
          text: "",
          summary: "Ada Martin, passeport 12AB34567, départ le 14 décembre",
        }),
      },
    ],
  });
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    page: page(),
    fetchImpl: async () => new Response(body, { status: 200 }),
  });
  assert.equal(result.phase, "à confirmer");
  assert.equal(result.summary?.includes("12AB34567"), false);
  assert.match(result.summary || "", /Ada Martin/);
});

test("un refus d’accès Astra ne bascule pas vers un autre modèle", async () => {
  assert.match(astraRefusalMessage(404, "model_not_found"), /GPT-6 Astra/);
  assert.equal(astraRefusalMessage(404, "model_not_found").includes("gpt-4o"), false);
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    page: page(),
    fetchImpl: async () => new Response("model_not_found", { status: 404 }),
  });
  assert.equal(result.phase, "bloqué");
  assert.match(result.message || "", /GPT-6 Astra/);
});

test("readPortalStep lit l’action renvoyée", () => {
  const step = readPortalStep({
    output: [
      {
        type: "function_call",
        name: "portal_step",
        call_id: "c1",
        arguments: JSON.stringify({ action: "open", url: "https://israel-entry.piba.gov.il/", target: "", text: "", summary: "" }),
      },
    ],
  });
  assert.equal(step?.step.action, "open");
  assert.equal(redactPassportNumbers("n° 12AB34567", ["12AB34567"]), "n° •••");
});
