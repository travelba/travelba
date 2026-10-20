import assert from "node:assert/strict";
import test from "node:test";
import { clearContentApprovalCache, resolveContentSid } from "./twilio-content-sid";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("sans variante, l’ancien SID part et Twilio n’est pas appelé", async () => {
  clearContentApprovalCache();
  const previous = process.env.TWILIO_CONTENT_SEJOUR;
  const next = process.env.TWILIO_CONTENT_SEJOUR_V2;
  process.env.TWILIO_CONTENT_SEJOUR = "HXancien";
  delete process.env.TWILIO_CONTENT_SEJOUR_V2;
  let calls = 0;
  try {
    const sid = await resolveContentSid("TWILIO_CONTENT_SEJOUR", async () => {
      calls += 1;
      return jsonResponse({});
    });
    assert.equal(sid, "HXancien");
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.TWILIO_CONTENT_SEJOUR;
    else process.env.TWILIO_CONTENT_SEJOUR = previous;
    if (next === undefined) delete process.env.TWILIO_CONTENT_SEJOUR_V2;
    else process.env.TWILIO_CONTENT_SEJOUR_V2 = next;
    clearContentApprovalCache();
  }
});

test("la variante en attente ne remplace pas l’ancien SID", async () => {
  clearContentApprovalCache();
  const env = {
    TWILIO_CONTENT_SEJOUR: process.env.TWILIO_CONTENT_SEJOUR,
    TWILIO_CONTENT_SEJOUR_V2: process.env.TWILIO_CONTENT_SEJOUR_V2,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  };
  process.env.TWILIO_CONTENT_SEJOUR = "HXancien";
  process.env.TWILIO_CONTENT_SEJOUR_V2 = "HXnouveau";
  process.env.TWILIO_ACCOUNT_SID = "ACexemple";
  process.env.TWILIO_AUTH_TOKEN = "jeton";
  try {
    const sid = await resolveContentSid("TWILIO_CONTENT_SEJOUR", async () =>
      jsonResponse({ whatsapp: { status: "pending" } })
    );
    assert.equal(sid, "HXancien");
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearContentApprovalCache();
  }
});

test("la variante approuvée remplace l’ancien SID", async () => {
  clearContentApprovalCache();
  const env = {
    TWILIO_CONTENT_SEJOUR: process.env.TWILIO_CONTENT_SEJOUR,
    TWILIO_CONTENT_SEJOUR_V2: process.env.TWILIO_CONTENT_SEJOUR_V2,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  };
  process.env.TWILIO_CONTENT_SEJOUR = "HXancien";
  process.env.TWILIO_CONTENT_SEJOUR_V2 = "HXnouveau";
  process.env.TWILIO_ACCOUNT_SID = "ACexemple";
  process.env.TWILIO_AUTH_TOKEN = "jeton";
  try {
    const sid = await resolveContentSid("TWILIO_CONTENT_SEJOUR", async (url) => {
      assert.match(String(url), /HXnouveau\/ApprovalRequests$/);
      assert.equal(String(url).includes("Messages"), false);
      return jsonResponse({ whatsapp: { status: "approved" } });
    });
    assert.equal(sid, "HXnouveau");
  } finally {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearContentApprovalCache();
  }
});
