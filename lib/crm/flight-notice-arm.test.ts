import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureFlightNoticeSids } from "./flight-notice-arm";
import { flightNoticeDrafts } from "./flight-watch";

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
  const { client, writes } = admin({ day: "2026-09-29", calls: 4, notice_sids: kinds });
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
  assert.equal(resolved.horaire, "HXvol_horaire");
  assert.equal(resolved.arrivee, "HXvol_arrivee");
  assert.equal(calls.filter((call) => call.method === "POST" && !call.url.includes("Approval")).length, 6);
  assert.equal(writes.length, 1);
  const extra = writes[0]?.extra as { day: string; calls: number; notice_sids: Record<string, string> };
  assert.equal(extra.day, "2026-09-29");
  assert.equal(extra.calls, 3);
  assert.equal(extra.notice_sids.annule, undefined);
  assert.equal(extra.notice_sids.horaire, "HXvol_horaire");
  assert.equal(calls.some((call) => call.url.includes("ACtest") || (call.body || "").includes("token")), false);
  restore();
});
