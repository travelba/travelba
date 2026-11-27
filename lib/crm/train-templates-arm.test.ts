import assert from "node:assert/strict";
import test from "node:test";
import { ensureTrainTemplates, trainReplyTitlesRejected } from "./train-templates-arm";

test("un modèle refusé est recréé, l’ancien contenu n’est pas resoumis", async () => {
  const saved = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    env: process.env.VERCEL_ENV,
    accord: process.env.TWILIO_CONTENT_TRAIN_ACCORD,
  };
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = "ACtestaccount000000000000000000000";
  process.env.TWILIO_AUTH_TOKEN = "secret-token-that-must-never-leak";
  process.env.TWILIO_CONTENT_TRAIN_ACCORD = "HXrefused";
  const approvals: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    assert.equal(url.includes("Messages"), false);
    if (url.endsWith("/Content/HXrefused") && method === "GET") {
      return Response.json({ sid: "HXrefused", types: { "twilio/quick-reply": { actions: [{ title: "Je confirme" }] } } });
    }
    if (url.endsWith("/ApprovalRequests") && method === "GET") {
      const sid = url.split("/Content/")[1]?.split("/")[0];
      if (sid === "HXrefused") return Response.json({ whatsapp: { status: "rejected", rejection_reason: "variable" } });
      return Response.json({ whatsapp: { status: "received" } });
    }
    if (url.endsWith("/v1/Content") && method === "POST") return Response.json({ sid: "HXfresh" });
    if (url.includes("/ApprovalRequests/whatsapp") && method === "POST") {
      approvals.push(url);
      return Response.json({ status: "received" });
    }
    return Response.json({ contents: [], meta: {} });
  };
  try {
    const result = await ensureTrainTemplates(fetchImpl);
    const accord = result.modeles.find((row) => row.nom === "train_accord");
    assert.equal(accord?.content_sid, "HXfresh");
    assert.equal(accord?.cree, true);
    assert.equal(approvals.some((url) => url.includes("HXrefused")), false);
    assert.equal(approvals.some((url) => url.includes("HXfresh")), true);
    assert.equal(result.ok, true);
  } finally {
    for (const [key, value] of [
      ["TWILIO_ACCOUNT_SID", saved.sid],
      ["TWILIO_AUTH_TOKEN", saved.token],
      ["VERCEL_ENV", saved.env],
      ["TWILIO_CONTENT_TRAIN_ACCORD", saved.accord],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("un titre avec accolade est refusé, un titre fixe passe", () => {
  assert.equal(trainReplyTitlesRejected({ types: { "twilio/quick-reply": { actions: [{ title: "{{3}}" }] } } }), true);
  assert.equal(trainReplyTitlesRejected({ types: { "twilio/quick-reply": { actions: [{ title: "Train 1" }] } } }), false);
  assert.equal(trainReplyTitlesRejected(null), false);
});

test("un modèle déjà créé avec des accolades est recréé, sans appel Messages", async () => {
  const savedSid = process.env.TWILIO_ACCOUNT_SID;
  const savedToken = process.env.TWILIO_AUTH_TOKEN;
  const savedEnv = process.env.VERCEL_ENV;
  const savedContent = process.env.TWILIO_CONTENT_TRAIN_HORAIRES_ALLER_3;
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = "ACtestaccount000000000000000000000";
  process.env.TWILIO_AUTH_TOKEN = "secret-token-that-must-never-leak";
  process.env.TWILIO_CONTENT_TRAIN_HORAIRES_ALLER_3 = "HXoldbraces";
  const created: { title?: string; item?: string; id?: string }[][] = [];
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    assert.equal(url.includes("Messages"), false);
    const method = init?.method || "GET";
    if (url.endsWith("/Content/HXoldbraces") && method === "GET") {
      return Response.json({
        sid: "HXoldbraces",
        types: { "twilio/quick-reply": { actions: [{ title: "{{3}}", id: "{{4}}" }] } },
      });
    }
    if (url.includes("/ApprovalRequests") && method === "GET") return new Response("{}", { status: 404 });
    if (url.includes("/ApprovalRequests/whatsapp") && method === "POST") return Response.json({ status: "received" });
    if (url.endsWith("/v1/Content") && method === "GET") return Response.json({ contents: [], meta: {} });
    if (url.endsWith("/v1/Content") && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        types?: {
          "twilio/quick-reply"?: { actions?: { title?: string; id?: string }[] };
          "twilio/list-picker"?: { items?: { item?: string; id?: string }[] };
        };
      };
      const actions = body.types?.["twilio/quick-reply"]?.actions || body.types?.["twilio/list-picker"]?.items || [];
      created.push(actions);
      for (const action of body.types?.["twilio/quick-reply"]?.actions || []) assert.doesNotMatch(action.title || "", /[{}]/);
      return Response.json({ sid: `HXnew${created.length}` });
    }
    if (url.includes("/ApprovalRequests") && method === "GET") return Response.json({ whatsapp: { status: "received" } });
    return Response.json({ contents: [], meta: {} });
  };
  try {
    const result = await ensureTrainTemplates(fetchImpl);
    const aller = result.modeles.find((row) => row.nom === "train_horaires_aller_3");
    assert.equal(aller?.cree, true);
    assert.equal(aller?.content_sid, "HXnew1");
    assert.equal(aller?.soumis, false);
    assert.equal(created[0]?.[0]?.item, "{{3}}");
    assert.equal(created[0]?.[0]?.id, "train:aller:0");
    assert.equal(urls.some((url) => /\/HXnew1(?:\/|$)/.test(url) && url.includes("ApprovalRequests")), false);
    assert.equal(urls.some((url) => url.includes("Messages")), false);
    assert.equal(result.ok, true);
  } finally {
    if (savedSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = savedSid;
    if (savedToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = savedToken;
    if (savedEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = savedEnv;
    if (savedContent === undefined) delete process.env.TWILIO_CONTENT_TRAIN_HORAIRES_ALLER_3;
    else process.env.TWILIO_CONTENT_TRAIN_HORAIRES_ALLER_3 = savedContent;
  }
});
