import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moveHotelCourrier, planHotelCourrierMove, type HotelMailMoveCard, type HotelMailMoveMessage, type HotelMailMoveRequest } from "./hotel-courrier-move";
import { McpWriteError } from "./mcp-write";

const DOSSIER = "01481481-0148-4148-8148-014814814814";
const SAIGON = "6f30388b-6f30-4388-8f30-6f30388b6f30";
const PHU = "8fbc496a-8fbc-4496-8fbc-8fbc496a8fbc";
const OTHER = "99999999-9999-4999-8999-999999999999";
const MESSAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEIGHBOR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LETTER_SAIGON = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LETTER_PHU = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const RECEIPT = "Dear team, the full payment of VND 346,595,760 has been successfully received.";

function card(id: string, name: string, bookingId = DOSSIER): HotelMailMoveCard {
  return { id, bookingId, kind: "hotel", name };
}

function message(patch: Partial<HotelMailMoveMessage> = {}): HotelMailMoveMessage {
  return {
    id: MESSAGE,
    bookingId: DOSSIER,
    bookingItemId: SAIGON,
    gmailThreadId: "thread-phu",
    subject: "Park Hyatt Phu Quoc - payment received",
    body: RECEIPT,
    receivedAt: "2026-11-19T04:18:00.000Z",
    direction: "in",
    requestId: LETTER_SAIGON,
    ...patch,
  };
}

const cards = [card(SAIGON, "Park Hyatt Saigon"), card(PHU, "Park Hyatt Phu Quoc")];
const requests: HotelMailMoveRequest[] = [
  { id: LETTER_SAIGON, bookingItemId: SAIGON, kind: "payment_link" },
  { id: LETTER_PHU, bookingItemId: PHU, kind: "payment_link" },
];

test("la confirmation Phu Quoc quitte Saigon, sans écriture tant que ce n’est pas confirmé", () => {
  const plan = planHotelCourrierMove({
    messages: [
      message(),
      message({
        id: NEIGHBOR,
        gmailThreadId: "thread-sgn",
        subject: "Park Hyatt Saigon - payment link",
        body: "Please complete the payment link for Saigon.",
        requestId: LETTER_SAIGON,
      }),
    ],
    cards,
    requests,
    extrait: "full payment of VND 346,595,760 has been successfully received",
    carteCible: PHU,
  });
  assert.equal(plan.ecrit, false);
  assert.equal(plan.email_envoye, false);
  assert.equal(plan.visible_to_client, "inchange");
  assert.equal(plan.de.carte_id, SAIGON);
  assert.equal(plan.vers.carte_id, PHU);
  assert.equal(plan.courrier_cible, LETTER_PHU);
  assert.deepEqual(plan.messages.map((row) => row.id), [MESSAGE]);
  assert.match(plan.messages[0]?.extrait || "", /346,595,760/);
  assert.throws(
    () =>
      planHotelCourrierMove({
        messages: [message({ bookingId: OTHER, bookingItemId: OTHER })],
        cards: [card(OTHER, "Ailleurs", OTHER), card(PHU, "Park Hyatt Phu Quoc")],
        requests,
        messageId: MESSAGE,
        carteCible: PHU,
      }),
    (error: unknown) => error instanceof McpWriteError && /même dossier/.test(error.message)
  );
});

test("le fil Gmail suit, pas l’autre courrier de la carte", () => {
  const plan = planHotelCourrierMove({
    messages: [
      message(),
      message({
        id: NEIGHBOR,
        receivedAt: "2026-11-19T04:20:00.000Z",
        body: "A second note on the same Gmail thread.",
      }),
      message({
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        gmailThreadId: "thread-sgn",
        body: "Saigon only.",
      }),
    ],
    cards,
    requests,
    messageId: MESSAGE,
    carteCible: PHU,
    fil: true,
  });
  assert.equal(plan.fil, true);
  assert.deepEqual(
    plan.messages.map((row) => row.id),
    [MESSAGE, NEIGHBOR]
  );
});

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  const updates: { table: string; payload: Row }[] = [];
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "update" = "select";
    let payload: Row = {};
    let cap = 100;
    const api = {
      select() {
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
      limit(value: number) {
        cap = value;
        return api;
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        const rows = (tables[table] || []).filter((row) => filters.every((keep) => keep(row)));
        if (op === "update") {
          updates.push({ table, payload });
          for (const row of rows) Object.assign(row, payload);
        }
        resolve({ data: rows.slice(0, cap), error: null });
      },
    };
    return api;
  }
  return { client: { from } as unknown as SupabaseClient, updates };
}

test("confirmer déplace le message et n’écrit pas la visibilité", async () => {
  const store = memoryAdmin({
    crm_bookings: [{ id: DOSSIER, reference: "TB-2026-0148" }],
    crm_booking_items: [
      { id: SAIGON, booking_id: DOSSIER, kind: "hotel", title: "Park Hyatt Saigon", details: { hotel_name: "Park Hyatt Saigon" } },
      { id: PHU, booking_id: DOSSIER, kind: "hotel", title: "Park Hyatt Phu Quoc", details: { hotel_name: "Park Hyatt Phu Quoc" } },
    ],
    crm_hotel_requests: [
      { id: LETTER_SAIGON, booking_id: DOSSIER, booking_item_id: SAIGON, kind: "payment_link" },
      { id: LETTER_PHU, booking_id: DOSSIER, booking_item_id: PHU, kind: "payment_link" },
    ],
    crm_hotel_thread_messages: [
      {
        id: MESSAGE,
        booking_id: DOSSIER,
        booking_item_id: SAIGON,
        gmail_thread_id: "thread-phu",
        subject: "Payment received",
        body: RECEIPT,
        received_at: "2026-11-19T04:18:00.000Z",
        direction: "in",
        request_id: LETTER_SAIGON,
        visible_to_client: true,
      },
    ],
  });
  const preview = await moveHotelCourrier(
    store.client,
    { reference: "TB-2026-0148", extrait: "full payment of VND 346,595,760", carte_cible: PHU },
    { staffId: null, name: "Test" },
    { journal: false }
  );
  assert.equal(preview.ecrit, false);
  assert.equal(store.updates.length, 0);
  assert.equal(store.client && true, true);
  const kept = (await store.client.from("crm_hotel_thread_messages").select("*").eq("id", MESSAGE)) as {
    data: Row[] | null;
  };
  assert.equal(kept.data?.[0]?.booking_item_id, SAIGON);
  assert.equal(kept.data?.[0]?.visible_to_client, true);

  const written = await moveHotelCourrier(
    store.client,
    { reference: "TB-2026-0148", message_id: MESSAGE, carte_cible: PHU, confirmer: true },
    { staffId: null, name: "Test" },
    { journal: false }
  );
  assert.equal(written.ecrit, true);
  assert.equal(written.email_envoye, false);
  assert.equal(store.updates.length, 1);
  assert.deepEqual(store.updates[0]?.payload, { booking_item_id: PHU, request_id: LETTER_PHU });
  assert.equal("visible_to_client" in (store.updates[0]?.payload || {}), false);
  const moved = (await store.client.from("crm_hotel_thread_messages").select("*").eq("id", MESSAGE)) as {
    data: Row[] | null;
  };
  assert.equal(moved.data?.[0]?.booking_item_id, PHU);
  assert.equal(moved.data?.[0]?.request_id, LETTER_PHU);
  assert.equal(moved.data?.[0]?.visible_to_client, true);
});
