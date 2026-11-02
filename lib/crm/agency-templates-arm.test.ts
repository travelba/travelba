import assert from "node:assert/strict";
import test from "node:test";
import {
  agencyTemplateDrafts,
  agencyTemplatesStatus,
  ensureAgencyTemplates,
  quietAgencyTwilioError,
  resolveAgencyContentSid,
} from "./agency-templates-arm";
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
    ["acces_client", "option_hotel_activee", "facture_paiement"]
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
    ["acces_client", "option_hotel_activee", "facture_paiement"]
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
    contents: [{ sid: stored, friendly_name: "acces_client" }],
    approvals: { [stored]: "approved" },
  });
  const sid = await resolveAgencyContentSid("TWILIO_CONTENT_ACCES_CLIENT", twilio.fetchImpl, store);
  assert.equal(sid, stored);
  const empty = memoryContentSidStore();
  const fallback = await resolveAgencyContentSid("TWILIO_CONTENT_ACCES_CLIENT", twilio.fetchImpl, empty);
  assert.equal(fallback, fromEnv);
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
