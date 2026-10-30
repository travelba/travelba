import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESTAURANT_ALLOWED_BOOKINGS_ENV,
  RESTAURANT_ALLOWLIST_BLOCK,
  parseRestaurantAllowlist,
  restaurantAllowlist,
  restaurantBookingAllowed,
  restaurantSendGate,
} from "./restaurant-allowlist";
import { sendBlockReason } from "./restaurant-desk";
import { planRestaurantCron, type DeskEvening } from "./restaurants";
import { restaurantAcceptAck, restaurantPlaceLink, RESTAURANT_PLACE_PREFIX } from "./restaurant-whatsapp";
import { deauvillePhones } from "./deauville-preview";
import { restaurantConfirmationKey, sendRestaurantAcceptConfirmation } from "./restaurants-run";

const NICE = "TB-2026-0075";

function withEnv(value: string | undefined, run: () => void | Promise<void>) {
  const before = process.env[RESTAURANT_ALLOWED_BOOKINGS_ENV];
  if (value === undefined) delete process.env[RESTAURANT_ALLOWED_BOOKINGS_ENV];
  else process.env[RESTAURANT_ALLOWED_BOOKINGS_ENV] = value;
  const restore = () => {
    if (before === undefined) delete process.env[RESTAURANT_ALLOWED_BOOKINGS_ENV];
    else process.env[RESTAURANT_ALLOWED_BOOKINGS_ENV] = before;
  };
  const out = run();
  if (out && typeof (out as Promise<void>).then === "function") return (out as Promise<void>).finally(restore);
  restore();
  return out;
}

test("la liste d’essai se lit dans la variable : références, virgules, casse et espaces indifférents", () => {
  assert.deepEqual([...parseRestaurantAllowlist("TB-2026-0075")], [NICE]);
  assert.deepEqual([...parseRestaurantAllowlist(" tb-2026-0075 , TB-2026-0080;TB-2026-0081 ")], [NICE, "TB-2026-0080", "TB-2026-0081"]);
  assert.equal(parseRestaurantAllowlist("").size, 0);
  assert.equal(parseRestaurantAllowlist("  ,  ").size, 0);
  assert.equal(parseRestaurantAllowlist(undefined).size, 0);
  assert.equal(parseRestaurantAllowlist(null).size, 0);
});

test("fermé par défaut : variable absente ou vide, aucun dossier n’est autorisé", () => {
  withEnv(undefined, () => {
    assert.equal(restaurantAllowlist().size, 0);
    assert.equal(restaurantBookingAllowed(NICE), false);
    assert.equal(restaurantBookingAllowed("TB-2026-0001"), false);
  });
  withEnv("", () => {
    assert.equal(restaurantBookingAllowed(NICE), false);
  });
  withEnv("   ", () => {
    assert.equal(restaurantBookingAllowed(NICE), false);
  });
});

test("un dossier de la liste passe, les autres non, la référence vide jamais", () => {
  withEnv("TB-2026-0075", () => {
    assert.equal(restaurantBookingAllowed(NICE), true);
    assert.equal(restaurantBookingAllowed("tb-2026-0075"), true);
    assert.equal(restaurantBookingAllowed("TB-2026-0076"), false);
    assert.equal(restaurantBookingAllowed(""), false);
    assert.equal(restaurantBookingAllowed(null), false);
    assert.equal(restaurantBookingAllowed(undefined), false);
  });
  const explicit = parseRestaurantAllowlist("TB-2026-0075,TB-2026-0099");
  assert.equal(restaurantBookingAllowed("TB-2026-0099", explicit), true);
  assert.equal(restaurantBookingAllowed("TB-2026-0075", new Set()), false);
});

test("la porte d’envoi : liste pour un vrai client, numéro de test seul pour une donnée de test", () => {
  const list = parseRestaurantAllowlist(NICE);
  const testPhone = "+33600000000";
  assert.deepEqual(restaurantSendGate({ reference: NICE, test: false, phone: "+33611111111", testPhone }, list), { ok: true });
  assert.deepEqual(restaurantSendGate({ reference: "TB-2026-0001", test: false, phone: "+33611111111", testPhone }, list), {
    ok: false,
    reason: RESTAURANT_ALLOWLIST_BLOCK,
  });
  assert.equal(restaurantSendGate({ reference: NICE, test: false, phone: "+33611111111", testPhone }, new Set()).ok, false);
  assert.deepEqual(restaurantSendGate({ reference: "TEST-BENJAMIN", test: true, phone: testPhone, testPhone }, new Set()), { ok: true });
  assert.equal(restaurantSendGate({ reference: "TEST-BENJAMIN", test: true, phone: "+33611111111", testPhone }, new Set()).ok, false);
  assert.equal(restaurantSendGate({ reference: "TEST-BENJAMIN", test: true, phone: "+33611111111", testPhone: null }, list).ok, false);
  assert.equal(restaurantSendGate({ reference: NICE, test: true, phone: "+33611111111", testPhone }, list).ok, false);
});

function desk(partial: Partial<DeskEvening> = {}): DeskEvening {
  return {
    bookingId: "booking-1",
    eveningDate: "2026-01-15",
    timezone: "Europe/Paris",
    choice: null,
    messageStatus: "aucun",
    closed: false,
    canWhatsapp: true,
    tables: [
      { seat: "A", status: "reservee", restaurantName: "Ostuni" },
      { seat: "B", status: "reservee", restaurantName: "Da Vittorio" },
    ],
    ...partial,
  };
}

test("le plan du cron ignore un soir hors liste : ni envoi à 16 h, ni clôture à 18 h", () => {
  const at16 = new Date("2026-01-15T15:00:00.000Z");
  const at18 = new Date("2026-01-15T17:05:00.000Z");
  const open = planRestaurantCron([desk({ allowed: true }), desk({ bookingId: "booking-2", allowed: false })], at16, true);
  assert.deepEqual(
    open.sends.map((send) => send.bookingId),
    ["booking-1", "booking-1", "booking-1"]
  );
  const close = planRestaurantCron([desk({ allowed: true }), desk({ bookingId: "booking-2", allowed: false })], at18, true);
  assert.deepEqual(
    close.closes.map((row) => row.bookingId),
    ["booking-1"]
  );
  const legacy = planRestaurantCron([desk()], at16, true);
  assert.equal(legacy.sends.length, 3);
});

test("l’écran Restaurants du soir éteint Envoyer au client hors liste, sauf en mode test", () => {
  const base = { gaps: [], templatesReady: true, test: false, testPhone: false, alreadySent: false, hasClientPhone: true };
  assert.equal(sendBlockReason({ ...base, allowed: false }), RESTAURANT_ALLOWLIST_BLOCK);
  assert.equal(sendBlockReason({ ...base, allowed: true }), null);
  assert.equal(sendBlockReason({ ...base, allowed: false, alreadySent: true }), RESTAURANT_ALLOWLIST_BLOCK);
  assert.equal(sendBlockReason({ ...base, allowed: false, test: true, testPhone: true }), null);
});

const RESTAURANT_A = "11111111-1111-4111-8111-111111111111";
const RESTAURANT_B = "33333333-3333-4333-8333-333333333333";

test("la confirmation dit le restaurant, la date, 20h30, 2 personnes et le lien de l’adresse ; l’aperçu rend le même texte", () => {
  const ack = restaurantAcceptAck({
    greeting: "Monsieur Boukris",
    restaurant: "Le Drakkar",
    eveningDate: "2026-10-30",
    timeLabel: "20h30",
    other: "Le Deauville",
    placeUrl: restaurantPlaceLink(RESTAURANT_A),
  });
  assert.match(ack, /Monsieur Boukris/);
  assert.match(ack, /Le Drakkar/);
  assert.match(ack, /vendredi 30 octobre/);
  assert.match(ack, /20h30/);
  assert.match(ack, /2 personnes/);
  assert.match(ack, /Nous annulons la table chez Le Deauville/);
  assert.match(ack, new RegExp(`Adresse : ${RESTAURANT_PLACE_PREFIX.replace(/[./]/g, "\\$&")}${RESTAURANT_A}`));
  assert.match(ack, /La Conciergerie Travel BA/);
  const alone = restaurantAcceptAck({ greeting: "Madame Morel", restaurant: "Ostuni", eveningDate: "2026-06-02", timeLabel: "", other: "" });
  assert.doesNotMatch(alone, /annulons/);
  assert.doesNotMatch(alone, /Adresse/);
  assert.match(alone, /20h30/);
  assert.equal(restaurantPlaceLink("pas-un-uuid"), "");
  const preview = deauvillePhones().find((phone) => phone.id === "accepte");
  const bubble = preview?.blocks.find((block) => block.kind === "text" && block.from === "agence");
  assert.ok(bubble && bubble.kind === "text");
  assert.match(bubble.text, /2 personnes/);
  assert.match(bubble.text, /Adresse : https:\/\/travelba\.fr\/api\/r\//);
});

type Row = Record<string, unknown>;

/**
 * Faux PostgREST en mémoire : select/eq/in/maybeSingle, insert/update/upsert,
 * index unique sur dedupe_key (23505) comme en base.
 */
function memoryDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const writes: { table: string; op: string; payload: Row }[] = [];
  function from(table: string) {
    const rows = (tables[table] ||= []);
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row | null = null;
    let single = false;
    const filters: ((row: Row) => boolean)[] = [];
    const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const run = () => {
      if (op === "select") {
        const found = matching();
        return { data: single ? (found[0] ?? null) : found, error: null };
      }
      if (op === "insert") {
        const row = payload as Row;
        writes.push({ table, op, payload: row });
        if (row.dedupe_key && rows.some((item) => item.dedupe_key === row.dedupe_key)) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        const stored = { id: `${table}-${rows.length + 1}`, ...row };
        rows.push(stored);
        return { data: [stored], error: null };
      }
      if (op === "upsert") {
        const row = payload as Row;
        writes.push({ table, op, payload: row });
        const index = row.dedupe_key ? rows.findIndex((item) => item.dedupe_key === row.dedupe_key) : -1;
        if (index >= 0) rows[index] = { ...rows[index], ...row };
        else rows.push({ id: `${table}-${rows.length + 1}`, ...row });
        return { data: null, error: null };
      }
      const touched = matching();
      writes.push({ table, op, payload: payload as Row });
      for (const row of touched) Object.assign(row, payload);
      return { data: touched, error: null };
    };
    const builder: Record<string, unknown> = {
      select() {
        return builder;
      },
      insert(row: Row) {
        op = "insert";
        payload = row;
        return builder;
      },
      update(row: Row) {
        op = "update";
        payload = row;
        return builder;
      },
      upsert(row: Row) {
        op = "upsert";
        payload = row;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then(onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) {
        return Promise.resolve(run()).then(onOk, onErr);
      },
    };
    return builder;
  }
  return { db: { from } as unknown as SupabaseClient, tables, writes };
}

const BOOKING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TABLE_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TABLE_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function seed(overrides: { reference?: string; is_test?: boolean; phone?: string | null } = {}) {
  return {
    crm_bookings: [{ id: BOOKING, reference: overrides.reference ?? NICE, customer_id: CUSTOMER, is_test: overrides.is_test ?? false }],
    crm_customers: [
      {
        id: CUSTOMER,
        first_name: "Camille",
        last_name: "Morel",
        sex: "F",
        phone: overrides.phone === undefined ? "+33611111111" : overrides.phone,
        whatsapp_opt_out_at: null,
      },
    ],
    crm_restaurant_tables: [
      { id: TABLE_A, booking_id: BOOKING, evening_date: "2026-10-30", seat: "A", restaurant_id: RESTAURANT_A, time_local: "20:30:00", status: "choisie", is_test: overrides.is_test ?? false },
      { id: TABLE_B, booking_id: BOOKING, evening_date: "2026-10-30", seat: "B", restaurant_id: RESTAURANT_B, time_local: "20:30:00", status: "a_annuler", is_test: overrides.is_test ?? false },
    ],
    crm_restaurants: [
      { id: RESTAURANT_A, name: "Le Drakkar" },
      { id: RESTAURANT_B, name: "Le Deauville" },
    ],
    crm_restaurant_messages: [] as Row[],
    crm_whatsapp_messages: [] as Row[],
  };
}

function sender() {
  const calls: { to: string; body: string }[] = [];
  const send = async (input: { to: string; body: string }) => {
    calls.push(input);
    return { ok: true as const, sid: `SM${calls.length}` };
  };
  return { calls, send };
}

test("liste vide : « J’accepte » n’envoie aucune confirmation et n’écrit aucun message", async () => {
  await withEnv(undefined, async () => {
    const { db, tables } = memoryDb(seed());
    const twilio = sender();
    const result = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
    assert.deepEqual(result, { ok: false, reason: RESTAURANT_ALLOWLIST_BLOCK });
    assert.equal(twilio.calls.length, 0);
    assert.equal(tables.crm_restaurant_messages.length, 0);
    assert.equal(tables.crm_whatsapp_messages.length, 0);
  });
});

test("dossier hors liste : rien ne part, même avec un numéro et une table acceptée", async () => {
  await withEnv(NICE, async () => {
    const { db, tables } = memoryDb(seed({ reference: "TB-2026-0001" }));
    const twilio = sender();
    const result = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
    assert.equal(result.ok, false);
    assert.equal(twilio.calls.length, 0);
    assert.equal(tables.crm_whatsapp_messages.length, 0);
  });
});

test("dossier de la liste : la confirmation part une fois en message libre, est journalisée, et ne repart pas", async () => {
  await withEnv(` ${NICE.toLowerCase()} `, async () => {
    const { db, tables } = memoryDb(seed());
    const twilio = sender();
    const first = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
    assert.deepEqual(first, { ok: true, sid: "SM1" });
    assert.equal(twilio.calls.length, 1);
    assert.equal(twilio.calls[0].to, "whatsapp:+33611111111");
    const body = twilio.calls[0].body;
    assert.match(body, /Madame Morel/);
    assert.match(body, /Le Drakkar/);
    assert.match(body, /vendredi 30 octobre/);
    assert.match(body, /20h30/);
    assert.match(body, /2 personnes/);
    assert.match(body, /Nous annulons la table chez Le Deauville/);
    assert.match(body, new RegExp(`Adresse : https://travelba\\.fr/api/r/${RESTAURANT_A}`));
    const key = restaurantConfirmationKey(BOOKING, "2026-10-30", TABLE_A);
    const logged = tables.crm_restaurant_messages.filter((row) => row.dedupe_key === key);
    assert.equal(logged.length, 1);
    assert.equal(logged[0].status, "envoye");
    assert.equal(logged[0].twilio_sid, "SM1");
    assert.equal(logged[0].direction, "outbound");
    assert.equal(logged[0].table_id, TABLE_A);
    assert.equal(logged[0].part, undefined);
    const mirror = tables.crm_whatsapp_messages.filter((row) => row.dedupe_key === key);
    assert.equal(mirror.length, 1);
    assert.equal(mirror[0].booking_id, BOOKING);
    assert.equal(mirror[0].customer_id, CUSTOMER);
    assert.equal(mirror[0].template_key, "restaurant_confirmation");
    assert.equal(mirror[0].status, "sent");
    assert.equal(mirror[0].body, body);

    const second = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
    assert.deepEqual(second, { ok: true, sid: null, skipped: "deja_envoye" });
    assert.equal(twilio.calls.length, 1);
    assert.equal(tables.crm_restaurant_messages.length, 1);
    assert.equal(tables.crm_whatsapp_messages.length, 1);

    const otherTable = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "B", tableId: TABLE_B, sender: twilio.send });
    assert.equal(otherTable.ok, true);
    assert.equal(twilio.calls.length, 2);
    assert.notEqual(restaurantConfirmationKey(BOOKING, "2026-10-30", TABLE_B), key);
  });
});

test("une réponse Twilio refusée laisse une ligne en échec, visible dans le dossier, sans second envoi concurrent", async () => {
  await withEnv(NICE, async () => {
    const { db, tables } = memoryDb(seed());
    let calls = 0;
    const failing = async () => {
      calls += 1;
      return { ok: false as const, detail: "63016" };
    };
    const result = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: failing });
    assert.equal(result.ok, false);
    assert.equal(calls, 1);
    assert.equal(tables.crm_restaurant_messages[0].status, "echec");
    assert.equal(tables.crm_whatsapp_messages[0].status, "failed");
    assert.match(String(tables.crm_whatsapp_messages[0].error), /24 h/);
  });
});

test("donnée de test : la confirmation va au numéro de test, jamais au client, et sans numéro de test rien ne part", async () => {
  const beforePhone = process.env.RESTAURANT_TEST_PHONE;
  try {
    process.env.RESTAURANT_TEST_PHONE = "+33600000000";
    await withEnv(undefined, async () => {
      const { db } = memoryDb(seed({ reference: "TEST-BENJAMIN", is_test: true, phone: "+33611111111" }));
      const twilio = sender();
      const result = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
      assert.equal(result.ok, true);
      assert.equal(twilio.calls.length, 1);
      assert.equal(twilio.calls[0].to, "whatsapp:+33600000000");
    });
    delete process.env.RESTAURANT_TEST_PHONE;
    await withEnv(NICE, async () => {
      const { db, tables } = memoryDb(seed({ reference: "TEST-BENJAMIN", is_test: true, phone: "+33611111111" }));
      const twilio = sender();
      const result = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
      assert.equal(result.ok, false);
      assert.equal(twilio.calls.length, 0);
      assert.equal(tables.crm_whatsapp_messages.length, 0);
    });
  } finally {
    if (beforePhone === undefined) delete process.env.RESTAURANT_TEST_PHONE;
    else process.env.RESTAURANT_TEST_PHONE = beforePhone;
  }
});

test("sans numéro WhatsApp ou avec opt-out, la confirmation ne part pas", async () => {
  await withEnv(NICE, async () => {
    const { db } = memoryDb(seed({ phone: null }));
    const twilio = sender();
    const result = await sendRestaurantAcceptConfirmation(db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
    assert.equal(result.ok, false);
    assert.equal(twilio.calls.length, 0);
    const optOut = memoryDb(seed());
    optOut.tables.crm_customers[0].whatsapp_opt_out_at = "2026-01-01T00:00:00.000Z";
    const refused = await sendRestaurantAcceptConfirmation(optOut.db, { bookingId: BOOKING, date: "2026-10-30", seat: "A", tableId: TABLE_A, sender: twilio.send });
    assert.equal(refused.ok, false);
    assert.equal(twilio.calls.length, 0);
  });
});
