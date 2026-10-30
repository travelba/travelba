import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { boardingPassContentDrafts } from "./boarding-pass-whatsapp";
import { conciergeContentDrafts } from "./concierge-notices";
import { flightNoticeDrafts } from "./flight-watch";
import { statementContentDrafts } from "./statement-whatsapp";
import { tripShareMessage } from "./trip-share";
import {
  runTripShareDelivery,
  tripShareAttemptKey,
  tripShareContentDrafts,
  tripShareContentVariables,
  tripShareDedupeKey,
  tripShareParisDay,
  tripShareRefusalMessage,
  type TripShareJournalRow,
  type TripShareSendOutcome,
} from "./trip-share-whatsapp";
import { whatsappCallbackFailure, whatsappFailureSentence } from "./whatsapp";

const CUSTOMER = "11111111-1111-4111-8111-111111111111";
const BOOKING = "22222222-2222-4222-8222-222222222222";
const COMPANION = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-10-27T16:23:00.000Z");
const PHONE = "+33664349810";
const SHARE_URL = "https://travelba.fr/v/23456789";
const TITLE = "Anantara Plaza Nice Hotel";
const FIRST = "Victoria Marie Rebecca";

function harness(extra?: {
  prior?: { id: string; status: string } | null;
  windowOpen?: boolean;
  templateSid?: string | null;
  phone?: string | null;
  to?: string | null;
  previewBlocked?: boolean;
  url?: string;
  insertFails?: boolean;
  templateResult?: TripShareSendOutcome;
  sessionResult?: TripShareSendOutcome;
  readFailed?: { error: string } | null;
}) {
  const calls = { session: 0, template: 0, sessionBody: "", variables: null as Record<string, string> | null };
  const rows: TripShareJournalRow[] = [];
  const updates: { id: string; patch: Partial<TripShareJournalRow> }[] = [];
  const prior = extra?.prior === undefined ? null : extra.prior;
  const deps = {
    sendSession: async (message: { to: string; body: string; mediaUrl: string | null }) => {
      calls.session += 1;
      calls.sessionBody = message.body;
      return extra?.sessionResult || { ok: true as const, sid: "SMsession" };
    },
    sendTemplate: async (message: { phone: string; contentSid: string; variables: Record<string, string> }) => {
      calls.template += 1;
      calls.variables = message.variables;
      return extra?.templateResult || { ok: true as const, sid: "SMtemplate" };
    },
    insert: async (row: TripShareJournalRow) => {
      if (extra?.insertFails) return { error: "failed" as const };
      if (rows.some((item) => item.dedupe_key === row.dedupe_key)) return { error: "duplicate" as const };
      rows.push(row);
      return { id: `row-${rows.length}` };
    },
    update: async (id: string, patch: Partial<TripShareJournalRow>) => {
      updates.push({ id, patch });
      const row = rows.find((item) => `row-${rows.indexOf(item) + 1}` === id);
      if (row) Object.assign(row, patch);
      return true;
    },
    find: async (dedupeKey: string) => {
      const index = rows.findIndex((item) => item.dedupe_key === dedupeKey);
      if (index < 0) return null;
      return { id: `row-${index + 1}`, status: rows[index].status };
    },
    read: async (id: string) => {
      if (extra?.readFailed) return { status: "failed", error: extra.readFailed.error };
      const row = rows.find((item) => `row-${rows.indexOf(item) + 1}` === id);
      if (!row) return null;
      return { status: row.status, error: row.error };
    },
  };
  const input = {
    customerId: CUSTOMER,
    bookingId: BOOKING,
    companionId: COMPANION,
    phone: extra && "phone" in extra ? extra.phone || null : PHONE,
    to: extra && "to" in extra ? extra.to || null : `whatsapp:${PHONE}`,
    firstName: FIRST,
    title: TITLE,
    url: extra?.url || SHARE_URL,
    mediaUrl: null,
    audience: "staff" as const,
    windowOpen: extra?.windowOpen ?? false,
    templateSid: extra && "templateSid" in extra ? extra.templateSid || null : null,
    previewBlocked: extra?.previewBlocked ?? false,
    now: NOW,
    prior,
    staffId: "staff-1",
  };
  return { calls, rows, updates, input, deps };
}

test("hors fenêtre et sans modèle, rien ne part et l’échec est noté", async () => {
  const { calls, rows, input, deps } = harness();
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "outside_window");
  assert.match(result.message, /24 heures/);
  assert.match(result.message, /pas encore approuvé/);
  assert.equal(result.message.includes("Lien envoyé"), false);
  assert.equal(calls.session, 0);
  assert.equal(calls.template, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].template_key, "partage_voyage");
  assert.equal(rows[0].customer_id, CUSTOMER);
  assert.equal(rows[0].booking_id, BOOKING);
  assert.equal(rows[0].phone, PHONE);
  assert.equal(rows[0].dedupe_key, tripShareDedupeKey(BOOKING, COMPANION, "2026-10-27"));
  assert.match(rows[0].error || "", /24 heures/);
  assert.equal((rows[0].error || "").includes(PHONE), false);
});

test("le modèle approuvé part hors fenêtre, avec le code du lien et pas l’adresse complète", async () => {
  const { calls, rows, input, deps } = harness({ templateSid: "HXpartage" });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.message, /^Lien envoyé à Victoria Marie Rebecca par WhatsApp\.$/);
  assert.equal(calls.template, 1);
  assert.equal(calls.session, 0);
  assert.equal(calls.variables?.["1"], "Victoria");
  assert.equal(calls.variables?.["2"], TITLE);
  assert.equal(calls.variables?.["3"], "23456789");
  assert.equal(String(calls.variables?.["3"]).includes("http"), false);
  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].template_key, "partage_voyage");
  assert.equal(rows[0].twilio_sid, "SMtemplate");
  assert.match(rows[0].body, /Bonjour Victoria,/);
  assert.match(rows[0].body, /Voici le voyage Anantara Plaza Nice Hotel\./);
  assert.match(rows[0].body, /travelba\.fr\/v\/23456789/);
});

test("dans la fenêtre, le message libre part et le modèle n’est pas utilisé", async () => {
  const { calls, rows, input, deps } = harness({ windowOpen: true, templateSid: "HXpartage" });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(calls.template, 0);
  assert.equal(
    calls.sessionBody,
    tripShareMessage({ firstName: FIRST, title: TITLE, url: SHARE_URL })
  );
  assert.match(calls.sessionBody, /Bonjour Victoria Marie Rebecca,/);
  assert.equal(rows[0].template_key, "partage_voyage_session");
  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].twilio_sid, "SMsession");
});

test("un 63016 dans la fenêtre retombe sur le modèle, sans dire que le lien est parti", async () => {
  const { calls, rows, input, deps } = harness({
    windowOpen: true,
    templateSid: "HXpartage",
    sessionResult: { ok: false, detail: "undelivered 63016" },
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(calls.template, 1);
  assert.equal(rows[0].template_key, "partage_voyage");
  assert.equal(rows[0].status, "sent");
});

test("un 63016 sans modèle est un échec, pas un envoi", async () => {
  const { calls, rows, input, deps } = harness({
    windowOpen: true,
    sessionResult: { ok: false, detail: "failed 63016" },
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "outside_window");
  assert.match(result.message, /refuse un message libre/);
  assert.equal(result.message.includes("Lien envoyé"), false);
  assert.equal(calls.template, 0);
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].twilio_sid, null);
  assert.match(rows[0].error || "", /24 heures/);
});

test("si le modèle est refusé hors fenêtre, l’échec est enregistré et la session ne part pas", async () => {
  const { calls, rows, input, deps } = harness({
    templateSid: "HXpartage",
    templateResult: { ok: false, detail: "https://example.test +33664349810 refused" },
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  assert.equal(calls.session, 0);
  assert.equal(rows[0].status, "failed");
  assert.match(rows[0].error || "", /refused/);
  assert.equal((rows[0].error || "").includes("example.test"), false);
  assert.equal((rows[0].error || "").includes("33664349810"), false);
});

test("un accusé déjà en échec n’affiche pas Lien envoyé", async () => {
  const { input, deps } = harness({
    windowOpen: true,
    readFailed: { error: "Hors des 24 heures. WhatsApp refuse un message libre si la personne n’a pas écrit aujourd’hui. (63016)" },
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /63016/);
  assert.equal(result.message.includes("Lien envoyé"), false);
});

test("un envoi déjà parti ne coupe pas le clic suivant", async () => {
  const { calls, rows, input, deps } = harness({
    windowOpen: true,
    prior: { id: "deja", status: "sent" },
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].dedupe_key, tripShareDedupeKey(BOOKING, COMPANION, tripShareParisDay(NOW)));
});

test("un échec du jour est rejoué sur la même ligne", async () => {
  const { calls, updates, input, deps } = harness({
    windowOpen: true,
    prior: { id: "echec", status: "failed" },
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, true);
  assert.equal(calls.session, 1);
  assert.equal(updates[0]?.id, "echec");
  assert.equal(tripShareAttemptKey(BOOKING, COMPANION, "2026-10-27", { status: "failed" }, NOW).reuse, true);
});

test("sans téléphone, l’échec est noté et Twilio n’est pas appelé", async () => {
  const { calls, rows, input, deps } = harness({ phone: null, to: null });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "no_phone");
  assert.match(tripShareRefusalMessage("no_phone", "client"), /téléphone/);
  assert.equal(calls.session, 0);
  assert.equal(rows[0].status, "failed");
});

test("l’aperçu n’envoie rien", async () => {
  const { calls, rows, input, deps } = harness({ windowOpen: true, previewBlocked: true });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "preview");
  assert.equal(calls.session, 0);
  assert.equal(rows[0].status, "failed");
});

test("le journal en panne empêche l’envoi", async () => {
  const { calls, input, deps } = harness({ windowOpen: true, insertFails: true });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "journal");
  assert.match(result.message, /Rien n’a été envoyé/);
  assert.equal(calls.session, 0);
  assert.equal(calls.template, 0);
});

test("un lien qui ouvre le compte est refusé", async () => {
  const { calls, rows, input, deps } = harness({
    windowOpen: true,
    url: "https://travelba.fr/mon-compte/reservations/x",
  });
  const result = await runTripShareDelivery(input, deps);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "rejected");
  assert.equal(calls.session, 0);
  assert.equal(rows[0].status, "failed");
});

test("le brouillon partage_voyage est un bouton vers le lien public", () => {
  const draft = tripShareContentDrafts()[0];
  const action = draft.create.types["twilio/call-to-action"].actions[0];
  assert.equal(draft.env, "TWILIO_CONTENT_PARTAGE_VOYAGE");
  assert.equal(draft.friendlyName, "partage_voyage");
  assert.equal(draft.create.language, "fr");
  assert.equal(action.title, "Voir le voyage");
  assert.equal(action.url, "https://travelba.fr/v/{{3}}");
  assert.match(draft.create.types["twilio/call-to-action"].body, /Voici le voyage \{\{2\}\}\./);
  assert.equal(draft.create.types["twilio/call-to-action"].body.includes("http"), false);
  assert.equal(draft.create.variables["1"], "Camille");
  assert.equal(draft.create.variables["2"], "Marrakech");
  assert.equal(draft.create.variables["3"], "exemple");
  const variables = tripShareContentVariables(FIRST, TITLE, SHARE_URL);
  assert.equal(variables?.["1"], "Victoria");
  assert.equal(variables?.["3"], "23456789");
  const script = readFileSync(new URL("../../scripts/arm-whatsapp-concierge.ts", import.meta.url), "utf8");
  assert.match(script, /tripShareContentDrafts\(\)/);
});

test("aucun modèle déjà là ne porte le lien public du voyage", () => {
  const raw = JSON.stringify([
    ...conciergeContentDrafts(),
    ...flightNoticeDrafts(),
    ...boardingPassContentDrafts(),
    ...statementContentDrafts(),
  ]);
  assert.equal(raw.includes("travelba.fr/v/"), false);
});

test("l’accusé undelivered 63016 devient un échec en français", () => {
  const failure = whatsappCallbackFailure(
    "undelivered",
    "63016",
    "Failed to send freeform message because you are outside the allowed window to +33664349810"
  );
  assert.match(failure || "", /24 heures/);
  assert.match(failure || "", /63016/);
  assert.equal((failure || "").includes("33664349810"), false);
  assert.equal((failure || "").includes("outside the allowed"), false);
  assert.equal(whatsappCallbackFailure("delivered", "63016"), null);
  assert.match(whatsappFailureSentence(null, "undelivered"), /n’a pas remis/);
});
