import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendClosedWindowReply } from "./whatsapp-admin-reply";
import { memoryContentSidStore } from "./whatsapp-content-sid-store";

const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SID = "HXdddddddddddddddddddddddddddddddd";
const STAFF = "staff-raphael";

function fakeCrm(extra?: { optOut?: boolean; inbound?: boolean }) {
  const tables: Record<string, Record<string, unknown>[]> = {
    crm_bookings: [{ id: BOOKING, reference: "TB-2026-0124", customer_id: CLIENT }],
    crm_customers: [
      {
        id: CLIENT,
        first_name: "David Alexis",
        phone: "+33612345678",
        whatsapp_opt_in_at: "2026-01-01T00:00:00Z",
        whatsapp_opt_out_at: extra?.optOut ? "2026-02-01T00:00:00Z" : null,
      },
    ],
    crm_whatsapp_messages: extra?.inbound
      ? [{ id: "in-1", customer_id: CLIENT, direction: "inbound", created_at: new Date().toISOString(), phone: "+33612345678" }]
      : [],
    crm_whatsapp_threads: [],
  };
  const sends: { kind: string; variables?: Record<string, string>; body?: string }[] = [];
  const external: string[] = [];

  function from(table: string) {
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    let op = "select";
    let payload: Record<string, unknown> = {};
    const api = {
      select() {
        return api;
      },
      insert(value: Record<string, unknown>) {
        op = "insert";
        payload = value;
        const row = { id: `${table}-${(tables[table] || []).length + 1}`, ...value };
        (tables[table] || (tables[table] = [])).push(row);
        return api;
      },
      upsert(value: Record<string, unknown>) {
        (tables[table] || (tables[table] = [])).push(value);
        return Promise.resolve({ error: null });
      },
      update(value: Record<string, unknown>) {
        op = "update";
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      gte(column: string, value: unknown) {
        filters.push((row) => String(row[column] ?? "") >= String(value));
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(one());
      },
      then(resolve: (value: { data: unknown; error: null }) => void) {
        resolve(finish());
      },
    };
    function matching() {
      return (tables[table] || []).filter((row) => filters.every((keep) => keep(row)));
    }
    function finish() {
      if (op === "update") {
        for (const row of matching()) Object.assign(row, payload);
        return { data: null, error: null };
      }
      if (op === "insert") {
        const row = (tables[table] || []).at(-1) || null;
        return { data: row, error: null };
      }
      return { data: matching(), error: null };
    }
    function one() {
      const result = finish();
      const data = Array.isArray(result.data) ? result.data[0] || null : result.data;
      return { data, error: null };
    }
    return api;
  }

  return {
    admin: { from } as unknown as SupabaseClient,
    tables,
    sends,
    deps() {
      return {
        now: new Date("2026-11-14T18:00:00Z"),
        store: memoryContentSidStore({ TWILIO_CONTENT_MESSAGE_LIBRE_TEXTE: SID }),
        approved: async () => true,
        fetchImpl: async (input: RequestInfo | URL) => {
          external.push(String(input));
          throw new Error("Twilio ne doit pas être appelé");
        },
        sendTemplate: async (message: { phone: string; contentSid: string; variables: Record<string, string> }) => {
          sends.push({ kind: "modele", variables: message.variables });
          return { ok: true as const, sid: "SMmock" };
        },
        sendSession: async (message: { to: string; body: string }) => {
          sends.push({ kind: "session", body: message.body });
          return { ok: true as const, sid: "SMsession" };
        },
      };
    },
    external,
  };
}

test("hors fenêtre, sans confirmer, rien ne part et l’aperçu est le modèle", async () => {
  const crm = fakeCrm();
  const preview = await sendClosedWindowReply(
    {
      customerId: CLIENT,
      text: "Il y a bien le vip fast track pour l’aller et le retour.",
      confirmer: false,
      staffId: STAFF,
    },
    crm.admin,
    crm.deps()
  );
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.apercu, true);
  assert.equal(preview.envoye, false);
  assert.equal(preview.modele, "message_libre_texte");
  assert.match(String(preview.texte), /Bonjour David/);
  assert.match(String(preview.texte), /vip fast track/);
  assert.match(String(preview.texte), /Le Concierge/);
  assert.equal(crm.sends.length, 0);
  assert.equal(crm.external.length, 0);
  assert.equal(crm.tables.crm_whatsapp_messages.length, 0);
});

test("hors fenêtre, confirmer envoie message_libre_texte et le journal nomme l’agence", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  try {
    const crm = fakeCrm();
    const sent = await sendClosedWindowReply(
      {
        customerId: CLIENT,
        bookingId: BOOKING,
        text: "Il y a bien le vip fast track pour l’aller et le retour.",
        confirmer: true,
        staffId: STAFF,
      },
      crm.admin,
      crm.deps()
    );
    assert.equal(sent.ok, true);
    if (!sent.ok) return;
    assert.equal(sent.envoye, true);
    assert.equal(sent.modele, "message_libre_texte");
    assert.equal(crm.sends.length, 1);
    assert.equal(crm.sends[0].kind, "modele");
    assert.equal(crm.sends[0].variables?.["1"], "David");
    assert.match(crm.sends[0].variables?.["2"] || "", /vip fast track/);
    assert.equal(crm.external.length, 0);
    const journal = crm.tables.crm_whatsapp_messages.find((row) => row.direction === "outbound");
    assert.equal(journal?.template_key, "message_libre_texte");
    assert.equal(journal?.author_staff_id, STAFF);
    assert.equal(journal?.customer_id, CLIENT);
    assert.equal(journal?.booking_id, BOOKING);
    assert.equal(journal?.status, "sent");
    assert.match(String(journal?.body), /Bonjour David/);
    assert.equal(JSON.stringify(journal?.payload), '{"actor":"agence"}');
    assert.equal(JSON.stringify(sent).includes(SID), false);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("hors fenêtre, un refus WhatsApp ou un numéro de pièce n’envoie rien", async () => {
  const previous = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  try {
    const optedOut = fakeCrm({ optOut: true });
    const refused = await sendClosedWindowReply(
      { customerId: CLIENT, text: "Bonjour, je reviens vers vous.", confirmer: true, staffId: STAFF },
      optedOut.admin,
      optedOut.deps()
    );
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.match(refused.error, /pas accepté/);
    assert.equal(optedOut.sends.length, 0);

    const passport = fakeCrm();
    const blocked = await sendClosedWindowReply(
      { customerId: CLIENT, text: "Votre passeport AB345678 est prêt.", confirmer: true, staffId: STAFF },
      passport.admin,
      passport.deps()
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.match(blocked.error, /numéro de pièce/);
    assert.equal(passport.sends.length, 0);
    assert.equal(passport.external.length, 0);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
