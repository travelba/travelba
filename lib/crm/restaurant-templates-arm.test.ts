import assert from "node:assert/strict";
import test from "node:test";
import { createRestaurantWhatsappTemplates, getRestaurantWhatsappTemplatesStatus } from "./mcp-restaurant-templates";
import {
  approvedRestaurantContentSid,
  clearRestaurantTemplateCache,
  ensureRestaurantTemplates,
  quietTwilioError,
  resolveRestaurantContentSid,
  restaurantTemplateDrafts,
  restaurantTemplatesStatus,
} from "./restaurant-templates-arm";
import {
  RESTAURANT_CAROUSEL_ENV,
  RESTAURANT_CAROUSEL_MENU_ENV,
  RESTAURANT_CAROUSEL_MENU_NAME,
  RESTAURANT_CAROUSEL_NAME,
  RESTAURANT_INTRO_ENV,
  RESTAURANT_INTRO_NAME,
} from "./restaurant-whatsapp";
import { clearContentApprovalCache } from "./twilio-content-sid";

const ACCOUNT = "ACtestaccount000000000000000000000";
const TOKEN = "secret-token-that-must-never-leak";

const KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "VERCEL_ENV",
  RESTAURANT_INTRO_ENV,
  RESTAURANT_CAROUSEL_ENV,
  RESTAURANT_CAROUSEL_MENU_ENV,
  `${RESTAURANT_INTRO_ENV}_V2`,
  `${RESTAURANT_CAROUSEL_ENV}_V2`,
  `${RESTAURANT_CAROUSEL_MENU_ENV}_V2`,
];

function rememberEnv() {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  clearRestaurantTemplateCache();
  clearContentApprovalCache();
  return () => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    clearRestaurantTemplateCache();
    clearContentApprovalCache();
  };
}

function armTwilio() {
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
  process.env.TWILIO_AUTH_TOKEN = TOKEN;
  for (const key of KEYS.slice(3)) delete process.env[key];
}

type Call = { url: string; method: string; body: Record<string, unknown> | null; auth: string | null };

/** Faux Twilio Content API : contenus en mémoire, approbations par SID. */
function fakeTwilio(seed: { contents?: { sid: string; friendly_name: string }[]; approvals?: Record<string, string> } = {}) {
  const contents = [...(seed.contents || [])];
  const approvals: Record<string, string> = { ...(seed.approvals || {}) };
  const calls: Call[] = [];
  let counter = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const headers = (init?.headers || {}) as Record<string, string>;
    calls.push({ url, method, body, auth: headers.Authorization || null });
    const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
    if (!url.startsWith("https://content.twilio.com/v1/Content")) return json({ message: "hors Content API" }, 500);
    const approval = url.match(/\/Content\/(HX[^/]+)\/ApprovalRequests(\/whatsapp)?$/);
    if (approval && method === "POST") {
      const sid = approval[1];
      if (approvals[sid] && approvals[sid] !== "unsubmitted") return json({ message: "Approval request already submitted" }, 409);
      approvals[sid] = "pending";
      return json({ status: "pending", category: body?.category, name: body?.name }, 201);
    }
    if (approval && method === "GET") {
      const sid = approval[1];
      if (!contents.some((row) => row.sid === sid)) return json({ message: "not found" }, 404);
      const status = approvals[sid] || "unsubmitted";
      return json({ sid, whatsapp: { status, rejection_reason: status === "rejected" ? "Variable manquante" : null } });
    }
    if (method === "POST") {
      counter += 1;
      const sid = `HX${String(counter).padStart(3, "0")}${String(body?.friendly_name)}`;
      contents.push({ sid, friendly_name: String(body?.friendly_name) });
      return json({ sid, friendly_name: body?.friendly_name }, 201);
    }
    return json({ contents, meta: { next_page_url: null } });
  };
  return { fetchImpl, calls, contents, approvals };
}

test("les trois brouillons portent les noms et les variables du script", () => {
  const drafts = restaurantTemplateDrafts();
  assert.deepEqual(
    drafts.map((draft) => [draft.friendlyName, draft.env]),
    [
      [RESTAURANT_INTRO_NAME, RESTAURANT_INTRO_ENV],
      [RESTAURANT_CAROUSEL_NAME, RESTAURANT_CAROUSEL_ENV],
      [RESTAURANT_CAROUSEL_MENU_NAME, RESTAURANT_CAROUSEL_MENU_ENV],
    ]
  );
  assert.equal(drafts[0].create.friendly_name, "restaurant_selection");
  assert.equal(drafts[1].create.friendly_name, "restaurant_proposition");
  assert.equal(drafts[2].create.friendly_name, "restaurant_proposition_carte");
});

test("crée les trois modèles, soumet chacun en Utility et renvoie nom, SID et statut", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio();
    const result = await ensureRestaurantTemplates(twilio.fetchImpl);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.modeles.map((row) => [row.nom, row.content_sid, row.statut, row.cree, row.soumis]),
      [
        ["restaurant_selection", "HX001restaurant_selection", "pending", true, true],
        ["restaurant_proposition", "HX002restaurant_proposition", "pending", true, true],
        ["restaurant_proposition_carte", "HX003restaurant_proposition_carte", "pending", true, true],
      ]
    );
    const creates = twilio.calls.filter((call) => call.method === "POST" && !call.url.includes("ApprovalRequests"));
    assert.equal(creates.length, 3);
    const approvals = twilio.calls.filter((call) => call.url.endsWith("/ApprovalRequests/whatsapp"));
    assert.equal(approvals.length, 3);
    for (const call of approvals) assert.equal(call.body?.category, "UTILITY");
    assert.deepEqual(
      creates.map((call) => call.body?.friendly_name),
      ["restaurant_selection", "restaurant_proposition", "restaurant_proposition_carte"]
    );
  } finally {
    restore();
  }
});

test("un modèle déjà présent sous le même nom est repris, pas dupliqué", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio({
      contents: [
        { sid: "HXdejala", friendly_name: "restaurant_selection" },
        { sid: "HXautre", friendly_name: "sejour_v2" },
      ],
      approvals: { HXdejala: "approved" },
    });
    const first = await ensureRestaurantTemplates(twilio.fetchImpl);
    assert.equal(first.modeles[0].content_sid, "HXdejala");
    assert.equal(first.modeles[0].statut, "approved");
    assert.equal(first.modeles[0].cree, false);
    assert.equal(first.modeles[0].soumis, false);
    assert.equal(first.modeles[0].source, "twilio");
    assert.equal(twilio.contents.length, 4);
    const second = await ensureRestaurantTemplates(twilio.fetchImpl);
    assert.equal(twilio.contents.length, 4, "un second passage ne crée rien");
    assert.deepEqual(
      second.modeles.map((row) => [row.content_sid, row.cree, row.soumis]),
      [
        ["HXdejala", false, false],
        ["HX001restaurant_proposition", false, false],
        ["HX002restaurant_proposition_carte", false, false],
      ]
    );
  } finally {
    restore();
  }
});

test("la variable d’environnement prime sur la recherche par nom", async () => {
  const restore = rememberEnv();
  armTwilio();
  process.env[RESTAURANT_INTRO_ENV] = "HXenvintro";
  try {
    const twilio = fakeTwilio({
      contents: [{ sid: "HXenvintro", friendly_name: "ancien_nom" }],
      approvals: { HXenvintro: "approved" },
    });
    const result = await ensureRestaurantTemplates(twilio.fetchImpl);
    assert.equal(result.modeles[0].content_sid, "HXenvintro");
    assert.equal(result.modeles[0].source, "env");
    assert.equal(result.modeles[0].statut, "approved");
    assert.equal(twilio.contents.some((row) => row.friendly_name === "restaurant_selection"), false);
  } finally {
    restore();
  }
});

test("jamais un message : seule la Content API est appelée, et aucun secret ne sort", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio();
    const created = await createRestaurantWhatsappTemplates({}, twilio.fetchImpl);
    const status = await getRestaurantWhatsappTemplatesStatus({}, twilio.fetchImpl);
    for (const call of twilio.calls) {
      assert.match(call.url, /^https:\/\/content\.twilio\.com\/v1\/Content/);
      assert.doesNotMatch(call.url, /Messages/);
      assert.ok(call.auth?.startsWith("Basic "));
    }
    const text = JSON.stringify({ created, status });
    assert.equal(text.includes(ACCOUNT), false);
    assert.equal(text.includes(TOKEN), false);
    assert.equal(text.includes("Basic "), false);
    assert.equal(created.categorie, "UTILITY");
    assert.match(created.note, /Aucun WhatsApp n’est envoyé/);
    assert.deepEqual(
      created.modeles.map((row) => [row.nom, row.content_sid, row.statut]),
      [
        ["restaurant_selection", "HX001restaurant_selection", "pending"],
        ["restaurant_proposition", "HX002restaurant_proposition", "pending"],
        ["restaurant_proposition_carte", "HX003restaurant_proposition_carte", "pending"],
      ]
    );
    assert.equal(status.pret, false);
    assert.equal(status.modeles[0].statut_libelle, "En attente d’approbation");
  } finally {
    restore();
  }
});

test("le statut lit sans créer : absent, en attente, approuvé, refusé avec le motif", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio({
      contents: [
        { sid: "HXintro", friendly_name: "restaurant_selection" },
        { sid: "HXcarte", friendly_name: "restaurant_proposition_carte" },
      ],
      approvals: { HXintro: "approved", HXcarte: "rejected" },
    });
    const result = await restaurantTemplatesStatus(twilio.fetchImpl);
    assert.deepEqual(
      result.modeles.map((row) => [row.nom, row.content_sid, row.statut, row.motif_refus ?? null]),
      [
        ["restaurant_selection", "HXintro", "approved", null],
        ["restaurant_proposition", null, "absent", null],
        ["restaurant_proposition_carte", "HXcarte", "rejected", "Variable manquante"],
      ]
    );
    assert.equal(twilio.calls.some((call) => call.method === "POST"), false);
    assert.equal(twilio.contents.length, 2);
  } finally {
    restore();
  }
});

test("sans variable, le cron retrouve le SID approuvé par son nom et le garde en cache", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio({
      contents: [{ sid: "HXparnom", friendly_name: "restaurant_proposition" }],
      approvals: { HXparnom: "approved" },
    });
    assert.equal(await resolveRestaurantContentSid(RESTAURANT_CAROUSEL_ENV, twilio.fetchImpl), "HXparnom");
    assert.equal(await approvedRestaurantContentSid(RESTAURANT_CAROUSEL_ENV, twilio.fetchImpl), "HXparnom");
    const listings = twilio.calls.filter((call) => call.method === "GET" && call.url.includes("PageSize"));
    assert.equal(listings.length, 1, "la liste n’est lue qu’une fois");
    assert.equal(await resolveRestaurantContentSid(RESTAURANT_INTRO_ENV, twilio.fetchImpl), "");
    assert.equal(await approvedRestaurantContentSid(RESTAURANT_INTRO_ENV, twilio.fetchImpl), "");
    process.env[RESTAURANT_INTRO_ENV] = "HXenv";
    assert.equal(await resolveRestaurantContentSid(RESTAURANT_INTRO_ENV, twilio.fetchImpl), "HXenv");
  } finally {
    restore();
  }
});

test("un modèle en attente n’est pas un SID approuvé : l’envoi reste en file", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio({
      contents: [{ sid: "HXattente", friendly_name: "restaurant_selection" }],
      approvals: { HXattente: "pending" },
    });
    assert.equal(await resolveRestaurantContentSid(RESTAURANT_INTRO_ENV, twilio.fetchImpl), "HXattente");
    assert.equal(await approvedRestaurantContentSid(RESTAURANT_INTRO_ENV, twilio.fetchImpl), "");
  } finally {
    restore();
  }
});

test("sans Twilio sur le serveur, ou en preview, rien n’est créé et l’outil le dit", async () => {
  const restore = rememberEnv();
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.TWILIO_ACCOUNT_SID = ACCOUNT;
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    };
    const result = await ensureRestaurantTemplates(fetchImpl);
    assert.equal(result.ok, false);
    assert.match(result.message || "", /Twilio n’est pas configuré/);
    assert.equal(calls, 0);
    await assert.rejects(() => createRestaurantWhatsappTemplates({}, fetchImpl), /Twilio n’est pas configuré/);
    const status = await getRestaurantWhatsappTemplatesStatus({}, fetchImpl);
    assert.equal(status.ok, false);
    assert.equal(status.modeles[0].statut, "inconnu");
    assert.equal(calls, 0);
    assert.equal(await resolveRestaurantContentSid(RESTAURANT_INTRO_ENV, fetchImpl), "");
  } finally {
    restore();
  }
});

test("une erreur Twilio est rapportée sans URL ni secret, et les autres modèles passent", async () => {
  const restore = rememberEnv();
  armTwilio();
  try {
    const twilio = fakeTwilio();
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = typeof init?.body === "string" ? (JSON.parse(init.body) as { friendly_name?: string }) : null;
      if (init?.method === "POST" && body?.friendly_name === "restaurant_proposition") {
        return new Response(JSON.stringify({ message: `Invalid card media https://example.invalid/x for ${ACCOUNT} ${TOKEN}` }), { status: 400 });
      }
      return twilio.fetchImpl(input, init);
    };
    const result = await ensureRestaurantTemplates(fetchImpl);
    assert.equal(result.ok, false);
    assert.equal(result.modeles[0].statut, "pending");
    assert.equal(result.modeles[1].content_sid, null);
    assert.match(result.modeles[1].erreur || "", /Invalid card media/);
    assert.doesNotMatch(result.modeles[1].erreur || "", /https?:/);
    assert.equal(result.modeles[1].erreur?.includes(ACCOUNT), false);
    assert.equal(result.modeles[1].erreur?.includes(TOKEN), false);
    assert.equal(result.modeles[2].statut, "pending");
    assert.equal(quietTwilioError(new Error(`voir https://twilio.com/x ${TOKEN}`)), "voir");
  } finally {
    restore();
  }
});
