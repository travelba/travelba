import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { hotelDeskKindFromLabel, setHotelCourrierClass } from "./hotel-courrier-classify";

const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ITEM = "11111111-1111-4111-8111-111111111111";
const ITEM_2 = "22222222-2222-4222-8222-222222222222";
const LETTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LETTER_2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STAFF = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>, failClassified = false) {
  const tables: Record<string, Row[]> = {};
  const writes: string[] = [];
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
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
        writes.push(table);
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
      limit(value: number) {
        cap = value;
        return api;
      },
      then(resolve: (value: { data: Row[] | null; error: { code: string; message: string } | null }) => void) {
        return Promise.resolve(finish()).then(resolve);
      },
    };
    function finish() {
      if (failClassified && table === "crm_hotel_requests") {
        return { data: null, error: { code: "42703", message: "column crm_hotel_requests.classified_at does not exist" } };
      }
      const matched = tables[table].filter((row) => filters.every((filter) => filter(row))).slice(0, cap);
      if (op === "update") {
        for (const row of matched) Object.assign(row, payload);
      }
      return { data: matched, error: null };
    }
    return api;
  }
  return { from, tables, writes };
}

function booking() {
  return { id: BOOKING, reference: "TB-2026-0079" };
}

function item(id: string, hotel: string) {
  return { id, booking_id: BOOKING, title: hotel, details: { hotel_name: hotel } };
}

function letter(patch: Row = {}): Row {
  return {
    id: LETTER,
    booking_id: BOOKING,
    booking_item_id: ITEM,
    kind: "payment_link",
    status: "replied",
    classified_at: null,
    classified_by_name: null,
    classified_note: null,
    ...patch,
  };
}

test("les libellés du bureau retrouvent la demande", () => {
  assert.equal(hotelDeskKindFromLabel("Lien de paiement"), "payment_link");
  assert.equal(hotelDeskKindFromLabel("payment_link"), "payment_link");
  assert.equal(hotelDeskKindFromLabel("Transfert"), "transfer");
  assert.equal(hotelDeskKindFromLabel("note inconnue"), null);
});

test("classer le lien Fairmont n’envoie rien et garde la note", async () => {
  const db = memoryAdmin({
    crm_bookings: [booking()],
    crm_booking_items: [item(ITEM, "Fairmont Singapore"), item(ITEM_2, "Raffles Singapore")],
    crm_hotel_requests: [
      letter(),
      letter({ id: LETTER_2, booking_item_id: ITEM_2, kind: "payment_link" }),
    ],
  });
  const result = await setHotelCourrierClass(
    db as unknown as SupabaseClient,
    {
      reference: "TB-2026-0079",
      demande: "Lien de paiement",
      hotel: "Fairmont",
      note: "Payé via Pliant le 17 oct. 2026",
    },
    { staffId: STAFF, name: "Raphaël" },
    { journal: false }
  );
  assert.equal(result.email_envoye, false);
  assert.equal(result.classe, true);
  assert.equal(result.rouvert, false);
  assert.equal(result.hotel, "Fairmont Singapore");
  assert.equal(result.demande, "Lien de paiement");
  assert.equal(result.reference, "TB-2026-0079");
  assert.equal(result.par, "Raphaël");
  assert.equal(result.note, "Payé via Pliant le 17 oct. 2026");
  const saved = db.tables.crm_hotel_requests.find((row) => row.id === LETTER);
  assert.equal(saved?.classified_by, STAFF);
  assert.equal(saved?.classified_note, "Payé via Pliant le 17 oct. 2026");
  assert.equal(typeof saved?.classified_at, "string");
  assert.equal(db.tables.crm_hotel_requests.find((row) => row.id === LETTER_2)?.classified_at, null);
  assert.deepEqual(db.writes, ["crm_hotel_requests"]);
  assert.equal(JSON.stringify(db.tables).includes("@"), false);
});

test("sans hôtel, deux liens de paiement restent à choisir", async () => {
  const db = memoryAdmin({
    crm_bookings: [booking()],
    crm_booking_items: [item(ITEM, "Fairmont Singapore"), item(ITEM_2, "Raffles Singapore")],
    crm_hotel_requests: [letter(), letter({ id: LETTER_2, booking_item_id: ITEM_2 })],
  });
  await assert.rejects(
    () =>
      setHotelCourrierClass(
        db as unknown as SupabaseClient,
        { reference: "TB-2026-0079", demande: "Lien de paiement" },
        { staffId: STAFF, name: "Raphaël" },
        { journal: false }
      ),
    /Fairmont Singapore/
  );
  assert.equal(db.writes.length, 0);
});

test("rouvrir retire le classement, un fil déjà ouvert ne change pas", async () => {
  const db = memoryAdmin({
    crm_bookings: [booking()],
    crm_booking_items: [item(ITEM, "Fairmont Singapore")],
    crm_hotel_requests: [letter({ classified_at: "2026-10-18T09:00:00.000Z", classified_by_name: "Raphaël", classified_note: "Payé" })],
  });
  const opened = await setHotelCourrierClass(
    db as unknown as SupabaseClient,
    { dossier_id: BOOKING, demande: "Lien de paiement", rouvrir: true },
    { staffId: STAFF, name: "Raphaël" },
    { journal: false }
  );
  assert.equal(opened.rouvert, true);
  assert.equal(opened.classe, false);
  assert.equal(opened.email_envoye, false);
  assert.equal(db.tables.crm_hotel_requests[0]?.classified_at, null);
  assert.equal(db.tables.crm_hotel_requests[0]?.classified_note, null);

  const again = await setHotelCourrierClass(
    db as unknown as SupabaseClient,
    { reference: "TB-2026-0079", courrier_id: LETTER, rouvrir: true },
    { staffId: null, name: "Jeton MCP" },
    { journal: false }
  );
  assert.equal(again.deja_ouvert, true);
  assert.equal(again.email_envoye, false);
});

test("une note qui ressemble à une carte est refusée, et la migration absente est dite", async () => {
  const db = memoryAdmin({
    crm_bookings: [booking(), { id: OTHER, reference: "TB-2026-0079" }],
    crm_booking_items: [item(ITEM, "Fairmont Singapore")],
    crm_hotel_requests: [letter({ status: "waiting" })],
  });
  await assert.rejects(
    () =>
      setHotelCourrierClass(
        db as unknown as SupabaseClient,
        { dossier_id: BOOKING, demande: "Lien de paiement", note: "4111111111111111" },
        { staffId: STAFF, name: "Raphaël" },
        { journal: false }
      ),
    /numéro de carte/
  );
  await assert.rejects(
    () =>
      setHotelCourrierClass(
        db as unknown as SupabaseClient,
        { reference: "TB-2026-0079", demande: "Lien de paiement" },
        { staffId: STAFF, name: "Raphaël" },
        { journal: false }
      ),
    /Plusieurs dossiers/
  );
  const waiting = memoryAdmin({
    crm_bookings: [booking()],
    crm_booking_items: [item(ITEM, "Fairmont Singapore")],
    crm_hotel_requests: [letter({ status: "draft" })],
  });
  await assert.rejects(
    () =>
      setHotelCourrierClass(
        waiting as unknown as SupabaseClient,
        { dossier_id: BOOKING, demande: "Lien de paiement" },
        { staffId: STAFF, name: "Raphaël" },
        { journal: false }
      ),
    /pas un fil déjà parti/
  );
  const missing = memoryAdmin(
    {
      crm_bookings: [booking()],
      crm_booking_items: [item(ITEM, "Fairmont Singapore")],
      crm_hotel_requests: [letter()],
    },
    true
  );
  await assert.rejects(
    () =>
      setHotelCourrierClass(
        missing as unknown as SupabaseClient,
        { dossier_id: BOOKING, demande: "Lien de paiement" },
        { staffId: STAFF, name: "Raphaël" },
        { journal: false }
      ),
    /pas encore en place/
  );
});

test("le classement n’appelle ni Gmail ni un envoi", () => {
  const src = readFileSync(new URL("./hotel-courrier-classify.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /resend|gmail|sendHotel|nodemailer/i);
  const route = readFileSync(new URL("../../app/api/admin/bookings/[id]/hotel-desk/route.ts", import.meta.url), "utf8");
  assert.match(route, /action === "classer"/);
  assert.match(route, /rouvrir: action === "rouvrir"/);
});
