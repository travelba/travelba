import assert from "node:assert/strict";
import test from "node:test";
import { buildEtaIlDraft } from "./eta-il-draft";
import {
  astraRefusalMessage,
  buildEtaIlRequest,
  blockedPortalMessage,
  holdKeepsForm,
  pickOptionLabel,
  portalToolChoice,
  portalUrlAllowed,
  readPortalStep,
  redactPassportNumbers,
  responseTrace,
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
  assert.equal(body.tool_choice.name, portalToolChoice.name);
  assert.equal(body.tools[0]?.name, "portal_step");
  assert.equal(JSON.stringify(body).includes("gpt-4o"), false);
  assert.match(body.instructions, /israel-entry.piba.gov.il/);
  assert.match(body.instructions, /FRA \(France\)/);
  assert.match(body.instructions, /lis ces caractères/);
  assert.equal(body.instructions.includes("hold tout de suite"), false);
  assert.match(body.instructions, /Ne paie pas/);
  assert.equal(portalUrlAllowed("https://israel-entry.piba.gov.il/apply"), true);
  assert.equal(portalUrlAllowed("https://example.com/"), false);
  assert.equal(portalUrlAllowed("http://israel-entry.piba.gov.il/"), false);
});

test("un clic d’envoi s’arrête, un autre site et une carte sont refusés", () => {
  assert.equal(stepDecision({ action: "click", target: "Envoyer la demande" }), "hold");
  assert.equal(stepDecision({ action: "click", target: "Paiement" }), "hold");
  assert.equal(stepDecision({ action: "click", target: "Pay" }), "hold");
  assert.equal(stepDecision({ action: "click", target: "Country of issue" }), "run");
  assert.equal(stepDecision({ action: "click", target: "Pays" }), "run");
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
  assert.equal(result.filled, true);
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

function stepBody(id: string, callId: string, step: Record<string, string>) {
  return JSON.stringify({
    id,
    status: "completed",
    output: [
      {
        type: "function_call",
        name: "portal_step",
        call_id: callId,
        arguments: JSON.stringify({ url: "", target: "", text: "", summary: "", ...step }),
      },
    ],
  });
}

test("la suite renvoie l’outil et le clic est appliqué", async () => {
  const bodies: Array<{ model?: string; tool_choice?: { name?: string }; tools?: Array<{ name?: string }> }> = [];
  const clicked: string[] = [];
  let calls = 0;
  const surface = page();
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    maxSteps: 2,
    page: {
      ...surface,
      click: async (target) => {
        clicked.push(target);
      },
    },
    fetchImpl: async (_url, init) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      calls += 1;
      const body =
        calls === 1
          ? stepBody("resp_1", "call_1", { action: "open", url: "https://israel-entry.piba.gov.il/" })
          : stepBody("resp_2", "call_2", { action: "click", target: "Commencer" });
      return new Response(body, { status: 200 });
    },
  });
  assert.equal(clicked.join(","), "Commencer");
  assert.equal(bodies[1]?.model, "gpt-6-astra");
  assert.equal(bodies[1]?.tool_choice?.name, "portal_step");
  assert.equal(bodies[1]?.tools?.[0]?.name, "portal_step");
  assert.equal(JSON.stringify(bodies[1]).includes("gpt-4o"), false);
  assert.equal(result.phase, "à confirmer");
});

test("un contrôle manqué laisse Astra réessayer", async () => {
  let clicks = 0;
  let calls = 0;
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    maxSteps: 2,
    page: {
      ...page(),
      click: async () => {
        clicks += 1;
        throw new Error("cible");
      },
    },
    fetchImpl: async () => {
      calls += 1;
      const body =
        calls === 1
          ? stepBody("resp_1", "call_1", { action: "click", target: "Commencer" })
          : stepBody("resp_2", "call_2", { action: "hold", summary: "Ada Martin, 14 décembre" });
      return new Response(body, { status: 200 });
    },
  });
  assert.equal(clicks, 1);
  assert.equal(result.filled, true);
  assert.match(result.summary || "", /Ada Martin/);
});

test("un écran inattendu ne tient pas le formulaire", async () => {
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    maxSteps: 1,
    page: page(),
    fetchImpl: async () =>
      new Response(
        stepBody("resp_1", "call_1", {
          action: "hold",
          summary: "Arrêt sur écran inattendu : l’accueil est encore affiché, sans champs.",
        }),
        { status: 200 }
      ),
  });
  assert.equal(result.filled, false);
  assert.equal(result.phase, "bloqué");
});

test("une information manquante n’est pas un formulaire tenu", () => {
  assert.equal(
    holdKeepsForm(
      "Préparation suspendue : le portail exige le représentant adulte ; ces informations n’ont pas été fournies."
    ),
    false
  );
  assert.equal(holdKeepsForm("Formulaire rempli pour deux voyageurs, départ le 14 décembre."), true);
});

test("la limite d’étapes n’est pas un formulaire tenu", async () => {
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    maxSteps: 1,
    page: page(),
    fetchImpl: async () =>
      new Response(stepBody("resp_1", "call_1", { action: "scroll" }), { status: 200 }),
  });
  assert.equal(result.filled, false);
  assert.match(result.summary || "", /Limite d’étapes/);
});

test("une réponse sans portal_step garde le message de reprise", async () => {
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    page: page(),
    fetchImpl: async () =>
      new Response(JSON.stringify({ id: "resp_1", status: "completed", output: [{ type: "message" }] }), {
        status: 200,
      }),
  });
  assert.equal(result.phase, "bloqué");
  assert.equal(result.message, "Le portail n’a pas été rempli. Reprenez la main sur le site officiel.");
});

test("une réponse en cours est relue jusqu’à l’action", async () => {
  let gets = 0;
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    pollMs: 0,
    page: page(),
    fetchImpl: async (_url, init) => {
      if ((init?.method || "GET") === "GET") {
        gets += 1;
        return new Response(
          stepBody("resp_1", "call_1", { action: "hold", summary: "Ada Martin, 14 décembre" }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ id: "resp_1", status: "in_progress", output: [{ type: "reasoning" }] }),
        { status: 200 }
      );
    },
  });
  assert.equal(gets, 1);
  assert.equal(result.phase, "à confirmer");
  assert.match(result.summary || "", /Ada Martin/);
});

test("la trace d’échec ne recopie pas la réponse", () => {
  const trace = responseTrace({
    status: "completed",
    output: [{ type: "message", arguments: "12AB34567" }],
  });
  assert.equal(trace.includes("12AB34567"), false);
  assert.match(trace, /completed/);
  assert.match(trace, /message/);
});

test("le pays FR se choisit dans la liste FRA (France)", () => {
  const options = ["Click to select", "AFG (Afghanistan)", "FRA (France)", "FRO (Faroe)"];
  assert.equal(pickOptionLabel(options, "France"), "FRA (France)");
  assert.equal(pickOptionLabel(options, "FRA"), "FRA (France)");
  assert.equal(pickOptionLabel(options, "FR"), null);
  assert.equal(pickOptionLabel(["FRA (France)"], "FR"), "FRA (France)");
  assert.equal(pickOptionLabel(options, "Click to select"), null);
});

test("trois clics manqués sans captcha ne demandent pas de reprendre pour un captcha", async () => {
  let calls = 0;
  const result = await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    maxSteps: 3,
    pollMs: 0,
    page: {
      ...page(),
      click: async () => {
        throw new Error("immobile");
      },
      describe: async () => "captcha=non liste=0",
    },
    fetchImpl: async () => {
      calls += 1;
      return new Response(
        stepBody(`resp_${calls}`, `call_${calls}`, { action: "click", target: "Country of issue" }),
        { status: 200 }
      );
    },
  });
  assert.equal(result.message, "Le contrôle n’a pas répondu. Reprenez la main.");
  assert.equal(calls, 3);
  assert.equal(result.filled, false);
});

test("trois contrôles manqués ne parlent de captcha que s’il est là", () => {
  assert.equal(blockedPortalMessage("captcha=non liste=0"), "Le contrôle n’a pas répondu. Reprenez la main.");
  assert.equal(blockedPortalMessage("captcha=image liste=0"), "Un captcha bloque. Reprenez la main.");
});

test("un contrôle manqué joint l’écran pour lire un captcha", async () => {
  const bodies: Array<{ input?: unknown }> = [];
  let calls = 0;
  await runEtaIlSession({
    apiKey: "sk-test",
    draft: draft(),
    maxSteps: 2,
    pollMs: 0,
    page: {
      ...page(),
      click: async () => {
        throw new Error("cible");
      },
      describe: async () => "captcha=image liste=0",
      capture: async () => new Uint8Array([1, 2, 3, 4]),
    },
    fetchImpl: async (_url, init) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)) as { input?: unknown });
      calls += 1;
      const body =
        calls === 1
          ? stepBody("resp_1", "call_1", { action: "click", target: "Code" })
          : stepBody("resp_2", "call_2", { action: "hold", summary: "Ada Martin, 14 décembre" });
      return new Response(body, { status: 200 });
    },
  });
  const second = JSON.stringify(bodies[1]);
  assert.match(second, /input_image/);
  assert.match(second, /data:image\/jpeg;base64,/);
  assert.equal(second.includes("12AB34567"), false);
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
