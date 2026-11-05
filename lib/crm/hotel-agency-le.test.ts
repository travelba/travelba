import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openDirectStay } from "./hotel-direct-run";
import { emptyPliantCardControls } from "./pliant-controls";

const CUSTOMER = "07b9dde3-de59-4b1a-88b7-03a6e23e98a6";
const OFFER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAN = "4242424242424242";
const SALE = 142.74;

type Row = Record<string, unknown>;

function memory() {
  const tables: Record<string, Row[]> = {
    crm_customers: [
      {
        id: CUSTOMER,
        email: "benjamin@example.com",
        first_name: "Benjamin",
        last_name: "Boukris",
        phone: "+33600000000",
        city: "Paris",
        company_role: null,
        billing_parent_id: null,
        stripe_customer_id: null,
        hotel_booking_enabled: true,
        hotel_demo: false,
        hotel_direct_live: true,
        hotel_le_api_booking: true,
        whatsapp_opt_in_at: "2026-11-01T00:00:00.000Z",
        whatsapp_opt_out_at: null,
      },
    ],
    crm_billing_companies: [],
    crm_hotel_search_offers: [
      {
        id: OFFER,
        customer_id: CUSTOMER,
        hotel_name: "Hotel Indigo Bordeaux Centre Chartrons",
        city: "Bordeaux",
        room_label: "1 Queen Standard",
        rate_title: "Flexible",
        cancellation_policy: "Free cancellation before 18:00 on 26 November 2026",
        check_in: "2026-11-27",
        check_out: "2026-11-28",
        sell_cents: 14274,
        currency: "EUR",
        benefits: [],
        account: "little_emperors",
        expires_at: "2026-12-01T00:00:00.000Z",
        free_cancellation: true,
        rooms: [{ adults: 1, children: [] }],
        adults: 1,
        le_hotel_id: 15,
        le_session_id: "SESS-1",
        le_rate_index: "RATE-1",
        cancellation_deadline: "2026-11-26T18:00:00.000000Z",
        requires_cvc: true,
        payment_description: "Guarantee",
        rate_key: "RATE-1",
        room_key: "queen",
      },
    ],
    crm_hotel_direct_stays: [],
    crm_hotel_direct_events: [],
    crm_bookings: [],
    crm_booking_items: [],
    crm_booking_cards: [],
    crm_pliant_cards: [],
    crm_transactions: [],
    crm_whatsapp_messages: [],
    crm_booking_documents: [],
    crm_integrations: [],
  };
  function from(table: string) {
    const state = {
      op: "select" as "select" | "insert" | "update" | "upsert" | "delete",
      payload: {} as Row,
      filters: [] as { kind: string; col: string; val: unknown }[],
    };
    const api = {
      select() {
        return api;
      },
      insert(payload: Row | Row[]) {
        state.op = "insert";
        state.payload = Array.isArray(payload) ? payload[0] : payload;
        return api;
      },
      update(payload: Row) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      delete() {
        state.op = "delete";
        return api;
      },
      upsert(payload: Row) {
        state.op = "upsert";
        state.payload = payload;
        return api;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ kind: "eq", col, val });
        return api;
      },
      neq(col: string, val: unknown) {
        state.filters.push({ kind: "neq", col, val });
        return api;
      },
      in(col: string, val: unknown) {
        state.filters.push({ kind: "in", col, val });
        return api;
      },
      is(col: string, val: unknown) {
        state.filters.push({ kind: "is", col, val });
        return api;
      },
      ilike() {
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      single() {
        return Promise.resolve(run(true));
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };
    function matches(row: Row) {
      return state.filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.col] === filter.val;
        if (filter.kind === "neq") return row[filter.col] !== filter.val;
        if (filter.kind === "is") return filter.val == null ? row[filter.col] == null : row[filter.col] === filter.val;
        return Array.isArray(filter.val) && filter.val.includes(row[filter.col]);
      });
    }
    function run(single: boolean) {
      const bucket = tables[table] || (tables[table] = []);
      if (state.op === "insert") {
        const row = { id: `${table}-${bucket.length + 1}`, ...state.payload };
        bucket.push(row);
        return { data: single ? row : [row], error: null };
      }
      if (state.op === "delete") {
        const hits = bucket.filter(matches);
        tables[table] = bucket.filter((row) => !hits.includes(row));
        return { data: null, error: null };
      }
      if (state.op === "upsert") {
        const key = state.payload.pliant_card_id;
        const found = bucket.find((row) => key && row.pliant_card_id === key);
        if (found) Object.assign(found, state.payload);
        else bucket.push({ id: `${table}-${bucket.length + 1}`, ...state.payload });
        return { data: null, error: null };
      }
      const hits = bucket.filter(matches);
      if (state.op === "update") {
        for (const row of hits) Object.assign(row, state.payload);
      }
      if (single) return { data: hits[0] || null, error: hits[0] ? null : null };
      return { data: hits, error: null };
    }
    return api;
  }
  const client = {
    from,
    rpc: async () => ({ data: "TB-2026-0901", error: null }),
  };
  return { client: client as unknown as SupabaseClient, tables };
}

function availability(adults: number) {
  return [
    {
      hotel_id: 15,
      hotel_name: "Hotel Indigo Bordeaux Centre Chartrons",
      session_id: "SESS-AGENCY",
      is_available: true,
      room_types: [
        {
          name: "1 Queen Standard",
          rates: [
            {
              rate_index: "RATE-1",
              total_to_book: SALE,
              total_to_book_in_requested_currency: SALE,
              currency_code: "EUR",
              requested_currency_code: "EUR",
              cancellation_deadline: "2026-11-26T18:00:00.000000Z",
              requires_cvc: true,
              payment_description: "No deposit",
              can_cancel: true,
              cancellation_policy: "Free cancellation before 18:00 on 26 November 2026 after which a charge of EUR 162.74 will be incurred.",
              is_tax_included: true,
            },
          ],
        },
      ],
    },
  ];
  void adults;
}

function bookingPayload() {
  return {
    id: 9001,
    confirmation_number: "STG9001",
    hotel_id: 15,
    hotel_name: "Hotel Indigo Bordeaux Centre Chartrons",
    city: "Bordeaux",
    check_in: "2026-11-27",
    check_out: "2026-11-28",
    state: "confirmed",
    currency: "EUR",
    total_cost: "142.74",
    is_cancellable: true,
    cancellation_deadline: "2026-11-26T18:00:00.000000Z",
    rooms: [
      {
        guest_name: "Benjamin Boukris",
        adults: 2,
        cancellation_policy: "Free cancellation before 18:00 on 26 November 2026 after which a charge of EUR 162.74 will be incurred.",
      },
    ],
  };
}

function installFetch(mode: "ok" | "refuse") {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, method, body });
    if (url.includes("supabase.co")) return previous(input, init);
    if (url.includes("api.littleemperors.com") && !url.includes("api-staging")) throw new Error("production LE");
    if (url.includes("getpliant.com") && !url.includes("sandbox")) throw new Error("production Pliant");
    if (url.includes("/oauth/token")) return Response.json({ access_token: "test-token", expires_in: 3600 });
    if (url.includes("/organizations")) return Response.json({ data: [{ organizationId: "org-1" }] });
    if (url.includes("/cardholders?")) return Response.json({ data: [{ cardholderId: "holder-1" }] });
    if (url.includes("/cards/available-cards")) {
      return Response.json({ cardConfigs: [{ cardConfig: "PLIANT_SINGLE_USE", canBeIssued: true, type: "SINGLE_USE" }] });
    }
    if (url.includes("/cardholders/holder-1") && method === "GET") return Response.json({ firstName: "Andrea", lastName: "Martin" });
    if (url.includes("/cards/holder-1") && method === "POST") return Response.json({ cardId: "card-agency-1", status: "ACTIVE" });
    if (url.includes("/card-controls") && method === "PUT") return new Response(null, { status: 200 });
    if (url.includes("/card-controls") && method === "GET") return Response.json(emptyPliantCardControls());
    if (url.includes("/card-details/")) {
      return Response.json({ pan: PAN, cvv: "123", expiryMonth: 12, expiryYear: 2030 });
    }
    if (url.includes("/cards/card-agency-1/lock")) return new Response(null, { status: 200 });
    if (url.includes("/v2/hotels/availability")) return Response.json(availability(2));
    if (url.includes("/v2/hotels/bookings") && method === "POST") {
      if (mode === "refuse") return Response.json({ message: "The given data was invalid.", errors: { guest_name: ["refused"] } }, { status: 422 });
      return Response.json(bookingPayload());
    }
    if (url.includes("/v2/hotels/bookings") && method === "GET") return Response.json([]);
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = previous;
    },
  };
}

function withEnv(run: () => Promise<void>) {
  const previous = {
    base: process.env.LITTLE_EMPERORS_API_BASE,
    key: process.env.LITTLE_EMPERORS_API_KEY,
    vercel: process.env.VERCEL_ENV,
    sandbox: process.env.PLIANT_SANDBOX,
    id: process.env.PLIANT_CLIENT_ID,
    secret: process.env.PLIANT_CLIENT_SECRET,
    org: process.env.PLIANT_ORGANIZATION_ID,
    holder: process.env.PLIANT_CARDHOLDER_ID,
    resend: process.env.RESEND_API_KEY,
  };
  process.env.LITTLE_EMPERORS_API_BASE = "https://api-staging.littleemperors.com";
  process.env.LITTLE_EMPERORS_API_KEY = "test-key";
  delete process.env.VERCEL_ENV;
  process.env.PLIANT_SANDBOX = "1";
  process.env.PLIANT_CLIENT_ID = "pliant-test";
  process.env.PLIANT_CLIENT_SECRET = "pliant-secret";
  process.env.PLIANT_ORGANIZATION_ID = "org-1";
  process.env.PLIANT_CARDHOLDER_ID = "holder-1";
  delete process.env.RESEND_API_KEY;
  return run().finally(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("LITTLE_EMPERORS_API_BASE", previous.base);
    restore("LITTLE_EMPERORS_API_KEY", previous.key);
    restore("VERCEL_ENV", previous.vercel);
    restore("PLIANT_SANDBOX", previous.sandbox);
    restore("PLIANT_CLIENT_ID", previous.id);
    restore("PLIANT_CLIENT_SECRET", previous.secret);
    restore("PLIANT_ORGANIZATION_ID", previous.org);
    restore("PLIANT_CARDHOLDER_ID", previous.holder);
    restore("RESEND_API_KEY", previous.resend);
  });
}

function customer() {
  return {
    id: CUSTOMER,
    email: "benjamin@example.com",
    first_name: "Benjamin",
    last_name: "Boukris",
    stripe_customer_id: null,
    hotel_booking_enabled: true,
    hotel_demo: false,
    hotel_direct_live: true,
    hotel_le_api_booking: true,
  };
}

test("l’agence avance le séjour : carte, publication, messages, un seul passage", async () => {
  await withEnv(async () => {
    const { client, tables } = memory();
    const http = installFetch("ok");
    const mails: { to: string; subject: string; text: string }[] = [];
    try {
      const input = {
        customer: customer(),
        offerId: OFFER,
        guests: ["Benjamin Boukris"],
        companions: [["Victoria Boukris"]],
        payMethod: "agency" as const,
        deps: {
          admin: client,
          fetchImpl: globalThis.fetch,
          sendMail: async (mail: { to: string; subject: string; text: string }) => {
            mails.push(mail);
            return true;
          },
        },
      };
      const first = await openDirectStay(input);
      assert.equal(first.ok, true, first.ok ? "" : first.message);
      if (!first.ok || !("view" in first)) return;
      assert.equal(first.view.dossier, "TB-2026-0901");
      const second = await openDirectStay(input);
      assert.equal(second.ok, true);

      const availabilityCall = http.calls.find((call) => call.url.includes("/v2/hotels/availability"));
      const rooms = (availabilityCall?.body as { rooms?: { adults?: number }[] } | null)?.rooms || [];
      assert.equal(rooms[0]?.adults, 2);
      const bookings = http.calls.filter((call) => call.url.includes("/v2/hotels/bookings") && call.method === "POST");
      assert.equal(bookings.length, 1);
      const posted = bookings[0].body as {
        guest_name?: string;
        credit_card?: { number?: string; name?: string };
        rooms?: { guest_name?: string; adults?: number }[];
      };
      assert.equal(posted.guest_name, "Benjamin Boukris");
      assert.equal(posted.rooms?.[0]?.guest_name, "Benjamin Boukris");
      assert.equal(posted.rooms?.[0]?.adults, 2);
      assert.equal(posted.credit_card?.number, PAN);
      assert.equal(posted.credit_card?.name, "Andrea Martin");
      assert.doesNotMatch(JSON.stringify({ guest: posted.guest_name, rooms: posted.rooms }), /Victoria/);

      const issued = http.calls.find((call) => call.url.includes("/cards/holder-1") && call.method === "POST");
      const limit = (issued?.body as { limit?: { value?: number; currency?: string }; cardConfig?: string } | null)?.limit;
      assert.equal(limit?.value, 14274);
      assert.equal(limit?.currency, "EUR");
      assert.equal((issued?.body as { cardConfig?: string } | null)?.cardConfig, "PLIANT_SINGLE_USE");

      const booking = tables.crm_bookings[0];
      const item = tables.crm_booking_items[0];
      assert.equal(booking?.visible_to_client, true);
      assert.equal(booking?.prices_visible, true);
      assert.equal(Number(booking?.total_amount), SALE);
      assert.equal(item?.visible_to_client, true);
      assert.equal(Number(item?.amount), SALE);
      assert.equal((item?.details as { supplier_net?: unknown } | undefined)?.supplier_net, undefined);
      const card = tables.crm_booking_cards[0];
      assert.equal(card?.pliant_card_id, "card-agency-1");
      assert.equal(card?.limit_cents, 14274);
      assert.equal(card?.currency, "EUR");
      const remembered = tables.crm_pliant_cards[0];
      assert.equal(remembered?.ceiling_cents, 14274);
      assert.equal(remembered?.currency, "EUR");
      assert.equal(mails.length, 1);
      assert.match(mails[0].text, /142,74/);
      assert.doesNotMatch(mails[0].text, /Little Emperors|4242/);
      const notices = tables.crm_whatsapp_messages.filter((row) => String(row.dedupe_key || "").startsWith("sejour:"));
      assert.equal(notices.length, 1);
      assert.doesNotMatch(JSON.stringify(tables), new RegExp(PAN));
      assert.equal(http.calls.filter((call) => call.url.includes("/cards/holder-1") && call.method === "POST").length, 1);
    } finally {
      http.restore();
    }
  });
});

test("un refus amont gèle la carte et n’ouvre pas le dossier", async () => {
  await withEnv(async () => {
    const { client, tables } = memory();
    const http = installFetch("refuse");
    try {
      const opened = await openDirectStay({
        customer: customer(),
        offerId: OFFER,
        guests: ["Benjamin Boukris"],
        companions: [[]],
        payMethod: "agency",
        deps: { admin: client, fetchImpl: globalThis.fetch, sendMail: async () => true },
      });
      assert.equal(opened.ok, false);
      if (opened.ok) return;
      assert.match(opened.message, /n’a pas abouti|refusée|voyageur/i);
      assert.doesNotMatch(opened.message, /Little Emperors|4242/);
      assert.equal(tables.crm_bookings.length, 0);
      assert.ok(http.calls.some((call) => call.url.includes("/lock")));
      assert.equal(tables.crm_whatsapp_messages.length, 0);
    } finally {
      http.restore();
    }
  });
});
