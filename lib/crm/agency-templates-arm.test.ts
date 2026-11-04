import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyTemplateDrafts,
  agencyTemplatesStatus,
  authorizationTemplateDrafts,
  ensureAgencyTemplates,
  ensureAuthorizationTemplates,
  quietAgencyTwilioError,
  resolveAgencyContentSid,
} from "./agency-templates-arm";
import { deposerModelesAutorisationWhatsapp, statutModelesAutorisationWhatsapp } from "./mcp-agency-templates";
import { chooseVisaGrantTemplate, resolveVisaGrantContentSid, sendVisaGrantWhatsapp } from "./visa-grant-send";
import { memoryContentSidStore } from "./whatsapp-content-sid-store";
import { clearContentApprovalCache } from "./twilio-content-sid";

const ACCOUNT = "ACtestaccount000000000000000000000";
const TOKEN = "secret-token-that-must-never-leak";

function armTwilio() {
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  delete process.env.TWILIO_CONTENT_ACCES_CLIENT;
  delete process.env.TWILIO_CONTENT_OPTION_HOTEL;
  delete process.env.TWILIO_CONTENT_FACTURE;
  delete process.env.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT;
  delete process.env.TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE;
  clearContentApprovalCache();
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };

function fakeTwilio(seed: { contents?: { sid: string; friendly_name: string }[]; approvals?: Record<string, string> } = {}) {
  const contents = [...(seed.contents || [])];
  const approvals: Record<string, string> = { ...(seed.approvals || {}) };
  const calls: Call[] = [];
  let counter = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ url, method, body });
    const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
    if (!url.startsWith("https://content.twilio.com/v1/Content")) return json({ message: "hors Content API" }, 500);
    const approval = url.match(/\/Content\/(HX[^/]+)\/ApprovalRequests(\/whatsapp)?$/);
    if (approval && method === "POST") {
      const sid = approval[1];
      if (approvals[sid] && approvals[sid] !== "unsubmitted") return json({ message: "Approval request already submitted" }, 409);
      approvals[sid] = "pending";
      return json({ status: "pending" }, 201);
    }
    if (approval && method === "GET") {
      const sid = approval[1];
      const status = approvals[sid] || "unsubmitted";
      return json({ sid, whatsapp: { status, rejection_reason: status === "rejected" ? "exemple" : null } });
    }
    if (method === "POST") {
      counter += 1;
      const sid = `HX${String(counter).padStart(32, "a")}`;
      contents.push({ sid, friendly_name: String(body?.friendly_name) });
      return json({ sid, friendly_name: body?.friendly_name }, 201);
    }
    return json({ contents, meta: { next_page_url: null } });
  };
  return { fetchImpl, calls, contents, approvals };
}

test("les trois brouillons sont acces, hôtel et facture", () => {
  assert.deepEqual(
    agencyTemplateDrafts().map((draft) => draft.friendlyName),
    ["espace_client_lien", "option_hotel_activee", "facture_paiement"]
  );
  assert.deepEqual(
    agencyTemplateDrafts().map((draft) => draft.env),
    ["TWILIO_CONTENT_ACCES_CLIENT", "TWILIO_CONTENT_OPTION_HOTEL", "TWILIO_CONTENT_FACTURE"]
  );
});

test("dépose les trois modèles, écrit les SID et ne renvoie pas le jeton", async () => {
  armTwilio();
  const store = memoryContentSidStore();
  const twilio = fakeTwilio();
  const result = await ensureAgencyTemplates(twilio.fetchImpl, store);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.modeles.map((row) => row.nom),
    ["espace_client_lien", "option_hotel_activee", "facture_paiement"]
  );
  for (const row of result.modeles) {
    assert.match(row.content_sid || "", /^HX/);
    assert.equal(row.soumis, true);
    assert.equal(row.statut, "pending");
    assert.equal(store.rows[row.variable], row.content_sid);
  }
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes(ACCOUNT), false);
  const again = await ensureAgencyTemplates(twilio.fetchImpl, store);
  assert.equal(again.modeles.every((row) => row.cree === false), true);
  assert.equal(twilio.calls.filter((call) => call.method === "POST" && call.url.endsWith("/Content")).length, 3);
});

test("le réglage prime sur la variable, qui reste le repli", async () => {
  armTwilio();
  const stored = "HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const fromEnv = "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  process.env.TWILIO_CONTENT_ACCES_CLIENT = fromEnv;
  const store = memoryContentSidStore({ TWILIO_CONTENT_ACCES_CLIENT: stored });
  const twilio = fakeTwilio({
    contents: [{ sid: stored, friendly_name: "espace_client_lien" }],
    approvals: { [stored]: "approved" },
  });
  const sid = await resolveAgencyContentSid("TWILIO_CONTENT_ACCES_CLIENT", twilio.fetchImpl, store);
  assert.equal(sid, stored);
  const empty = memoryContentSidStore();
  const fallback = await resolveAgencyContentSid("TWILIO_CONTENT_ACCES_CLIENT", twilio.fetchImpl, empty);
  assert.equal(fallback, fromEnv);
});

test("un SID enregistré sous un nom refusé n’est pas repris", async () => {
  armTwilio();
  const refused = "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const store = memoryContentSidStore({ TWILIO_CONTENT_ACCES_CLIENT: refused });
  store.names.TWILIO_CONTENT_ACCES_CLIENT = "acces_client";
  const twilio = fakeTwilio({
    contents: [
      { sid: refused, friendly_name: "acces_client" },
      { sid: "HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", friendly_name: "option_hotel_activee" },
      { sid: "HXcccccccccccccccccccccccccccccccc", friendly_name: "facture_paiement" },
    ],
    approvals: {
      [refused]: "rejected",
      HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: "approved",
      HXcccccccccccccccccccccccccccccccc: "approved",
    },
  });
  const result = await ensureAgencyTemplates(twilio.fetchImpl, store);
  assert.equal(result.ok, true);
  const access = result.modeles[0];
  assert.equal(access.nom, "espace_client_lien");
  assert.equal(access.cree, true);
  assert.notEqual(access.content_sid, refused);
  assert.equal(store.rows.TWILIO_CONTENT_ACCES_CLIENT, access.content_sid);
  assert.equal(store.names.TWILIO_CONTENT_ACCES_CLIENT, "espace_client_lien");
  assert.equal(result.modeles[1].cree, false);
  assert.equal(result.modeles[1].content_sid, "HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(result.modeles[2].cree, false);
  assert.equal(twilio.calls.some((call) => call.url.includes(refused)), false);
});

test("le statut lit Meta, et sans Twilio rien n’est créé", async () => {
  armTwilio();
  const store = memoryContentSidStore();
  const twilio = fakeTwilio();
  const created = await ensureAgencyTemplates(twilio.fetchImpl, store);
  twilio.approvals[created.modeles[0].content_sid || ""] = "approved";
  const status = await agencyTemplatesStatus(twilio.fetchImpl, store);
  assert.equal(status.modeles[0].statut, "approved");
  assert.equal(status.modeles[0].source, "reglage");
  assert.match(quietAgencyTwilioError(new Error(`échec ${TOKEN} ${ACCOUNT}`)), /^échec$/);
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  const refused = await ensureAgencyTemplates(twilio.fetchImpl, store);
  assert.equal(refused.ok, false);
  assert.match(refused.message || "", /TWILIO_ACCOUNT_SID/);
  const unread = await agencyTemplatesStatus(twilio.fetchImpl, memoryContentSidStore());
  assert.equal(unread.ok, false);
  assert.equal(JSON.stringify(unread).includes(TOKEN), false);
});

test("les brouillons d’autorisation pointent vers les exemples de production", () => {
  assert.deepEqual(
    authorizationTemplateDrafts().map((draft) => draft.friendlyName),
    [
      "autorisation_validee_document_v2",
      "autorisation_validee_image_v2",
      "autorisation_validee_document",
      "autorisation_validee_image",
    ]
  );
  const [pdf, image] = authorizationTemplateDrafts();
  const pdfMedia = (pdf.create.types as { "twilio/media": { media: string[]; body: string } })["twilio/media"];
  const imageMedia = (image.create.types as { "twilio/media": { media: string[] } })["twilio/media"].media[0];
  assert.equal(pdfMedia.media[0], "https://travelba.fr/api/whatsapp/autorisations/{{1}}");
  assert.equal(imageMedia, "https://travelba.fr/api/whatsapp/autorisations/{{1}}");
  assert.match(pdfMedia.body, /Votre autorisation \{\{3\}\} a été validée/);
  assert.equal(pdf.create.variables && (pdf.create.variables as Record<string, string>)["1"], "exemple/esta-exemple.pdf");
  assert.equal(pdf.create.variables && (pdf.create.variables as Record<string, string>)["3"], "ESTA");
  assert.equal(image.create.variables && (image.create.variables as Record<string, string>)["1"], "exemple/esta-exemple.jpg");
});

test("dépose les deux modèles d’autorisation, sans reprendre un nom refusé", async () => {
  armTwilio();
  const store = memoryContentSidStore();
  const twilio = fakeTwilio();
  const result = await ensureAuthorizationTemplates(twilio.fetchImpl, store);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.modeles.map((row) => [row.nom, row.variable, row.soumis, row.statut]),
    [
      ["autorisation_validee_document_v2", "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT_V2", true, "pending"],
      ["autorisation_validee_image_v2", "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE_V2", true, "pending"],
      ["autorisation_validee_document", "TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT", true, "pending"],
      ["autorisation_validee_image", "TWILIO_CONTENT_AUTORISATION_VALIDEE_IMAGE", true, "pending"],
    ]
  );
  assert.equal(store.rows.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT_V2, result.modeles[0].content_sid);
  assert.equal(store.rows.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT, result.modeles[2].content_sid);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  const again = await ensureAuthorizationTemplates(twilio.fetchImpl, store);
  assert.equal(again.modeles.every((row) => row.cree === false), true);
  assert.equal(twilio.calls.filter((call) => call.method === "POST" && call.url.endsWith("/Content")).length, 4);

  const refused = "HXeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  const refusedStore = memoryContentSidStore({ TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT: refused });
  refusedStore.names.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT = "ancien_visa";
  const refusedTwilio = fakeTwilio({
    contents: [{ sid: refused, friendly_name: "ancien_visa" }],
    approvals: { [refused]: "rejected" },
  });
  const fresh = await ensureAuthorizationTemplates(refusedTwilio.fetchImpl, refusedStore);
  const legacy = fresh.modeles.find((row) => row.nom === "autorisation_validee_document");
  assert.notEqual(legacy?.content_sid, refused);
  assert.equal(legacy?.cree, true);
  assert.equal(refusedTwilio.calls.some((call) => call.url.includes(refused)), false);
});

test("le statut d’autorisation donne nom, sid, statut et pret", async () => {
  armTwilio();
  const store = memoryContentSidStore();
  const twilio = fakeTwilio();
  const deposited = await deposerModelesAutorisationWhatsapp({}, twilio.fetchImpl, store);
  assert.equal(deposited.pret, false);
  assert.equal(deposited.categorie, "UTILITY");
  assert.equal(JSON.stringify(deposited).includes(TOKEN), false);
  assert.equal(JSON.stringify(deposited).includes(ACCOUNT), false);
  for (const row of deposited.modeles) {
    assert.equal(typeof row.nom, "string");
    assert.match(row.content_sid || "", /^HX/);
    assert.equal(row.statut, "pending");
    assert.equal(row.pret, false);
    twilio.approvals[row.content_sid || ""] = "approved";
  }
  const status = await statutModelesAutorisationWhatsapp({}, twilio.fetchImpl, store);
  assert.equal(status.pret, true);
  assert.equal(status.modeles.filter((row) => row.nom.endsWith("_v2")).every((row) => row.pret), true);
  assert.deepEqual(
    status.modeles.map((row) => row.nom),
    [
      "autorisation_validee_document_v2",
      "autorisation_validee_image_v2",
      "autorisation_validee_document",
      "autorisation_validee_image",
    ]
  );
});

test("l’envoi lit le réglage avant la variable", async () => {
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT;
  const file = {
    phone: "+33601020304",
    documentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    mime: "application/pdf",
    storedName: "esta.pdf",
    firstName: "Camille",
    lastName: "Martin",
    greetingName: "Camille",
    country: "US",
    docType: "eta",
  };
  const missing = await sendVisaGrantWhatsapp(file, { store: memoryContentSidStore() });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.match(missing.error, /pas encore approuvé/);

  const stored = "HXdddddddddddddddddddddddddddddddd";
  const fromStore = await resolveVisaGrantContentSid("document", fetch, memoryContentSidStore({
    TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT: stored,
  }));
  assert.equal(fromStore, stored);
  process.env.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT = "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const prefersStore = await resolveVisaGrantContentSid(
    "document",
    fetch,
    memoryContentSidStore({ TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT: stored })
  );
  assert.equal(prefersStore, stored);
  const fromEnv = await resolveVisaGrantContentSid("document", fetch, memoryContentSidStore());
  assert.equal(fromEnv, "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const ready = await sendVisaGrantWhatsapp(file, {
    store: memoryContentSidStore({ TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT: stored }),
  });
  assert.equal(ready.ok, false);
  if (!ready.ok) assert.doesNotMatch(ready.error, /pas encore approuvé/);
  delete process.env.TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT;

  const v1 = "HXaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const v2 = "HXbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  clearContentApprovalCache();
  const waiting = fakeTwilio({ approvals: { [v2]: "pending" } });
  const stays = await chooseVisaGrantTemplate(
    "document",
    waiting.fetchImpl,
    memoryContentSidStore({
      TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT: v1,
      TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT_V2: v2,
    })
  );
  assert.equal(stays?.sid, v1);
  assert.equal(stays?.template, "autorisation_validee_document");
  clearContentApprovalCache();
  const approved = fakeTwilio({ approvals: { [v2]: "approved" } });
  const switched = await chooseVisaGrantTemplate(
    "document",
    approved.fetchImpl,
    memoryContentSidStore({
      TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT: v1,
      TWILIO_CONTENT_AUTORISATION_VALIDEE_DOCUMENT_V2: v2,
    })
  );
  assert.equal(switched?.sid, v2);
  assert.equal(switched?.template, "autorisation_validee_document_v2");
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});
