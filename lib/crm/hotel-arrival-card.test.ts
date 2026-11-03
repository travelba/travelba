import assert from "node:assert/strict";
import test from "node:test";
import { syncStayCards } from "./hotel-arrival-run";
import type { CrmBookingItem, CrmHotelArrival } from "./types";

type Row = Record<string, unknown>;

function arrival(): CrmHotelArrival {
  return {
    id: "arr-1",
    booking_id: "booking-1",
    booking_item_id: "hotel-1",
    channel: "little_emperors",
    status: "pending",
    net_cents: null,
    amount_cents: null,
    currency: "EUR",
    pliant_card_id: null,
    card_last4: null,
    card_limit_cents: null,
    payment_url: null,
    requested_at: null,
    relance_count: 0,
    last_relance_at: null,
    paid_at: null,
    vip_sent_at: null,
    card_closed_at: null,
    blocked_reason: null,
    task_open: false,
    task_note: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };
}

function hotel(): CrmBookingItem {
  return {
    id: "hotel-1",
    booking_id: "booking-1",
    kind: "hotel",
    title: "Nobu Hotel London Portman Square",
    supplier: "Little Emperors",
    confirmation_ref: "64570",
    start_at: "2026-12-02",
    end_at: "2026-12-06",
    amount: 315,
    include_in_ledger: true,
    sort_order: 1,
    details: { hotel_name: "Nobu Hotel London Portman Square", source_family: "little_emperors" },
    visible_to_client: false,
    source_document_id: null,
    lifecycle: "active",
    superseded_by: null,
    created_at: "",
    updated_at: "",
  };
}

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let action: "select" | "update" | "upsert" = "select";
    let patch: Row = {};
    const api = {
      select() {
        action = "select";
        return api;
      },
      update(row: Row) {
        action = "update";
        patch = row;
        return api;
      },
      insert(row: Row) {
        tables[table].push(row);
        return api;
      },
      upsert(row: Row) {
        action = "upsert";
        patch = row;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (action === "update") {
          for (const row of rows) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        if (action === "upsert") {
          tables[table].push({ ...patch });
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return api;
  }
  return { from, tables };
}

test("un dossier Little Emperors confirmé reçoit la carte, un brouillon non", async () => {
  const issued: string[] = [];
  const issueCard = async () => {
    issued.push("card");
    return { cardId: "card-1" };
  };
  const now = new Date("2026-11-03T12:00:00Z");
  const stay = {
    bookingId: "booking-1",
    bookingEndDate: "2026-12-06",
    currency: "EUR",
    items: [hotel()],
    travelers: [],
    holder: { first_name: "Nico", last_name: "Santos" },
    deps: { now, issueCard },
  };
  const confirmed = memory({
    crm_hotel_arrivals: [arrival() as unknown as Row],
    crm_le_bookings: [
      {
        crm_booking_id: "booking-1",
        hotel_name: "Nobu Hotel London Portman Square",
        check_in: "2026-12-02",
        total_cost: "215.78",
        currency: "EUR",
      },
    ],
    crm_bookings: [{ id: "booking-1", reference: "TB-2026-0099" }],
    crm_pliant_cards: [],
  });
  await syncStayCards(confirmed as never, { ...stay, bookingStatus: "confirmed" });
  assert.equal(issued.length, 1);
  assert.equal(confirmed.tables.crm_hotel_arrivals[0]?.pliant_card_id, "card-1");

  issued.length = 0;
  const draft = memory({
    crm_hotel_arrivals: [arrival() as unknown as Row],
    crm_le_bookings: [
      {
        crm_booking_id: "booking-1",
        hotel_name: "Nobu Hotel London Portman Square",
        check_in: "2026-12-02",
        total_cost: "215.78",
        currency: "EUR",
      },
    ],
    crm_bookings: [{ id: "booking-1", reference: "TB-2026-0099" }],
    crm_pliant_cards: [],
  });
  await syncStayCards(draft as never, { ...stay, bookingStatus: "draft" });
  assert.equal(issued.length, 0);
  assert.equal(draft.tables.crm_hotel_arrivals[0]?.pliant_card_id, null);
});
