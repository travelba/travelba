import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setCarnetPublished } from "./bookings";
import { deliverQueuedConcierge, PIECE_QUEUE_ABANDON, queuePublishedPieces } from "./concierge-send";
import { revealKeptHiddenOnShow, stayJustShown } from "./piece-publish";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CUSTOMER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CARD = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NOW = new Date("2026-11-24T09:33:00.000Z");

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  let triedSend = false;
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
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
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return api;
      },
      like() {
        return api;
      },
      gte() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        return Promise.resolve(finish(false));
      },
      then(resolve: (value: { data: Row[] | null; error: { message?: string } | null }) => void, reject?: (reason: unknown) => void) {
        return Promise.resolve(list()).then(resolve, reject);
      },
    };
    function matched() {
      return tables[table].filter((row) => filters.every((filter) => filter(row)));
    }
    function apply() {
      if (op === "insert") {
        const row = { id: payload.id || "10000000-0000-4000-8000-000000000001", ...payload };
        tables[table].push(row);
        return [row];
      }
      if (op === "update") {
        const hits = matched();
        for (const row of hits) Object.assign(row, payload);
        return hits;
      }
      if (op === "delete") {
        const removed = matched();
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return removed;
      }
      return matched();
    }
    function list() {
      return { data: apply(), error: null };
    }
    function finish(allowEmpty: boolean) {
      const rows = apply();
      if (rows.length === 1) return { data: rows[0], error: null };
      if (allowEmpty && rows.length === 0) return { data: null, error: null };
      return { data: null, error: { message: "several" } };
    }
    return api;
  }
  const client = {
    from,
    auth: {
      admin: {
        generateLink() {
          triedSend = true;
          throw new Error("envoi WhatsApp inattendu");
        },
      },
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    tables,
    triedSend: () => triedSend,
  };
}

function booking(visible = true): Row {
  return {
    id: BOOKING,
    customer_id: CUSTOMER,
    reference: "TB-2026-0001",
    title: "Tel Aviv",
    destination: "Tel Aviv",
    status: visible ? "confirmed" : "draft",
    visible_to_client: visible,
    prices_visible: visible,
  };
}

function customer(): Row {
  return {
    id: CUSTOMER,
    email: "client@example.com",
    phone: "+33600000000",
    first_name: "Camille",
    whatsapp_opt_in_at: "2026-01-01T00:00:00.000Z",
    whatsapp_opt_out_at: null,
  };
}

test("enregistrer le titre d’un dossier déjà visible n’enfile aucune pièce", () => {
  assert.equal(stayJustShown(true, { title: "Tel Aviv et les Seychelles", visible_to_client: true }), false);
  assert.equal(stayJustShown(true, { title: "Tel Aviv" }), false);
  assert.equal(stayJustShown(false, { title: "Tel Aviv", visible_to_client: true }), true);
  assert.equal(stayJustShown(false, { title: "Tel Aviv" }), false);
  assert.equal(revealKeptHiddenOnShow(true, false), true);
  assert.equal(revealKeptHiddenOnShow(true, true), false);
  assert.equal(revealKeptHiddenOnShow(false, false), false);
  const src = readFileSync(join(root, "app/api/admin/bookings/[id]/route.ts"), "utf8");
  assert.match(src, /stayJustShown\(prev\.visible_to_client, body\)/);
  assert.match(src, /revealDocuments: justShown/);
  assert.match(src, /\.eq\("visible_to_client", true\)/);
  assert.doesNotMatch(src, /eq\("visible_to_client", false\)/);
  assert.doesNotMatch(src, /revealedPieces/);
});

test("un dossier déjà visible ne révèle pas les pièces masquées", async () => {
  const writes: { table: string; op: string }[] = [];
  function from(table: string) {
    const calls: { method: string; args: unknown[] }[] = [];
    const proxy: Record<string | symbol, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            const first = calls[0];
            if (first && (first.method === "update" || first.method === "insert")) {
              writes.push({ table, op: first.method });
            }
            const rows =
              table === "crm_booking_items"
                ? [{ id: CARD, kind: "hotel", details: {} }]
                : table === "crm_booking_documents"
                  ? [{ id: DOC, booking_item_id: CARD, visible_to_client: false }]
                  : [{ id: BOOKING }];
            const single = calls.some((call) => call.method === "maybeSingle" || call.method === "single");
            const result = { data: single ? rows[0] : rows, error: null };
            return (onOk: (value: unknown) => unknown) => Promise.resolve(result).then(onOk);
          }
          return (...args: unknown[]) => {
            calls.push({ method: String(prop), args });
            return proxy;
          };
        },
      }
    );
    return proxy;
  }
  await setCarnetPublished({ from } as unknown as SupabaseClient, BOOKING, true, { revealDocuments: false });
  assert.equal(writes.some((write) => write.table === "crm_bookings"), true);
  assert.equal(writes.some((write) => write.table === "crm_booking_items"), true);
  assert.equal(writes.some((write) => write.table === "crm_booking_documents"), false);
});

test("une pièce masquée n’est jamais enfilée", async () => {
  const hidden = memoryAdmin({
    crm_bookings: [booking()],
    crm_customers: [customer()],
    crm_booking_items: [{ id: CARD, booking_id: BOOKING, kind: "hotel", visible_to_client: true }],
    crm_booking_documents: [
      { id: DOC, booking_id: BOOKING, booking_item_id: CARD, kind: "hotel", visible_to_client: false, extracted: null },
    ],
    crm_whatsapp_messages: [],
  });
  await queuePublishedPieces(BOOKING, [{ id: DOC, kind: "hotel" }], NOW, hidden.client);
  assert.equal(hidden.tables.crm_whatsapp_messages.length, 0);

  const hiddenCard = memoryAdmin({
    crm_bookings: [booking()],
    crm_customers: [customer()],
    crm_booking_items: [{ id: CARD, booking_id: BOOKING, kind: "hotel", visible_to_client: false }],
    crm_booking_documents: [
      { id: DOC, booking_id: BOOKING, booking_item_id: CARD, kind: "hotel", visible_to_client: true, extracted: null },
    ],
    crm_whatsapp_messages: [],
  });
  await queuePublishedPieces(BOOKING, [{ id: DOC, kind: "hotel" }], NOW, hiddenCard.client);
  assert.equal(hiddenCard.tables.crm_whatsapp_messages.length, 0);

  const shown = memoryAdmin({
    crm_bookings: [booking()],
    crm_customers: [customer()],
    crm_booking_items: [{ id: CARD, booking_id: BOOKING, kind: "hotel", visible_to_client: true, title: "Hôtel" }],
    crm_booking_documents: [
      { id: DOC, booking_id: BOOKING, booking_item_id: CARD, kind: "hotel", visible_to_client: true, extracted: null },
    ],
    crm_whatsapp_messages: [],
  });
  await queuePublishedPieces(BOOKING, [{ id: DOC, kind: "hotel" }], NOW, shown.client);
  assert.equal(shown.tables.crm_whatsapp_messages.length, 1);
  const queued = shown.tables.crm_whatsapp_messages[0];
  assert.equal(queued?.status, "queued");
  assert.equal(queued?.dedupe_key, `pieces-queue:${BOOKING}`);
  assert.equal((queued?.payload as { pieces?: { id: string }[] })?.pieces?.[0]?.id, DOC);
});

test("une pièce retirée entre la file et l’envoi ne part pas", async () => {
  const removed = memoryAdmin({
    crm_bookings: [booking()],
    crm_customers: [customer()],
    crm_booking_items: [{ id: CARD, booking_id: BOOKING, kind: "hotel", visible_to_client: true }],
    crm_booking_documents: [
      {
        id: DOC,
        booking_id: BOOKING,
        booking_item_id: CARD,
        kind: "hotel",
        visible_to_client: true,
        extracted: { tri_piece: { retiree_at: "2026-11-24T09:00:00.000Z", visible_avant: true } },
      },
    ],
    crm_whatsapp_messages: [
      {
        id: "msg-1",
        customer_id: CUSTOMER,
        booking_id: BOOKING,
        dedupe_key: `pieces-queue:${BOOKING}`,
        template_key: "pieces-queue",
        body: "Votre confirmation d'hôtel est dans la réservation TB-2026-0001.",
        status: "queued",
        payload: { pieces: [{ id: DOC, kind: "hotel", at: "2026-11-24T08:00:00.000Z" }] },
      },
    ],
  });
  await deliverQueuedConcierge(NOW, removed.client);
  const row = removed.tables.crm_whatsapp_messages[0];
  assert.equal(row?.status, "failed");
  assert.equal(row?.error, PIECE_QUEUE_ABANDON);
  assert.equal(removed.triedSend(), false);
});
