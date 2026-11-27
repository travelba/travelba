import assert from "node:assert/strict";
import test from "node:test";
import { ensureTrainTemplates, trainReplyTitlesRejected } from "./train-templates-arm";

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
  const created: { title?: string; id?: string }[][] = [];
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
      const body = JSON.parse(String(init?.body)) as { types?: { "twilio/quick-reply"?: { actions?: { title?: string; id?: string }[] } } };
      const actions = body.types?.["twilio/quick-reply"]?.actions || [];
      created.push(actions);
      for (const action of actions) assert.doesNotMatch(action.title || "", /[{}]/);
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
    assert.equal(created[0]?.[0]?.title, "Train 1");
    assert.equal(created[0]?.[0]?.id, "train:aller:0");
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
