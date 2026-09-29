import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureFlightNoticeSids, sendApprovedFlightSamples } from "./flight-notice-arm";
import { flightNoticeDrafts } from "./flight-watch";
import { whatsappAddress } from "./whatsapp";

const KEYS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "VERCEL_ENV",
  ...flightNoticeDrafts().map((draft) => draft.env),
];

function rememberEnv() {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  return () => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  };
}

function admin(extra: Record<string, unknown> | null) {
  const writes: { op: string; extra: unknown }[] = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: extra ? { id: "row-1", extra } : null }),
              };
            },
          };
        },
        update(patch: { extra: unknown }) {
          writes.push({ op: "update", extra: patch.extra });
          return { eq: async () => ({ error: null }) };
        },
        insert: async (patch: { extra: unknown }) => {
          writes.push({ op: "insert", extra: patch.extra });
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, writes };
}

test("sans Twilio, aucun appel et les SID d’environnement restent vides en preview", async () => {
  const restore = rememberEnv();
  process.env.VERCEL_ENV = "preview";
  process.env.TWILIO_ACCOUNT_SID = "ACpreview";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_CONTENT_VOL_ANNULE = "HXpreview";
  let called = 0;
  const { client, writes } = admin({ day: "2026-09-29", calls: 2 });
  const resolved = await ensureFlightNoticeSids(client, async () => {
    called += 1;
    throw new Error("ne doit pas partir");
  });
  assert.equal(called, 0);
  assert.deepEqual(resolved, {});
  assert.equal(writes.length, 0);
  restore();
});

test("un SID déjà stocké n’est pas recréé, le plafond d’appels reste", async () => {
  const restore = rememberEnv();
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  for (const draft of flightNoticeDrafts()) delete process.env[draft.env];
  const kinds = {
    horaire: "HXh",
    annule: "HXa",
    enregistrement: "HXe",
    retard: "HXr",
    deroute: "HXd",
    envol: "HXv",
    arrivee: "HXi",
  };
  const notice_names = Object.fromEntries(
    flightNoticeDrafts().map((draft) => {
      const kind = {
        TWILIO_CONTENT_VOL_HORAIRE: "horaire",
        TWILIO_CONTENT_VOL_ANNULE: "annule",
        TWILIO_CONTENT_VOL_ENREGISTREMENT: "enregistrement",
        TWILIO_CONTENT_VOL_RETARD: "retard",
        TWILIO_CONTENT_VOL_DEROUTE: "deroute",
        TWILIO_CONTENT_VOL_ENVOL: "envol",
        TWILIO_CONTENT_VOL_ARRIVEE: "arrivee",
      }[draft.env];
      return [kind, draft.friendlyName];
    })
  );
  const { client, writes } = admin({ day: "2026-09-29", calls: 4, notice_sids: kinds, notice_names });
  const resolved = await ensureFlightNoticeSids(client, async () => {
    throw new Error("ne doit pas partir");
  });
  assert.deepEqual(resolved, kinds);
  assert.equal(writes.length, 0);
  restore();
});

test("crée le modèle manquant et garde le budget à côté des SID", async () => {
  const restore = rememberEnv();
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_CONTENT_VOL_ANNULE = "HXenv";
  for (const draft of flightNoticeDrafts()) {
    if (draft.env !== "TWILIO_CONTENT_VOL_ANNULE") delete process.env[draft.env];
  }
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, method: init?.method || "GET", body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("ApprovalRequests")) {
      return new Response(JSON.stringify({ message: "already submitted" }), { status: 409 });
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { friendly_name?: string };
      return new Response(JSON.stringify({ sid: `HX${body.friendly_name}` }), { status: 201 });
    }
    return new Response(JSON.stringify({ contents: [], meta: { next_page_url: null } }), { status: 200 });
  };
  const { client, writes } = admin({ day: "2026-09-29", calls: 3 });
  const resolved = await ensureFlightNoticeSids(client, fetchImpl);
  assert.equal(resolved.annule, "HXenv");
  assert.equal(resolved.horaire, "HXvol_horaire_concierge");
  assert.equal(resolved.arrivee, "HXvol_arrivee_concierge");
  assert.equal(calls.filter((call) => call.method === "POST" && !call.url.includes("Approval")).length, 6);
  assert.equal(writes.length, 1);
  const extra = writes[0]?.extra as { day: string; calls: number; notice_sids: Record<string, string> };
  assert.equal(extra.day, "2026-09-29");
  assert.equal(extra.calls, 3);
  assert.equal(extra.notice_sids.annule, undefined);
  assert.equal(extra.notice_sids.horaire, "HXvol_horaire_concierge");
  assert.equal(calls.some((call) => call.url.includes("ACtest") || (call.body || "").includes("token")), false);
  restore();
});

test("le 07 72 15 82 57 est un mobile français", () => {
  assert.equal(whatsappAddress("0772158257"), "whatsapp:+33772158257");
});

test("un modèle encore en attente n’est pas envoyé", async () => {
  const restore = rememberEnv();
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  let sent = 0;
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ whatsapp: { status: "pending" } }), { status: 200 });
  const { client, writes } = admin({ notice_sids: { annule: "HXannule" }, day: "2026-09-29", calls: 1 });
  await sendApprovedFlightSamples(client, { annule: "HXannule" }, fetchImpl, async () => {
    sent += 1;
    return { ok: true, sid: "SM" };
  });
  assert.equal(sent, 0);
  assert.equal(writes.length, 0);
  restore();
});

test("un modèle approuvé part une fois, avec l’exemple Marrakech, et n’est pas renvoyé", async () => {
  const restore = rememberEnv();
  delete process.env.VERCEL_ENV;
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  const phones: string[] = [];
  const variables: Record<string, string>[] = [];
  let fetches = 0;
  const fetchImpl: typeof fetch = async () => {
    fetches += 1;
    return new Response(JSON.stringify({ whatsapp: { status: "approved" } }), { status: 200 });
  };
  const deliver = async (input: { phone: string | null | undefined; variables: Record<string, string> | null }) => {
    phones.push(input.phone || "");
    if (input.variables) variables.push(input.variables);
    return { ok: true as const, sid: "SM" };
  };
  const { client, writes } = admin({
    day: "2026-09-29",
    calls: 2,
    notice_sids: { arrivee: "HXarrivee", retard: "HXretard" },
  });
  await sendApprovedFlightSamples(
    client,
    { arrivee: "HXarrivee", retard: "HXretard" },
    fetchImpl,
    deliver
  );
  assert.deepEqual(phones, ["0772158257", "0772158257"]);
  assert.equal(variables.some((row) => row["1"] === "à Marrakech"), true);
  assert.equal(variables.some((row) => row["3"] === "14h40"), true);
  assert.equal(writes.length, 1);
  const extra = writes[0]?.extra as {
    day: string;
    calls: number;
    sample_sent: Record<string, string>;
  };
  assert.equal(extra.day, "2026-09-29");
  assert.equal(extra.calls, 2);
  assert.equal(typeof extra.sample_sent.arrivee, "string");
  assert.equal(typeof extra.sample_sent.retard, "string");

  const again = admin({ ...extra });
  let second = 0;
  await sendApprovedFlightSamples(again.client, { arrivee: "HXarrivee", retard: "HXretard" }, async () => {
    second += 1;
    return new Response("{}", { status: 200 });
  }, async () => ({ ok: true, sid: "SM" }));
  assert.equal(second, 0);
  assert.equal(again.writes.length, 0);
  assert.equal(fetches, 2);
  restore();
});
