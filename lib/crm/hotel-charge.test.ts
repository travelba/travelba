import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { existsSync } from "node:fs";
import { chargeStayInBrowser, localChargeChrome } from "./hotel-charge-browser";
import {
  adyenCheckoutHtml,
  paidHtml,
  stripeCheckoutHtml,
  threeDsHtml,
  worldpayCheckoutHtml,
} from "./hotel-charge-fixtures";
import { readCheckoutHtml } from "./hotel-charge-page";
import { runChargeSession, type ChargeFill } from "./hotel-auto";
import { runDueHotelCharge } from "./hotel-charge-run";

const PAN = "4242424242424242";
const STAY = 73190;

function fillFrom(html: string, url: string): ChargeFill & { filled: boolean } {
  const state = { html, filled: false };
  const page: ChargeFill & { filled: boolean } = {
    filled: false,
    async url() {
      return url;
    },
    async text() {
      return readCheckoutHtml(state.html, url).text;
    },
    async amount() {
      const view = readCheckoutHtml(state.html, url);
      return { cents: view.amountCents, currency: view.currency };
    },
    async hasCardFields() {
      return readCheckoutHtml(state.html, url).hasCardFields;
    },
    async fill() {
      state.filled = true;
      page.filled = true;
    },
    async submit() {
      state.html = paidHtml();
    },
    async clearSecrets() {},
    async screenshot() {
      return new Uint8Array([1]);
    },
  };
  return page;
}

test("Stripe, Adyen et Worldpay : le montant juste est payé, l’écart et la 3DS non", async () => {
  for (const html of [stripeCheckoutHtml("731,90 EUR"), adyenCheckoutHtml("€731.90"), worldpayCheckoutHtml("731,90 EUR")]) {
    const page = fillFrom(html, "https://pay.hotel.test/checkout");
    const result = await runChargeSession(page, { pan: PAN, expiry: "12/30", cvc: "123" }, { stayCents: STAY, ceilingCents: STAY });
    assert.equal(result.status, "submitted");
    assert.equal(page.filled, true);
    assert.equal(JSON.stringify(result).includes(PAN), false);
  }
  const wrong = fillFrom(stripeCheckoutHtml("100,00 EUR"), "https://pay.hotel.test/checkout");
  const mismatch = await runChargeSession(wrong, { pan: PAN, expiry: "12/30", cvc: "123" }, { stayCents: STAY, ceilingCents: STAY });
  assert.equal(mismatch.status, "needs_agent");
  assert.equal(mismatch.reason, "montant");
  assert.equal(wrong.filled, false);
  const secure = fillFrom(threeDsHtml(), "https://pay.hotel.test/3ds");
  const stopped = await runChargeSession(secure, { pan: PAN, expiry: "12/30", cvc: "123" }, { stayCents: STAY, ceilingCents: STAY });
  assert.equal(stopped.reason, "3ds");
  assert.equal(secure.filled, false);
});

test("un débit déjà là ne rouvre pas la page, une page inconnue reprend", async () => {
  const jobs: Record<string, unknown>[] = [
    {
      id: "job-1",
      booking_id: "booking-1",
      arrival_id: "arrival-1",
      payment_url: "https://pay.hotel.test/1",
      amount_cents: STAY,
      card_limit_cents: STAY,
      pliant_card_id: "card-1",
      attempts: 0,
      status: "queued",
      claimed_at: null,
      next_attempt_at: null,
    },
  ];
  let opened = 0;
  const admin = memory(jobs);
  const paid = await runDueHotelCharge(admin, {
    workerEnabled: true,
    debits: async () => [{ cardId: "card-1", status: "CONFIRMED", billingCents: STAY, billingCurrency: "EUR" }],
    charge: async () => {
      opened += 1;
      return { status: "submitted", reason: null, note: "", screenshot: null };
    },
    readCard: async () => ({ pan: PAN, expiry: "12/30", cvc: "123" }),
    lock: async () => undefined,
  });
  assert.equal(paid.status, "paid");
  assert.equal(opened, 0);

  jobs[0] = { ...jobs[0], id: "job-1", status: "queued", attempts: 0, pliant_card_id: "card-1" };
  const again = await runDueHotelCharge(admin, {
    workerEnabled: true,
    debits: async () => [],
    charge: async () => ({ status: "needs_agent", reason: "page", note: "La confirmation n’est pas apparue.", screenshot: null }),
    readCard: async () => ({ pan: PAN, expiry: "12/30", cvc: "123" }),
  });
  assert.equal(again.status, "queued");
  assert.equal(String(jobs[0]?.status), "queued");
  assert.equal(JSON.stringify(jobs).includes(PAN), false);
});

test("maquettes ouvertes dans Chrome, sans prestataire", { skip: localChargeChrome().length === 0 && !existsSync("/usr/bin/google-chrome") }, async () => {
  const pages = new Map<string, string>([
    ["/stripe", stripeCheckoutHtml("731,90 EUR")],
    ["/adyen", adyenCheckoutHtml("731,90 EUR")],
    ["/worldpay", worldpayCheckoutHtml("731,90 EUR")],
    ["/3ds", threeDsHtml()],
  ]);
  const server = createServer((req, res) => {
    const html = req.method === "POST" ? paidHtml() : pages.get(req.url || "") || paidHtml();
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address && typeof address === "object" ? address.port : 0;
  try {
    const ok = await chargeStayInBrowser({
      url: `http://127.0.0.1:${port}/stripe`,
      secrets: { pan: PAN, expiry: "12/30", cvc: "123" },
      stayCents: STAY,
      ceilingCents: STAY,
    });
    assert.equal(ok.status, "submitted");
    assert.equal(JSON.stringify(ok).includes(PAN), false);
    const secure = await chargeStayInBrowser({
      url: `http://127.0.0.1:${port}/3ds`,
      secrets: { pan: PAN, expiry: "12/30", cvc: "123" },
      stayCents: STAY,
      ceilingCents: STAY,
    });
    assert.equal(secure.reason, "3ds");
    assert.equal(JSON.stringify(secure).includes(PAN), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

function memory(jobs: Record<string, unknown>[]) {
  const tables: Record<string, Record<string, unknown>[]> = {
    crm_hotel_charge_jobs: jobs,
    crm_hotel_arrivals: [],
    crm_agency_alerts: [],
    crm_agency_journal: [],
  };
  return {
    from(table: string) {
      const state = { op: "select" as "select" | "update", payload: {} as Record<string, unknown>, filters: [] as { col: string; val: unknown }[] };
      const api = {
        select() {
          return api;
        },
        update(payload: Record<string, unknown>) {
          state.op = "update";
          state.payload = payload;
          return api;
        },
        insert(payload: Record<string, unknown>) {
          (tables[table] ||= []).push(payload);
          return api;
        },
        eq(col: string, val: unknown) {
          state.filters.push({ col, val });
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
        selectAfter() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve(run(true));
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(run(false)).then(resolve);
        },
      };
      function run(single: boolean) {
        const bucket = tables[table] || [];
        const hits = bucket.filter((row) => state.filters.every((filter) => row[filter.col] === filter.val));
        if (state.op === "update") {
          for (const row of hits) Object.assign(row, state.payload);
          return { data: single ? hits[0] || null : hits, error: null };
        }
        return { data: single ? hits[0] || null : hits, error: null };
      }
      return api;
    },
  };
}
