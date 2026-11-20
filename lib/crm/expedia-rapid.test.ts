import assert from "node:assert/strict";
import test from "node:test";
import { ExpediaConfigError, loadExpediaConfig, resolveExpediaSalesChannel } from "./expedia/config";
import { parseExpediaContent, parseExpediaRegions } from "./expedia/content-parse";
import { EXPEDIA_TAX_LEGAL_FR } from "./expedia/legal";
import { decimalStringToCents } from "./expedia/money";
import { normalizeExpediaProperty } from "./expedia/normalize";
import { expediaFailureCode, expediaFailureText, ExpediaError } from "./expedia/client";
import { chunkPropertyIds, EXPEDIA_PROPERTY_BATCH } from "./expedia/search";
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

test("le journal d’échec Expedia ne porte ni clé ni URL", () => {
  assert.equal(expediaFailureCode(new ExpediaError("http_403_request_unauthorized", 403)), "http_403_request_unauthorized");
  assert.equal(expediaFailureCode(new Error("timeout")), "timeout");
  assert.equal(expediaFailureText("timeout"), "Expedia n’a pas répondu à temps.");
  assert.equal(expediaFailureText("dns"), "Expedia est injoignable depuis le serveur.");
  assert.equal(expediaFailureText("http_401_request_unauthorized"), "Expedia a refusé l’accès de test.");
  const text = expediaFailureText("http_400_invalid_input");
  assert.equal(text.includes("secret"), false);
  assert.equal(text.includes("http"), false);
  const ids = Array.from({ length: EXPEDIA_PROPERTY_BATCH + 3 }, (_, index) => String(index + 1));
  ids.push("1");
  const chunks = chunkPropertyIds(ids);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, EXPEDIA_PROPERTY_BATCH);
  assert.equal(chunks[1].length, 3);
  assert.equal(chunks[0][0], "1");
});

test("une région Expedia expose ses property_id", () => {
  const regions = parseExpediaRegions({
    regions: [{ id: "1", name: "Paris", type: "city", property_ids: ["10", 11] }],
  });
  assert.deepEqual(regions[0].propertyIds, ["10", "11"]);
  const mapped = parseExpediaRegions({ "1": { id: "1", name: "Paris", property_id: { "12": true } } });
  assert.deepEqual(mapped[0].propertyIds, ["12"]);
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
