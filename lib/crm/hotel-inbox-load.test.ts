import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOTEL_INBOX_LOAD_ERROR, hotelInboxActionCount } from "./hotel-inbox";
import { loadHotelInbox, pliantSpendsForHotels } from "./hotel-inbox-load";

const NOW = Date.parse("2026-11-17T12:00:00+01:00");
const TX_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const ITEMS = [
  {
    id: "item-saigon",
    booking_id: "booking-saigon",
    title: "Park Hyatt Saigon",
    details: { hotel_name: "Park Hyatt Saigon", city: "Hô Chi Minh" },
    lifecycle: "active",
    start_at: "2026-12-21T15:00:00+07:00",
    end_at: "2026-12-25T11:00:00+07:00",
  },
  {
    id: "item-bangkok",
    booking_id: "booking-bangkok",
    title: "Bangkok Marriott Marquis",
    details: { hotel_name: "Bangkok Marriott Marquis", city: "Bangkok" },
    lifecycle: "active",
    start_at: "2026-12-01T15:00:00+07:00",
    end_at: "2026-12-05T11:00:00+07:00",
  },
  {
    id: "item-paid",
    booking_id: "booking-paid",
    title: "Rosewood",
    details: { hotel_name: "Rosewood London", city: "Londres" },
    lifecycle: "active",
    start_at: "2026-12-10T15:00:00+00:00",
    end_at: "2026-12-12T11:00:00+00:00",
  },
];

const BOOKINGS = [
  { id: "booking-saigon", reference: "TB-2026-0148", status: "confirmed", end_date: "2026-12-25", archived_at: null, customer_id: "cust-1" },
  { id: "booking-bangkok", reference: "TB-2026-0137", status: "confirmed", end_date: "2026-12-05", archived_at: null, customer_id: "cust-1" },
  { id: "booking-paid", reference: "TB-2026-0100", status: "confirmed", end_date: "2026-12-12", archived_at: null, customer_id: "cust-1" },
];

const REQUESTS = [
  letter("req-saigon", "booking-saigon", "item-saigon", "upgrade", "Le petit-déjeuner est inclus."),
  letter("req-bangkok", "booking-bangkok", "item-bangkok", "payment_link", "Here is the payment link."),
  letter("req-paid", "booking-paid", "item-paid", "payment_link", "Payment link enclosed."),
];

const MESSAGES = [
  message("out-saigon", "req-saigon", "item-saigon", "out", "2026-11-01T08:00:00.000Z", "Pouvez-vous confirmer le petit-déjeuner ?", null),
  message("in-saigon", "req-saigon", "item-saigon", "in", "2026-11-02T09:00:00.000Z", "Le petit-déjeuner est inclus. Merci de nous dire l’heure d’arrivée.", null),
  message("out-bangkok", "req-bangkok", "item-bangkok", "out", "2026-11-01T08:00:00.000Z", "Le lien ?", null),
  message("in-bangkok", "req-bangkok", "item-bangkok", "in", "2026-11-03T09:00:00.000Z", "Here is the payment link.\nTotal 500 €.", "https://pay.hotel.test/bangkok"),
  message("out-paid", "req-paid", "item-paid", "out", "2026-11-01T08:00:00.000Z", "Le lien ?", null),
  message("in-paid", "req-paid", "item-paid", "in", "2026-11-02T09:00:00.000Z", "Payment link enclosed.", "https://pay.hotel.test/rosewood"),
];

const COSTS = [{ booking_item_id: "item-paid", source_id: TX_ID, source: "pliant" }];
const TRANSACTIONS = [
  {
    id: TX_ID,
    card_id: "card-paid",
    status: "BOOKED",
    type: "PURCHASE",
    billing_cents: 50000,
    billing_currency: "EUR",
    booked_at: "2026-11-04T09:00:00.000Z",
  },
];

function letter(id: string, bookingId: string, itemId: string, kind: string, body: string) {
  return {
    id,
    booking_id: bookingId,
    booking_item_id: itemId,
    kind,
    status: "replied",
    sent_at: "2026-11-01T08:00:00.000Z",
    last_follow_up_at: null,
    replied_at: "2026-11-02T09:00:00.000Z",
    reply_body: body,
    follow_up_count: 0,
    classified_at: null,
  };
}

function message(id: string, requestId: string, itemId: string, direction: "in" | "out", at: string, body: string, link: string | null) {
  return {
    id,
    request_id: requestId,
    booking_item_id: itemId,
    body,
    received_at: at,
    direction,
    counts_as_reply: direction === "in",
    link,
    from_email: direction === "in" ? "stay@hotel.test" : "agence@travelba.fr",
  };
}

type Call = { method: string; args: unknown[] };

function chain(answer: (calls: Call[]) => { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: Call[] = [];
  const api: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "is", "or", "neq", "gte", "lte", "not"]) {
    api[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return api;
    };
  }
  api.then = (resolve: (value: { data: unknown; error: { code?: string; message?: string } | null }) => void) => {
    resolve(answer(calls));
  };
  return api;
}

function wanted(calls: Call[], column: string) {
  const hit = [...calls].reverse().find((call) => call.method === "in" && call.args[0] === column);
  if (!hit || !Array.isArray(hit.args[1])) return null;
  return new Set(hit.args[1] as string[]);
}

function inboxClient(state: { selects: string[]; rpc: number; failItems?: boolean }) {
  return {
    from(table: string) {
      return chain((calls) => {
        if (state.failItems && table === "crm_booking_items") {
          return { data: null, error: { message: "permission denied for table crm_booking_items" } };
        }
        if (table === "crm_card_links") {
          const select = calls.find((call) => call.method === "select")?.args[0];
          state.selects.push(String(select || ""));
          return { data: null, error: { code: "42501", message: "permission denied for table crm_card_links" } };
        }
        if (table === "crm_booking_items") return { data: ITEMS, error: null };
        if (table === "crm_bookings") return { data: BOOKINGS, error: null };
        if (table === "crm_hotel_requests") return { data: REQUESTS, error: null };
        if (table === "crm_hotel_thread_messages") return { data: MESSAGES, error: null };
        if (table === "crm_customers") return { data: [{ id: "cust-1", first_name: "Camille", last_name: "Martin" }], error: null };
        if (table === "crm_booking_cards" || table === "crm_hotel_arrivals") return { data: [], error: null };
        if (table === "crm_trip_costs") {
          const ids = wanted(calls, "booking_item_id");
          return { data: COSTS.filter((row) => !ids || ids.has(row.booking_item_id)), error: null };
        }
        if (table === "crm_pliant_transactions") {
          const byId = wanted(calls, "id");
          const byCard = wanted(calls, "card_id");
          return {
            data: TRANSACTIONS.filter(
              (row) => (byId ? byId.has(row.id) : true) && (byCard ? byCard.has(row.card_id) : true)
            ),
            error: null,
          };
        }
        return { data: [], error: null };
      });
    },
    rpc() {
      state.rpc += 1;
      return Promise.resolve({ data: [], error: null });
    },
  } as unknown as SupabaseClient;
}

test("les fils restent affichés si les liens de carte sont refusés, et le badge compte paiement plus réponses", async () => {
  const state = { selects: [] as string[], rpc: 0 };
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((part) => (part instanceof Error ? part.message : String(part))).join(" "));
  };
  try {
    const inbox = await loadHotelInbox(inboxClient(state), NOW);
    assert.equal(inbox.loadError ?? null, null);
    assert.equal(inbox.replies.some((row) => row.reference === "TB-2026-0148" && row.hotel === "Park Hyatt Saigon"), true);
    assert.equal(inbox.payment.some((row) => row.reference === "TB-2026-0137" && row.hotel === "Bangkok Marriott Marquis"), true);
    assert.equal(inbox.payment.some((row) => row.hotel === "Rosewood London"), false);
    assert.equal(inbox.replies.some((row) => row.hotel === "Rosewood London"), false);
    assert.equal(hotelInboxActionCount(inbox), inbox.payment.length + inbox.replies.length);
    assert.equal(hotelInboxActionCount(inbox), 2);
    assert.ok(state.selects.length > 0);
    for (const select of state.selects) {
      assert.equal(select.includes("code_hash"), false);
      assert.equal(select.includes("client_card_path"), false);
      assert.match(select, /booking_item_id/);
      assert.match(select, /hotel_request_id/);
      assert.match(select, /pliant_card_id/);
    }
    assert.equal(state.rpc, 0);
    assert.match(errors.join("\n"), /permission denied for table crm_card_links/);
  } finally {
    console.error = original;
  }
});

test("une lecture principale en échec pose le bandeau au lieu d’une liste vide silencieuse", async () => {
  const state = { selects: [] as string[], rpc: 0, failItems: true };
  const original = console.error;
  console.error = () => {};
  try {
    const inbox = await loadHotelInbox(inboxClient(state), NOW);
    assert.equal(inbox.loadError, HOTEL_INBOX_LOAD_ERROR);
    assert.equal(inbox.payment.length + inbox.replies.length + inbox.unanswered.length + inbox.rest.length, 0);
  } finally {
    console.error = original;
  }
});

test("un achat se lit depuis l’arrivée, le lien de carte ou le coût, sans la fonction SQL", () => {
  const tx = {
    id: TX_ID,
    card_id: "card-a",
    status: "BOOKED",
    type: "PURCHASE",
    billing_cents: 12000,
    billing_currency: "EUR",
    booked_at: "2026-11-04T09:00:00.000Z",
  };
  const fromArrival = pliantSpendsForHotels({
    itemIds: ["item-1"],
    requestIds: [],
    arrivals: [{ booking_item_id: "item-1", pliant_card_id: " card-a " }],
    links: [],
    costs: [],
    transactions: [tx],
  });
  assert.equal(fromArrival[0]?.bookingItemId, "item-1");
  assert.equal(fromArrival[0]?.transactionId, TX_ID);
  const fromLink = pliantSpendsForHotels({
    itemIds: [],
    requestIds: ["req-1"],
    arrivals: [],
    links: [{ booking_item_id: null, hotel_request_id: "req-1", pliant_card_id: "card-a" }],
    costs: [],
    transactions: [tx],
  });
  assert.equal(fromLink[0]?.hotelRequestId, "req-1");
  const fromCost = pliantSpendsForHotels({
    itemIds: ["item-1"],
    requestIds: [],
    arrivals: [{ booking_item_id: "item-1", pliant_card_id: "  " }],
    links: [],
    costs: [{ booking_item_id: "item-1", source_id: TX_ID }],
    transactions: [{ ...tx, card_id: "autre" }],
  });
  assert.equal(fromCost.length, 1);
  assert.equal(fromCost[0]?.bookingItemId, "item-1");
  const ignored = pliantSpendsForHotels({
    itemIds: ["item-2"],
    requestIds: [],
    arrivals: [{ booking_item_id: "item-1", pliant_card_id: "card-a" }],
    links: [],
    costs: [],
    transactions: [tx],
  });
  assert.equal(ignored.length, 0);
  const src = readFileSync(join(process.cwd(), "lib/crm/hotel-inbox-load.ts"), "utf8");
  assert.equal(src.includes("code_hash"), false);
  assert.equal(src.includes("client_card_path"), false);
  assert.equal(src.includes("crm_hotel_pliant_spend"), false);
  assert.match(src, /SPEND_BATCH = 80/);
  const panel = readFileSync(join(process.cwd(), "components/admin/boite/HotelsPanel.tsx"), "utf8");
  assert.match(panel, /loadHotelInbox\(createServiceClient\(\)\)/);
  assert.equal(panel.includes("loadHotelInbox(supabase)"), false);
});
