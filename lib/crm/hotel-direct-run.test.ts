import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openDirectStay } from "./hotel-direct-run";
import { emptyPliantCardControls } from "./pliant-controls";

const CUSTOMER = "07b9dde3-de59-4b1a-88b7-03a6e23e98a6";
const OFFER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAN = "4242424242424242";
const NOT_CHARGED = "La réservation n’a pas abouti. Aucun montant n’a été encaissé.";

type Row = Record<string, unknown>;

function memory() {
  const tables: Record<string, Row[]> = {
    crm_customers: [
      {
        id: CUSTOMER,
        email: "benjamin@example.com",
        first_name: "Benjamin",
        last_name: "Boukris",
        company_role: null,
        billing_parent_id: null,
        hotel_booking_enabled: true,
        hotel_demo: false,
        hotel_direct_live: true,
        hotel_le_api_booking: true,
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
    crm_agency_alerts: [],
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
        bucket.push({ id: `${table}-${bucket.length + 1}`, ...state.payload });
        return { data: null, error: null };
      }
      const hits = bucket.filter(matches);
      if (state.op === "update") {
        for (const row of hits) Object.assign(row, state.payload);
      }
      if (single) return { data: hits[0] || null, error: null };
      return { data: hits, error: null };
    }
    return api;
  }
  return {
    client: { from, rpc: async () => ({ data: "TB-2026-0901", error: null }) } as unknown as SupabaseClient,
    tables,
  };
}

function availability() {
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
              total_to_book: 142.74,
              total_to_book_in_requested_currency: 142.74,
              currency_code: "EUR",
              requested_currency_code: "EUR",
              cancellation_deadline: "2026-11-26T18:00:00.000000Z",
              requires_cvc: false,
              payment_description: "No deposit",
              can_cancel: true,
              cancellation_policy: "Free cancellation before 18:00 on 26 November 2026",
              is_tax_included: true,
            },
          ],
        },
      ],
    },
  ];
}

function installFetch(mode: "card-refused" | "name-unread") {
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
    if (url.includes("pliant-test.supabase.co")) {
      if (url.includes("/rpc/crm_claim_integration_refresh")) return Response.json(true);
      if (url.includes("/crm_integrations") && method === "GET") return Response.json([]);
      if (url.includes("/crm_integrations")) return Response.json(null, { status: 201 });
      return Response.json(null);
    }
    if (url.includes("supabase.co")) return previous(input, init);
    if (url.includes("api.littleemperors.com") && !url.includes("api-staging")) throw new Error("production LE");
    if (url.includes("getpliant.com") && !url.includes("sandbox")) throw new Error("production Pliant");
    if (url.includes("/oauth/token")) return Response.json({ access_token: "test-token", expires_in: 3600 });
    if (url.includes("/organizations")) return Response.json({ data: [{ organizationId: "org-1" }] });
    if (url.includes("/cardholders?")) return Response.json({ data: [{ cardholderId: "holder-1" }] });
    if (url.includes("/cards/available-cards")) {
      return Response.json({ cardConfigs: [{ cardConfig: "PLIANT_SINGLE_USE", canBeIssued: true, type: "SINGLE_USE" }] });
    }
    if (url.includes("/cardholders/holder-1") && method === "GET") {
      return Response.json({ errorCode: "VALIDATION", message: "organizationId is required", pan: PAN }, { status: 400 });
    }
    if (url.includes("/cards/holder-1") && method === "POST") {
      if (mode === "card-refused") return Response.json({ message: "cardholder not active", pan: PAN }, { status: 400 });
      return Response.json({ cardId: "card-agency-1", status: "ACTIVE" });
    }
    if (url.includes("/card-controls") && method === "PUT") return new Response(null, { status: 200 });
    if (url.includes("/card-controls") && method === "GET") return Response.json(emptyPliantCardControls());
    if (url.includes("/card-details/")) return Response.json({ pan: PAN, cvv: "123", expiryMonth: 12, expiryYear: 2030 });
    if (url.includes("/v2/hotels/availability")) return Response.json(availability());
    if (url.includes("/v2/hotels/bookings") && method === "POST") {
      return Response.json({
        id: 9001,
        confirmation_number: "STG9001",
        hotel_id: 15,
        state: "confirmed",
        currency: "EUR",
        is_cancellable: true,
        cancellation_deadline: "2026-11-26T18:00:00.000000Z",
      });
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
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.LITTLE_EMPERORS_API_BASE = "https://api-staging.littleemperors.com";
  process.env.LITTLE_EMPERORS_API_KEY = "test-key";
  delete process.env.VERCEL_ENV;
  process.env.PLIANT_SANDBOX = "1";
  process.env.PLIANT_CLIENT_ID = "pliant-test";
  process.env.PLIANT_CLIENT_SECRET = "pliant-secret";
  process.env.PLIANT_ORGANIZATION_ID = "org-1";
  process.env.PLIANT_CARDHOLDER_ID = "holder-1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://pliant-test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
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
    restore("NEXT_PUBLIC_SUPABASE_URL", previous.supabaseUrl);
    restore("SUPABASE_SERVICE_ROLE_KEY", previous.serviceRole);
  });
}

function customer() {
  return {
    id: CUSTOMER,
    email: "benjamin@example.com",
    first_name: "Benjamin",
    last_name: "Boukris",
    hotel_booking_enabled: true,
    hotel_demo: false,
    hotel_direct_live: true,
    hotel_le_api_booking: true,
  };
}

describe("carte d’agence Little Emperors", { concurrency: 1 }, () => {
  test("GET porteur 400 et émission refusée : séjour annulé, rien n’est soumis, le client n’est pas débité", async () => {
    await withEnv(async () => {
      const { client, tables } = memory();
      const http = installFetch("card-refused");
      try {
        const opened = await openDirectStay({
          customer: customer(),
          offerId: OFFER,
          guests: ["Benjamin Boukris"],
          companions: [[]],
          payMethod: "agency",
          deps: { admin: client, fetchImpl: globalThis.fetch, sendMail: async () => false },
        });
        assert.equal(opened.ok, false);
        if (opened.ok) return;
        assert.equal(opened.message, NOT_CHARGED);
        const bookings = http.calls.filter((call) => call.url.includes("/v2/hotels/bookings") && call.method === "POST");
        assert.equal(bookings.length, 0);
        assert.ok(http.calls.some((call) => call.url.includes("/cards/holder-1") && call.method === "POST"));
        const stay = tables.crm_hotel_direct_stays[0];
        assert.equal(stay?.phase, "cancelled");
        const reason = String((stay?.state as { reason?: string } | undefined)?.reason || "");
        assert.match(reason, /^Carte: /);
        assert.match(reason, /émission refusée/);
        assert.match(reason, /porteur illisible/);
        assert.equal(reason.includes(PAN), false);
        const alert = tables.crm_agency_alerts[0];
        assert.equal(alert?.kind, "pliant");
        assert.match(String(alert?.summary || ""), /Carte: /);
        assert.equal(JSON.stringify(tables.crm_agency_alerts).includes(PAN), false);
        assert.equal(JSON.stringify(tables.crm_hotel_direct_events || []).includes(PAN), false);
      } finally {
        http.restore();
      }
    });
  });

  test("nom illisible mais carte émise : la réservation Little Emperors part", async () => {
    await withEnv(async () => {
      const { client, tables } = memory();
      const http = installFetch("name-unread");
      try {
        const opened = await openDirectStay({
          customer: customer(),
          offerId: OFFER,
          guests: ["Benjamin Boukris"],
          companions: [[]],
          payMethod: "agency",
          deps: { admin: client, fetchImpl: globalThis.fetch, sendMail: async () => false },
        });
        assert.equal(opened.ok, true, opened.ok ? "" : opened.message);
        const bookings = http.calls.filter((call) => call.url.includes("/v2/hotels/bookings") && call.method === "POST");
        assert.equal(bookings.length, 1);
        const posted = bookings[0]?.body as { credit_card?: { name?: string; number?: string; cvc?: string } };
        assert.equal(posted.credit_card?.name, "Travelba");
        assert.equal(posted.credit_card?.number, PAN);
        assert.equal(posted.credit_card?.cvc, "123");
        const issued = http.calls.find((call) => call.url.includes("/cards/holder-1") && call.method === "POST");
        assert.equal((issued?.body as { customFirstName?: string } | null)?.customFirstName, undefined);
        const stay = tables.crm_hotel_direct_stays[0];
        assert.notEqual(stay?.phase, "cancelled");
        assert.equal(String((stay?.state as { reason?: string } | undefined)?.reason || "").startsWith("Carte:"), false);
      } finally {
        http.restore();
      }
    });
  });
});
