import assert from "node:assert/strict";
import test from "node:test";
import { ExpediaConfigError, loadExpediaConfig, resolveExpediaSalesChannel } from "./expedia/config";
import { parseExpediaContent } from "./expedia/content-parse";
import { EXPEDIA_TAX_LEGAL_FR } from "./expedia/legal";
import { decimalStringToCents } from "./expedia/money";
import { normalizeExpediaProperty } from "./expedia/normalize";
import { eanAuthorization, eanSignature } from "./expedia/signature";

const SIGNATURE = "9dc8a27898ae68fd3b0eeb8bf32cc5d43b2de7da0e82ec0039b4d475703fe24194a45b983b3b97d1a4d64f115bd3e37ee371677cddd5627d1d148a223047cae3";

test("signature Expedia : SHA-512 de clé, secret et timestamp", () => {
  assert.equal(eanSignature("key", "secret", 1600000000), SIGNATURE);
  const header = eanAuthorization("key", "secret", 1_600_000_000_000);
  assert.equal(header.timestamp, 1600000000);
  assert.equal(header.authorization, `EAN APIKey=key,Signature=${SIGNATURE},timestamp=1600000000`);
  assert.equal(header.authorization.includes("secret"), false);
});

test("canal de vente : mobile, site client, outil agent, ou valeur forcée", () => {
  assert.equal(resolveExpediaSalesChannel({ mode: "auto", audience: "client", mobile: true }), "mobile_web");
  assert.equal(resolveExpediaSalesChannel({ mode: "auto", audience: "client", mobile: false }), "website");
  assert.equal(resolveExpediaSalesChannel({ mode: "auto", audience: "agent", mobile: false }), "agent_tool");
  assert.equal(resolveExpediaSalesChannel({ mode: "auto", audience: "agent", mobile: true }), "mobile_web");
  assert.equal(resolveExpediaSalesChannel({ mode: "agent_tool", audience: "client", mobile: true }), "agent_tool");
});

test("la configuration refuse la production en preview et une URL qui ne correspond pas", () => {
  assert.throws(
    () => loadExpediaConfig({ EXPEDIA_RAPID_ENV: "production", VERCEL_ENV: "preview", EXPEDIA_RAPID_BASE_URL: "https://api.ean.com/v3" }),
    ExpediaConfigError
  );
  assert.throws(
    () => loadExpediaConfig({ EXPEDIA_RAPID_ENV: "test", EXPEDIA_RAPID_BASE_URL: "https://api.ean.com/v3" }),
    ExpediaConfigError
  );
  const testEnv = loadExpediaConfig({ EXPEDIA_RAPID_ENV: "test", EXPEDIA_RAPID_API_KEY: "key", EXPEDIA_RAPID_SHARED_SECRET: "secret" });
  assert.equal(testEnv.baseUrl, "https://test.ean.com/v3");
  assert.equal(testEnv.testHeader, "standard");
});

test("un montant à plus de deux décimales n’est pas arrondi", () => {
  assert.equal(decimalStringToCents("240.00"), 24000);
  assert.equal(decimalStringToCents("10.5"), 1050);
  assert.equal(decimalStringToCents("10.129"), null);
});

test("normalisation Expedia : total exact, taxes groupées, annulation, sans majoration", () => {
  const content = parseExpediaContent({
    "4242": {
      property_id: "4242",
      name: "Hôtel Ritz Paris",
      address: { line_1: "15 Place Vendôme", city: "Paris", country_code: "FR" },
      ratings: { property: { rating: "5.0", type: "Star" } },
      location: { coordinates: { latitude: 48.86801, longitude: 2.32815 } },
      images: [{ links: { "350px": { href: "https://images.example/ritz.jpg" } } }],
    },
  })[0];
  const rate = normalizeExpediaProperty({
    now: new Date("2026-06-01T12:00:00Z"),
    rooms: [{ adults: 2, children: [] }],
    content,
    property: {
      property_id: "4242",
      rooms: [
        {
          id: "room",
          room_name: "Chambre supérieure",
          rates: [
            {
              id: "rate-a",
              status: "available",
              refundable: true,
              merchant_of_record: "expedia",
              cancel_penalties: [
                { start: "2026-11-01T18:00:00.000+01:00", end: "2026-12-01T18:00:00.000+01:00", currency: "EUR", amount: "100.00" },
              ],
              occupancy_pricing: {
                "2": {
                  nightly: [[{ type: "base_rate", value: "200.00", currency: "EUR" }, { type: "tax_and_service_fee", value: "20.00", currency: "EUR" }, { type: "property_fee", value: "5.00", currency: "EUR" }]],
                  totals: {
                    inclusive: { request_currency: { value: "240.00", currency: "EUR" } },
                    exclusive: { request_currency: { value: "200.00", currency: "EUR" } },
                    inclusive_strikethrough: { request_currency: { value: "260.00", currency: "EUR" } },
                  },
                  fees: { mandatory_tax: { request_currency: { value: "10.00", currency: "EUR" } } },
                },
              },
            },
          ],
        },
      ],
    },
  });
  assert.ok(rate);
  assert.equal(rate.price.totalInclusiveCents, 24000);
  assert.equal(rate.price.totalInclusive, "240.00");
  assert.equal(rate.price.taxesAndServiceFeesCents, 2500);
  assert.equal(rate.price.dueAtPropertyCents, 1000);
  assert.equal(rate.price.strikethroughCents, 26000);
  assert.equal(rate.price.payNowCents, 24000);
  assert.equal(rate.agency.markupCents, 0);
  assert.equal(rate.agency.earningKind, "commission");
  assert.equal(rate.cancellation.refundable, true);
  assert.match(rate.cancellation.text, /Remboursable jusqu’au/);
  assert.equal(rate.payment.merchantOfRecord, "supplier");
  assert.deepEqual(rate.legalLines, [EXPEDIA_TAX_LEGAL_FR]);
  assert.equal(rate.hotel.name, "Hôtel Ritz Paris");
  assert.equal(rate.hotel.stars, 5);
  assert.equal(JSON.stringify(rate).includes("secret"), false);
});
