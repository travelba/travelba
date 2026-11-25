import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyAgencyRoute } from "./agency-routes";
import { clearBookingCardReview } from "./clear-card-review";

const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HOTEL = "11111111-1111-4111-8111-111111111111";
const CAR = "22222222-2222-4222-8222-222222222222";
const CLEAN = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  const updates: { table: string; payload: Row }[] = [];
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "update" = "select";
    let payload: Row = {};
    const api = {
      select() {
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = value;
        updates.push({ table, payload: value });
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        const matched = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (op === "update") {
          for (const row of matched) Object.assign(row, payload);
        }
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      },
    };
    return api;
  }
  return { from, tables, updates };
}

function card(id: string, title: string, marked: boolean, visible = false): Row {
  return {
    id,
    booking_id: BOOKING,
    kind: id === CAR ? "car" : "hotel",
    title,
    visible_to_client: visible,
    details: marked
      ? { needs_review: true, review_reason: "À vérifier avant de montrer au client.", hotel_name: title }
      : { hotel_name: title },
  };
}

test("tout valider retire le marqueur sans toucher à la visibilité", async () => {
  const db = memoryAdmin({
    crm_booking_items: [card(HOTEL, "Mondrian", true, false), card(CAR, "Voiture", true, true), card(CLEAN, "Déjà lu", false)],
  });
  const result = await clearBookingCardReview(db as unknown as SupabaseClient, BOOKING, null);
  assert.equal("error" in result, false);
  if ("error" in result) return;
  assert.deepEqual(
    result.cartes.map((row) => row.titre),
    ["Mondrian", "Voiture"]
  );
  const hotel = db.tables.crm_booking_items.find((row) => row.id === HOTEL);
  const car = db.tables.crm_booking_items.find((row) => row.id === CAR);
  assert.equal(hotel?.visible_to_client, false);
  assert.equal(car?.visible_to_client, true);
  assert.equal((hotel?.details as Row).needs_review, undefined);
  assert.equal((hotel?.details as Row).review_reason, undefined);
  assert.equal((hotel?.details as Row).hotel_name, "Mondrian");
  assert.equal((car?.details as Row).hotel_name, "Voiture");
  assert.equal((db.tables.crm_booking_items.find((row) => row.id === CLEAN)?.details as Row).hotel_name, "Déjà lu");
  for (const update of db.updates) {
    assert.deepEqual(Object.keys(update.payload), ["details"]);
    assert.equal("visible_to_client" in update.payload, false);
  }
  const again = await clearBookingCardReview(db as unknown as SupabaseClient, BOOKING, null);
  if ("error" in again) assert.fail(again.error);
  assert.equal(again.cartes.length, 0);
});

test("une carte inconnue est refusée et rien n’est écrit", async () => {
  const db = memoryAdmin({ crm_booking_items: [card(HOTEL, "Mondrian", true)] });
  const missing = await clearBookingCardReview(db as unknown as SupabaseClient, BOOKING, [CLEAN]);
  assert.equal("error" in missing && missing.error, "Carte introuvable sur ce dossier.");
  assert.equal(db.updates.length, 0);
  assert.equal((db.tables.crm_booking_items[0].details as Row).needs_review, true);
});

test("la route Vérifié est classée et n’envoie rien", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const classified = classifyAgencyRoute("POST", `/api/admin/bookings/${id}/verifier`);
  assert.equal(classified?.permission, "edit_dossiers");
  assert.equal(classified?.journal, false);
  assert.equal(classified?.entity, "dossier");
  const route = readFileSync(new URL("../../app/api/admin/bookings/[id]/verifier/route.ts", import.meta.url), "utf8");
  assert.match(route, /recordAgencyJournal/);
  assert.match(route, /verifiedJournalSummary/);
  assert.doesNotMatch(route, /visible_to_client|noteCarnetAdditions|whatsapp|refreshBookingLedger/);
  const clear = readFileSync(new URL("./clear-card-review.ts", import.meta.url), "utf8");
  assert.doesNotMatch(clear, /update\(\{[^}]*visible_to_client|whatsapp|noteCarnetAdditions/);
  const panel = readFileSync(new URL("../../components/admin/BookingItemsPanel.tsx", import.meta.url), "utf8");
  const banner = readFileSync(new URL("../../components/crm/ReviewDoubtList.tsx", import.meta.url), "utf8");
  assert.match(panel, /Vérifié/);
  assert.match(panel, /Marquer comme vérifiée/);
  assert.match(banner, /Tout valider/);
  assert.match(banner, /Lecture douteuse/);
});
