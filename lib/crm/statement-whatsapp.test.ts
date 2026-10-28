import assert from "node:assert/strict";
import { test } from "node:test";
import { statementSignedPath, verifyStatementToken } from "./statement-link";
import {
  runStatementDelivery,
  statementAttemptKey,
  statementContentDrafts,
  statementContentVariables,
  statementDedupeKey,
  statementMediaUrl,
  statementParisDay,
  statementRefusalMessage,
  type StatementJournalRow,
  type StatementSendOutcome,
} from "./statement-whatsapp";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-27T14:55:00.000Z");
const PHONE = "+33601020304";

function harness(extra?: {
  prior?: { id: string; status: string } | null;
  windowOpen?: boolean;
  templateSid?: string | null;
  phone?: string | null;
  to?: string | null;
  optedOut?: boolean;
  previewBlocked?: boolean;
  insertFails?: boolean;
  templateResult?: StatementSendOutcome;
  sessionResult?: StatementSendOutcome;
}) {
  const calls = { upload: 0, session: 0, template: 0, sessionUrl: "" };
  const rows: StatementJournalRow[] = [];
  const updates: { id: string; patch: Partial<StatementJournalRow> }[] = [];
  const prior = extra?.prior === undefined ? null : extra.prior;
  const deps = {
    upload: async () => {
      calls.upload += 1;
    },
    objectPath: (id: string) => `customers/${id}/releves/releve-de-compte.pdf`,
    mediaPath: () => statementMediaVariableForTest(),
    sendSession: async (message: { to: string; body: string; mediaUrl: string }) => {
      calls.session += 1;
      calls.sessionUrl = message.mediaUrl;
      return extra?.sessionResult || { ok: true as const, sid: "SMsession" };
    },
    sendTemplate: async () => {
      calls.template += 1;
      return extra?.templateResult || { ok: true as const, sid: "SMtemplate" };
    },
    insert: async (row: StatementJournalRow) => {
      if (extra?.insertFails) return { error: "failed" as const };
      if (rows.some((item) => item.dedupe_key === row.dedupe_key)) return { error: "duplicate" as const };
      rows.push(row);
      return { id: `row-${rows.length}` };
    },
    update: async (id: string, patch: Partial<StatementJournalRow>) => {
      updates.push({ id, patch });
      const row = rows.find((item) => `row-${rows.indexOf(item) + 1}` === id);
      if (row) Object.assign(row, patch);
      return true;
    },
    find: async (dedupeKey: string) => {
      const index = rows.findIndex((item) => item.dedupe_key === dedupeKey);
      if (index < 0) return prior && prior.id ? null : null;
      return { id: `row-${index + 1}`, status: rows[index].status };
    },
  };
  const input = {
    customerId: CUSTOMER,
    phone: extra && "phone" in extra ? extra.phone || null : PHONE,
    to: extra && "to" in extra ? extra.to || null : `whatsapp:${PHONE}`,
    firstName: "Raphael Haim",
    member: false,
    audience: "staff" as const,
    pdf: new Uint8Array([1, 2, 3]),
    windowOpen: extra?.windowOpen ?? false,
    templateSid: extra && "templateSid" in extra ? extra.templateSid || null : null,
    optedOut: extra?.optedOut ?? false,
    previewBlocked: extra?.previewBlocked ?? false,
    now: NOW,
    prior,
    staffId: "staff-1",
  };
  return { calls, rows, updates, input, deps };
}

function statementMediaVariableForTest() {
  return "token/Releve-de-compte.pdf";
}

test("hors fenêtre et sans modèle, rien ne part et l’échec est noté", async () => {
  const { calls, rows, input, deps } = harness();
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "outside_window");
  assert.match(result.message, /24 heures/);
  assert.match(result.message, /pas encore approuvé/);
  assert.equal(calls.upload, 0);
  assert.equal(calls.session, 0);
  assert.equal(calls.template, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].template_key, "releve");
  assert.equal(rows[0].dedupe_key, statementDedupeKey(CUSTOMER, "2026-10-27"));
  assert.equal(rows[0].phone, PHONE);
  assert.match(rows[0].body, /24 heures/);
});

test("le modèle approuvé part hors fenêtre, avec le PDF en variable", async () => {
  const { calls, rows, input, deps } = harness({ templateSid: "HXreleve" });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.template, 1);
  assert.equal(calls.session, 0);
  assert.equal(calls.upload, 1);
  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].template_key, "releve");
  assert.equal(rows[0].twilio_sid, "SMtemplate");
  assert.match(rows[0].body, /Bonjour Raphael/);
  assert.match(rows[0].body, /relevé de compte/);
  const variables = statementContentVariables("token/Releve-de-compte.pdf", "Raphael Haim", false);
  assert.equal(variables?.["2"], "Raphael");
  assert.equal(variables?.["3"], "relevé de compte");
  assert.equal(String(variables?.["1"]).startsWith("https://"), false);
});

test("dans la fenêtre, le message de session joint l’adresse Travelba", async () => {
  const { calls, rows, input, deps } = harness({ windowOpen: true });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(calls.template, 0);
  assert.equal(calls.sessionUrl, statementMediaUrl("token/Releve-de-compte.pdf"));
  assert.match(calls.sessionUrl, /^https:\/\/travelba\.fr\/api\/whatsapp\/releves\//);
  assert.equal(calls.sessionUrl.includes("supabase.co"), false);
  assert.equal(rows[0].template_key, "releve_session");
  assert.equal(rows[0].status, "sent");
});

test("si le modèle est refusé et la fenêtre est ouverte, la session part", async () => {
  const { calls, rows, input, deps } = harness({
    windowOpen: true,
    templateSid: "HXreleve",
    templateResult: { ok: false, detail: "rejected" },
  });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.template, 1);
  assert.equal(calls.session, 1);
  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].template_key, "releve_session");
});

test("si le modèle est refusé hors fenêtre, l’échec est enregistré", async () => {
  const { calls, rows, input, deps } = harness({
    templateSid: "HXreleve",
    templateResult: { ok: false, detail: "https://example.test +33601020304 refused" },
  });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, false);
  assert.equal(calls.session, 0);
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error || "", /refused/);
  assert.equal((rows[0].error || "").includes("example.test"), false);
  assert.equal((rows[0].error || "").includes("33601020304"), false);
});

test("un envoi déjà parti ne coupe pas le clic suivant", async () => {
  const { calls, rows, input, deps } = harness({
    windowOpen: true,
    prior: { id: "deja", status: "sent" },
  });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].dedupe_key, statementDedupeKey(CUSTOMER, statementParisDay(NOW)));
});

test("un échec du jour est rejoué sur la même ligne", async () => {
  const { calls, updates, input, deps } = harness({
    windowOpen: true,
    prior: { id: "echec", status: "failed" },
  });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(updates[0]?.id, "echec");
  assert.equal(statementAttemptKey(CUSTOMER, "2026-10-27", { status: "failed" }, NOW).reuse, true);
});

test("sans téléphone, l’échec est noté et Twilio n’est pas appelé", async () => {
  const { calls, rows, input, deps } = harness({ phone: null, to: null });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "no_phone");
  assert.match(statementRefusalMessage("no_phone", "staff"), /téléphone/);
  assert.equal(calls.session, 0);
  assert.equal(rows[0].status, "failed");
});

test("le journal en panne empêche l’envoi", async () => {
  const { calls, input, deps } = harness({ windowOpen: true, insertFails: true });
  const result = await runStatementDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "journal");
  assert.match(result.message, /Rien n’a été envoyé/);
  assert.equal(calls.session, 0);
  assert.equal(calls.template, 0);
});

test("le brouillon du relevé est un document PDF en français", () => {
  const draft = statementContentDrafts()[0];
  const media = draft.create.types["twilio/media"];
  assert.equal(draft.env, "TWILIO_CONTENT_RELEVE");
  assert.equal(draft.create.language, "fr");
  assert.match(media.media[0], /\/api\/whatsapp\/releves\/\{\{1\}\}$/);
  assert.match(media.body, /Voici votre \{\{3\}\}/);
  assert.equal(/\{\{\d+\}\}(?:\s|[,:;.])*\{\{\d+\}\}/.test(media.body), false);
});

test("le jeton du relevé expire et ne vaut que pour ce compte", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const preview = process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  delete process.env.VERCEL_ENV;
  try {
    const now = Date.parse("2026-10-27T14:55:00.000Z");
    const path = statementSignedPath(CUSTOMER, now);
    assert.ok(path);
    const token = path.split("/")[0];
    assert.deepEqual(verifyStatementToken(token, now), {
      customerId: CUSTOMER,
      exp: Math.floor(now / 1000) + 60 * 60,
    });
    assert.equal(verifyStatementToken(token, now + 61 * 60 * 1000), null);
    assert.equal(verifyStatementToken(`${token}x`, now), null);
    assert.equal(statementSignedPath("pas-un-compte", now), null);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    if (preview === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = preview;
  }
});
