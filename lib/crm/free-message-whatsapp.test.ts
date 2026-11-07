import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureFreeMessageTemplate,
  freeMessageTemplateDrafts,
  freeMessageTemplateStatus,
} from "./agency-templates-arm";
import { deposerModeleMessageLibre, statutModeleMessageLibre } from "./mcp-agency-templates";
import { freeMessageSignedPath, verifyFreeMessageToken } from "./free-message-link";
import {
  FREE_MESSAGE_BODY,
  FREE_MESSAGE_REJECTED_NAMES,
  FREE_MESSAGE_SAMPLE_FILE,
  FREE_MESSAGE_SAMPLE_PATH,
  FREE_MESSAGE_SAMPLE_TEXT,
  FREE_MESSAGE_TEMPLATE,
  FREE_MESSAGE_TEMPLATE_ENV,
  freeMessageContentDrafts,
  freeMessageFileName,
  freeMessagePendingMessage,
  freeMessagePreview,
  freeMessageSamplePdf,
  freeMessageText,
  freeMessageWordRatio,
} from "./free-message-whatsapp";
import { VISA_GRANT_SENTENCE_V2 } from "./visa-grant-whatsapp";
import { memoryContentSidStore } from "./whatsapp-content-sid-store";

const ACCOUNT = "ACtestaccount000000000000000000000";
const TOKEN = "secret-token-that-must-never-leak";

test("le corps laisse un texte libre et tient le ratio Meta", () => {
  assert.equal(FREE_MESSAGE_TEMPLATE, "message_libre_document");
  assert.equal((FREE_MESSAGE_REJECTED_NAMES as readonly string[]).includes("acces_client"), true);
  assert.equal((FREE_MESSAGE_REJECTED_NAMES as readonly string[]).includes(FREE_MESSAGE_TEMPLATE), false);
  const ratio = freeMessageWordRatio(FREE_MESSAGE_BODY);
  assert.equal(ratio.variables, 1);
  assert.equal(ratio.ok, true);
  assert.ok(ratio.words >= ratio.needed);
  assert.match(FREE_MESSAGE_BODY, /^Bonjour,/);
  assert.match(FREE_MESSAGE_BODY, /\{\{2\}\}/);
  assert.match(FREE_MESSAGE_BODY, /Travel BA/);
  assert.match(FREE_MESSAGE_BODY, /Le Concierge\s*$/);
  assert.equal(FREE_MESSAGE_BODY.includes(VISA_GRANT_SENTENCE_V2), false);
  assert.equal(FREE_MESSAGE_BODY.includes("Bonne nouvelle"), false);
  assert.equal(FREE_MESSAGE_BODY.includes("autorisation"), false);
  const thin = "Bonjour {{1}}";
  assert.equal(freeMessageWordRatio(thin).ok, false);
});

test("l’exemple et le texte libre ne portent pas de numéro de pièce", () => {
  assert.equal(freeMessageText(FREE_MESSAGE_SAMPLE_TEXT), FREE_MESSAGE_SAMPLE_TEXT);
  assert.equal(freeMessageText("  Amin,\nvoici le document.  "), "Amin, voici le document.");
  assert.equal(freeMessageText("Voici le document.\n\nLe Concierge"), "Voici le document.");
  assert.equal(freeMessageText("Passeport 12AB34567 joint"), null);
  assert.equal(freeMessageText("{{2}}"), null);
  assert.equal(freeMessageText(""), null);
  const preview = freeMessagePreview("Amin, voici votre document signé.");
  assert.match(preview || "", /Amin, voici votre document signé\./);
  assert.match(preview || "", /Travel BA/);
  assert.match(preview || "", /Le Concierge/);
  assert.equal((preview || "").includes("{{"), false);
  assert.equal((preview || "").includes("Bonne nouvelle"), false);
  assert.equal(freeMessageFileName("attestation-cdc-ebola-amin-khiari-signee.pdf"), "attestation-cdc-ebola-amin-khiari-signee.pdf");
  assert.equal(freeMessageFileName("12AB34567.pdf"), "document.pdf");
  assert.equal(freeMessageSamplePdf().subarray(0, 5).toString("utf8"), "%PDF-");
});

test("le brouillon est Utility français, en-tête Document, avec les exemples", () => {
  const [draft] = freeMessageContentDrafts();
  assert.equal(draft.friendlyName, FREE_MESSAGE_TEMPLATE);
  assert.equal(draft.env, FREE_MESSAGE_TEMPLATE_ENV);
  assert.equal(draft.create.language, "fr");
  assert.equal(draft.create.variables["1"], FREE_MESSAGE_SAMPLE_PATH);
  assert.equal(draft.create.variables["2"], FREE_MESSAGE_SAMPLE_TEXT);
  const media = draft.create.types["twilio/media"];
  assert.equal(media.body, FREE_MESSAGE_BODY);
  assert.equal(media.media[0], "https://travelba.fr/api/whatsapp/messages/{{1}}");
  assert.equal(media.media.length, 1);
  assert.match(freeMessagePendingMessage(), /message_libre_document/);
  assert.match(freeMessagePendingMessage(), /deposer_modele_message_libre/);
  assert.match(freeMessagePendingMessage(), new RegExp(FREE_MESSAGE_SAMPLE_FILE));
  assert.equal(freeMessagePendingMessage().includes("HX"), false);
  assert.equal(freeMessagePendingMessage().includes(VISA_GRANT_SENTENCE_V2), false);
  assert.deepEqual(
    freeMessageTemplateDrafts().map((row) => row.friendlyName),
    [FREE_MESSAGE_TEMPLATE]
  );
});

test("le jeton signe le document et refuse un autre nom", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const id = "c529ab8a-5777-4faf-8bb9-9b1014705dca";
    const path = freeMessageSignedPath(id, "attestation.pdf", Date.parse("2026-11-07T08:00:00Z"));
    assert.ok(path);
    assert.match(path, /attestation\.pdf$/);
    assert.equal(/^https?:/i.test(path), false);
    const [token, file] = path.split("/");
    assert.ok(verifyFreeMessageToken(token, file, Date.parse("2026-11-07T08:30:00Z")));
    assert.equal(verifyFreeMessageToken(token, "autre.pdf", Date.parse("2026-11-07T08:30:00Z")), null);
    assert.equal(verifyFreeMessageToken(token, file, Date.parse("2026-11-07T10:00:00Z")), null);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

function armTwilio() {
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  delete process.env.TWILIO_CONTENT_MESSAGE_LIBRE_DOCUMENT;
}

function fakeTwilio() {
  const contents: { sid: string; friendly_name: string }[] = [];
  const approvals: Record<string, string> = {};
  const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
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
      approvals[approval[1]] = "pending";
      return json({ status: "pending" }, 201);
    }
    if (approval && method === "GET") {
      const status = approvals[approval[1]] || "unsubmitted";
      return json({ sid: approval[1], whatsapp: { status, rejection_reason: null } });
    }
    if (method === "POST") {
      counter += 1;
      const sid = `HX${String(counter).padStart(32, "b")}`;
      contents.push({ sid, friendly_name: String(body?.friendly_name) });
      return json({ sid }, 201);
    }
    return json({ contents, meta: { next_page_url: null } });
  };
  return { fetchImpl, calls, contents };
}

test("le dépôt est idempotent, Utility, et ne renvoie pas le jeton", async () => {
  armTwilio();
  const store = memoryContentSidStore();
  const twilio = fakeTwilio();
  const result = await deposerModeleMessageLibre({}, twilio.fetchImpl, store);
  assert.equal(result.ok, true);
  assert.equal(result.categorie, "UTILITY");
  assert.equal(result.modeles.length, 1);
  assert.equal(result.modeles[0].nom, FREE_MESSAGE_TEMPLATE);
  assert.equal(result.modeles[0].variable, FREE_MESSAGE_TEMPLATE_ENV);
  assert.match(result.modeles[0].content_sid || "", /^HX/);
  assert.equal(result.modeles[0].soumis, true);
  assert.equal(result.pret, false);
  assert.equal(store.rows[FREE_MESSAGE_TEMPLATE_ENV], result.modeles[0].content_sid);
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes(ACCOUNT), false);
  assert.match(result.note, /Aucun WhatsApp/);
  const approval = twilio.calls.find((call) => call.method === "POST" && call.url.endsWith("/ApprovalRequests/whatsapp"));
  assert.equal(approval?.body?.category, "UTILITY");
  assert.equal(approval?.body?.name, FREE_MESSAGE_TEMPLATE);
  const again = await ensureFreeMessageTemplate(twilio.fetchImpl, store);
  assert.equal(again.modeles[0].cree, false);
  assert.equal(twilio.calls.filter((call) => call.method === "POST" && call.url.endsWith("/Content")).length, 1);
  const status = await statutModeleMessageLibre({}, twilio.fetchImpl, store);
  assert.equal(status.modeles[0].content_sid, result.modeles[0].content_sid);
  assert.equal(JSON.stringify(status).includes(TOKEN), false);
  const missing = await freeMessageTemplateStatus(twilio.fetchImpl, memoryContentSidStore());
  assert.equal(missing.modeles[0].nom, FREE_MESSAGE_TEMPLATE);
});
