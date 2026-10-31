import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyJournalInput } from "./agency-log";
import { hotelOptionState } from "./hotel-access";
import { hotelOptionSummary, nextLiveMode, prepareHotelOption, setHotelOption } from "./mcp-hotel-option";
import { McpWriteError } from "./mcp-write";

const CLIENT = "a54166bd-9142-4e3a-af15-0363e924a63c";
const DEMO = "d4e0a000-1111-4111-8111-0000000000de";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const api = {
      select() {
        return api;
      },
      insert(value: Row) {
        op = "insert";
        payload = value;
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      maybeSingle() {
        const rows = apply();
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        return Promise.resolve({ data: apply(), error: null }).then(resolve);
      },
    };
    function apply() {
      if (op === "insert") {
        const row = { ...payload, id: payload.id || `${tables[table].length + 1}` };
        tables[table].push(row);
        return [row];
      }
      const hits = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (op === "update") for (const row of hits) Object.assign(row, payload);
      return hits;
    }
    return api;
  }
  return { from, tables };
}

function customer(extra: Row = {}) {
  return {
    id: CLIENT,
    first_name: "Elad",
    last_name: "Taieb",
    hotel_booking_enabled: false,
    hotel_demo: false,
    hotel_direct_live: false,
    ...extra,
  };
}

function harness(seed: Record<string, Row[]>) {
  const admin = memoryAdmin({
    crm_hotel_button_settings: [{ key: "hotel_button_visibility", value: "authorized" }],
    crm_hotel_access_requests: [],
    crm_hotel_access_events: [],
    crm_audit_events: [],
    ...seed,
  });
  const journal: AgencyJournalInput[] = [];
  const deps = {
    journal: async (entry: AgencyJournalInput) => {
      journal.push(entry);
    },
  };
  return { admin, journal, db: admin as unknown as SupabaseClient, deps };
}

test("prepareHotelOption : id, actif obligatoire, mode_reel facultatif, oui/non acceptés", () => {
  assert.deepEqual(prepareHotelOption({ id: CLIENT, actif: true }), { id: CLIENT, actif: true, modeReel: undefined });
  assert.deepEqual(prepareHotelOption({ id: CLIENT, actif: "oui", mode_reel: "non" }), { id: CLIENT, actif: true, modeReel: false });
  assert.deepEqual(prepareHotelOption({ client_id: CLIENT, actif: "false" }), { id: CLIENT, actif: false, modeReel: undefined });
  assert.throws(() => prepareHotelOption({ id: "abc", actif: true }), /Client invalide/);
  assert.throws(() => prepareHotelOption({ id: CLIENT }), /Indiquez actif/);
  assert.throws(() => prepareHotelOption({ id: CLIENT, actif: "peut-être" }), /oui ou non/);
  assert.throws(() => prepareHotelOption({ id: CLIENT, actif: false, mode_reel: true }), /suppose l’option active/);
});

test("le mode réel ne s’ouvre que sur demande et se ferme avec l’option", () => {
  assert.equal(nextLiveMode({ id: CLIENT, actif: true, modeReel: undefined }, false), false);
  assert.equal(nextLiveMode({ id: CLIENT, actif: true, modeReel: undefined }, true), true);
  assert.equal(nextLiveMode({ id: CLIENT, actif: true, modeReel: true }, false), true);
  assert.equal(nextLiveMode({ id: CLIENT, actif: true, modeReel: false }, true), false);
  assert.equal(nextLiveMode({ id: CLIENT, actif: false, modeReel: undefined }, true), false);
});

test("hotelOptionState : la fiche dit active, mode, bouton et demande", () => {
  assert.deepEqual(hotelOptionState({ customer: customer(), visibility: "authorized", pending: false }), {
    active: false,
    mode: "test",
    demo: false,
    bouton_visible: false,
    demande_en_attente: false,
  });
  assert.deepEqual(
    hotelOptionState({ customer: customer({ hotel_booking_enabled: true, hotel_direct_live: true }), visibility: "authorized", pending: false }),
    { active: true, mode: "reel", demo: false, bouton_visible: true, demande_en_attente: false }
  );
  const platinum = hotelOptionState({ customer: customer(), visibility: "everyone", pending: true });
  assert.equal(platinum.active, false);
  assert.equal(platinum.bouton_visible, true);
  assert.equal(platinum.demande_en_attente, true);
  assert.equal(hotelOptionState({ customer: null, visibility: "authorized", pending: false }).active, false);
});

test("activer : la fiche passe en mode test, l’événement, la fiche et le journal d’agence sont écrits au nom du jeton", async () => {
  const { admin, journal, db, deps } = harness({ crm_customers: [customer()] });
  const result = await setHotelOption({ id: CLIENT, actif: true }, db, deps);
  assert.equal(result.inchange, false);
  assert.equal(result.client, "Elad Taieb");
  assert.deepEqual(result.avant, { active: false, mode: "test" });
  assert.deepEqual(result.option_hotel, { active: true, mode: "test", demo: false, bouton_visible: true, demande_en_attente: false });
  assert.equal(result.notifie, false);
  const row = admin.tables.crm_customers[0];
  assert.equal(row.hotel_booking_enabled, true);
  assert.equal(row.hotel_direct_live, false);
  assert.deepEqual(
    admin.tables.crm_hotel_access_events.map((event) => ({ enabled: event.enabled, live: event.live_mode, staff: event.staff_id })),
    [{ enabled: true, live: false, staff: null }]
  );
  const audit = admin.tables.crm_audit_events[0];
  assert.equal(audit.action, "option_hotel");
  assert.equal(audit.customer_id, CLIENT);
  assert.equal(audit.source, "mcp");
  assert.match(String(audit.summary), /Option Hôtels activée \(mode test\) pour Elad Taieb par le connecteur mcp\./);
  assert.equal(journal.length, 1);
  assert.equal(journal[0].staffId, null);
  assert.equal(journal[0].action, "update");
  assert.equal(journal[0].entityType, "client");
  assert.equal(journal[0].entityId, CLIENT);
  assert.equal(journal[0].path, "/api/mcp");
  assert.deepEqual(journal[0].diff, { avant: { active: false, mode: "test" }, apres: { active: true, mode: "test" } });
});

test("mode_reel ouvre les envois réels, désactiver les éteint", async () => {
  const { admin, journal, db, deps } = harness({ crm_customers: [customer({ hotel_booking_enabled: true })] });
  const live = await setHotelOption({ id: CLIENT, actif: true, mode_reel: true }, db, deps);
  assert.equal(live.option_hotel.mode, "reel");
  assert.equal(admin.tables.crm_customers[0].hotel_direct_live, true);
  assert.match(journal[0].summary, /mode reel/);
  const off = await setHotelOption({ id: CLIENT, actif: false }, db, deps);
  assert.equal(off.option_hotel.active, false);
  assert.equal(off.option_hotel.mode, "test");
  assert.equal(off.option_hotel.bouton_visible, false);
  assert.equal(admin.tables.crm_customers[0].hotel_booking_enabled, false);
  assert.equal(admin.tables.crm_customers[0].hotel_direct_live, false);
  assert.match(journal[1].summary, /désactivée pour Elad Taieb/);
  assert.equal(admin.tables.crm_hotel_access_events.length, 2);
});

test("sans changement, rien n’est écrit ; le mode enregistré reste quand mode_reel est omis", async () => {
  const { admin, journal, db, deps } = harness({
    crm_customers: [customer({ hotel_booking_enabled: true, hotel_direct_live: true })],
  });
  const same = await setHotelOption({ id: CLIENT, actif: true }, db, deps);
  assert.equal(same.inchange, true);
  assert.equal(same.option_hotel.mode, "reel");
  assert.equal(admin.tables.crm_hotel_access_events.length, 0);
  assert.equal(admin.tables.crm_audit_events.length, 0);
  assert.equal(journal.length, 0);
});

test("compte de démonstration : le mode réel est refusé, l’activation reste en test", async () => {
  const { admin, db, deps } = harness({ crm_customers: [customer({ id: DEMO, hotel_demo: true })] });
  await assert.rejects(setHotelOption({ id: DEMO, actif: true, mode_reel: true }, db, deps), /démonstration/);
  const on = await setHotelOption({ id: DEMO, actif: true }, db, deps);
  assert.equal(on.option_hotel.demo, true);
  assert.equal(on.option_hotel.mode, "test");
  assert.equal(admin.tables.crm_customers[0].hotel_direct_live, false);
});

test("client introuvable", async () => {
  const { db, deps } = harness({ crm_customers: [] });
  await assert.rejects(setHotelOption({ id: CLIENT, actif: true }, db, deps), (err: unknown) => {
    assert.ok(err instanceof McpWriteError);
    assert.match(err.message, /introuvable/);
    return true;
  });
});

test("le résumé du journal nomme le client, l’état et le jeton", () => {
  assert.equal(
    hotelOptionSummary({ client: "Elad Taieb", active: true, mode: "test", actor: "grok" }),
    "Option Hôtels activée (mode test) pour Elad Taieb par le connecteur grok."
  );
  assert.equal(
    hotelOptionSummary({ client: "Elad Taieb", active: false, mode: "test", actor: "mcp" }),
    "Option Hôtels désactivée pour Elad Taieb par le connecteur mcp."
  );
});
