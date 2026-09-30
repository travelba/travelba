import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogSamples, sampleMediaUrl, sendCatalogSamples } from "./whatsapp-samples";

function admin(extra: Record<string, unknown> | null) {
  const writes: unknown[] = [];
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: extra ? { id: "row", extra } : null }) };
            },
          };
        },
        update(patch: { extra: unknown }) {
          writes.push(patch.extra);
          return { eq: async () => ({ error: null }) };
        },
        upsert(patch: { extra: unknown }) {
          writes.push(patch.extra);
          return Promise.resolve({ error: null });
        },
        insert: async (patch: { extra: unknown }) => {
          writes.push(patch.extra);
          return { error: null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, writes };
}

test("le récapitulatif contient chaque message, y compris ceux encore sans envoi", () => {
  const samples = catalogSamples();
  assert.ok(samples.some((sample) => sample.id === "piece-hotel" && sample.image?.endsWith("/whatsapp/hotel.jpg")));
  assert.ok(samples.some((sample) => sample.id === "vol-horaire"));
  assert.ok(samples.some((sample) => sample.id === "rappel-modele"));
  assert.equal(sampleMediaUrl("/whatsapp/visa.jpg"), "https://travelba.fr/whatsapp/visa.jpg");
  assert.equal(sampleMediaUrl("https://exemple.fr/photo.jpg"), null);
});

test("sans image en ligne, aucun message ne part", async () => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
  delete process.env.VERCEL_ENV;
  const { client, writes } = admin(null);
  let calls = 0;
  const result = await sendCatalogSamples(
    client,
    async () => new Response(null, { status: 404 }),
    async () => {
      calls += 1;
      return { ok: true, sid: "SM1" };
    }
  );
  assert.equal(result.skipped, "images_offline");
  assert.equal(calls, 0);
  assert.equal(writes.length, 0);
});

test("une fois les images en ligne, chaque exemplaire part une seule fois", async () => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
  delete process.env.VERCEL_ENV;
  const phones: string[] = [];
  const { client, writes } = admin(null);
  const result = await sendCatalogSamples(
    client,
    async () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } }),
    async (input) => {
      phones.push(input.to);
      return { ok: true, sid: "SM1" };
    }
  );
  assert.equal(result.skipped, null);
  assert.equal(result.delivered, catalogSamples().length);
  assert.ok(phones.every((phone) => phone === "whatsapp:+33772158257"));
  const again = admin({
    done_at: "2026-09-30T00:00:00.000Z",
    sent: Object.fromEntries(catalogSamples().map((sample) => [sample.id, "session"])),
  });
  let calls = 0;
  const second = await sendCatalogSamples(
    again.client,
    async () => {
      calls += 1;
      return new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } });
    },
    async () => ({ ok: true, sid: "SM2" })
  );
  assert.equal(second.skipped, "done");
  assert.equal(calls, 0);
  assert.equal(writes.length, catalogSamples().length);
  const last = writes.at(-1) as { done_at?: string };
  assert.equal(typeof last.done_at, "string");
});

test("si rien n’est arrivé sur le téléphone, le modèle approuvé part", async () => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "token";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+33756841315";
  process.env.TWILIO_CONTENT_CONNEXION = "HXconnexion";
  process.env.TWILIO_CONTENT_PIECE_HOTEL = "HXhotel";
  delete process.env.VERCEL_ENV;
  const { client } = admin({ hold: true, sent: { connexion: "hold" } });
  let sessions = 0;
  const templates: string[] = [];
  const result = await sendCatalogSamples(
    client,
    async () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg" } }),
    async () => {
      sessions += 1;
      return { ok: true, sid: "SM1" };
    },
    async (input) => {
      templates.push(input.contentSid);
      return { ok: true, sid: "SM2" };
    },
    async () => ({ total: 50, delivered: 5, errors: ["63016"], statuses: { read: 5, undelivered: 45 } })
  );
  assert.equal(sessions, 0);
  assert.ok(templates.includes("HXconnexion"));
  assert.ok(templates.includes("HXhotel"));
  assert.ok((result.delivered ?? 0) >= 1);
});
