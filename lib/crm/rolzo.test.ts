import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { CHAUFFEUR_EUR } from "./extras";
import { chauffeurIframeMessage } from "./rolzo-prefill";
import {
  assertNoPaymentFields,
  chauffeurItemFields,
  isRolzoEmailTaken,
  openRolzoSession,
  parseRolzoBooking,
  rolzoApiBase,
  rolzoExternalUrl,
  rolzoSessionBody,
  RolzoError,
} from "./rolzo";

const ENV_KEYS = [
  "ROLZO_API_KEY",
  "ROLZO_API_BASE",
  "ROLZO_WEB_HOST",
  "ROLZO_ALLOW_PRODUCTION",
  "VERCEL_ENV",
] as const;

const previous = new Map<string, string | undefined>();

function rememberEnv() {
  for (const key of ENV_KEYS) previous.set(key, process.env[key]);
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("rolzo staging guard", () => {
  afterEach(() => restoreEnv());

  it("refuse la production Vercel et l’hôte de production sans flag", () => {
    rememberEnv();
    delete process.env.ROLZO_ALLOW_PRODUCTION;
    delete process.env.VERCEL_ENV;
    process.env.ROLZO_API_BASE = "https://rolzo.com/api";
    assert.throws(() => rolzoApiBase(), (err: unknown) => {
      return err instanceof RolzoError && err.code === "production_refused";
    });
    process.env.ROLZO_API_BASE = "https://staging.rolzo.com/api";
    process.env.VERCEL_ENV = "production";
    assert.throws(() => rolzoApiBase(), (err: unknown) => {
      return err instanceof RolzoError && err.code === "vercel_production";
    });
  });

  it("autorise la production seulement avec le flag explicite", () => {
    rememberEnv();
    process.env.VERCEL_ENV = "production";
    process.env.ROLZO_ALLOW_PRODUCTION = "1";
    process.env.ROLZO_API_BASE = "https://api.rolzo.com/api";
    assert.equal(rolzoApiBase(), "https://api.rolzo.com/api");
    process.env.ROLZO_ALLOW_PRODUCTION = "true";
    delete process.env.ROLZO_API_BASE;
    delete process.env.VERCEL_ENV;
    assert.equal(rolzoApiBase(), "https://staging.rolzo.com/api");
    assert.equal(rolzoExternalUrl("api-token"), "https://staging.rolzo.com/api/api/v1/external/api-token");
  });

  it("garde le staging par défaut, y compris l’hôte nu", () => {
    rememberEnv();
    delete process.env.VERCEL_ENV;
    delete process.env.ROLZO_ALLOW_PRODUCTION;
    delete process.env.ROLZO_API_BASE;
    assert.equal(rolzoApiBase(), "https://staging.rolzo.com/api");
    process.env.ROLZO_API_BASE = "https://staging.rolzo.com";
    assert.equal(
      rolzoExternalUrl("booking/multi-stops/abc12345"),
      "https://staging.rolzo.com/api/api/v1/external/booking/multi-stops/abc12345"
    );
  });
});

describe("rolzo session", () => {
  afterEach(() => restoreEnv());

  it("rouvre sans e-mail quand ROLZO répond 212", async () => {
    rememberEnv();
    delete process.env.VERCEL_ENV;
    delete process.env.ROLZO_ALLOW_PRODUCTION;
    process.env.ROLZO_API_KEY = "test-key";
    process.env.ROLZO_API_BASE = "https://staging.rolzo.com/api";
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      bodies.push(body);
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ code: 212, message: "Email belongs to a different company" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: { encodedData: "blob-session" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const encoded = await openRolzoSession(
      {
        first_name: "Ada",
        last_name: "Martin",
        email: "ada@example.com",
        phone: "+33612345678",
      },
      fetchImpl
    );
    assert.equal(encoded, "blob-session");
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].email_address, "ada@example.com");
    assert.equal(bodies[0].first_name, "Ada");
    assert.equal(bodies[0].last_name, "Martin");
    assert.equal(typeof bodies[0].contacts_phone, "string");
    assert.equal("email_address" in bodies[1], false);
    assert.equal(bodies[1].first_name, "Ada");
    assert.equal(isRolzoEmailTaken(400, { error: { code: 212 } }), true);
    assert.equal("paymentCredentials" in bodies[0], false);
    assert.equal("cvc" in bodies[0], false);
  });

  it("n’appelle pas ROLZO sur la production sans flag", async () => {
    rememberEnv();
    process.env.VERCEL_ENV = "production";
    delete process.env.ROLZO_ALLOW_PRODUCTION;
    process.env.ROLZO_API_KEY = "secret-key";
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      return new Response("no");
    };
    await assert.rejects(
      () =>
        openRolzoSession(
          { first_name: "Ada", last_name: "Martin", email: "ada@example.com", phone: null },
          fetchImpl
        ),
      (err: unknown) => err instanceof RolzoError && err.code === "not_configured"
    );
    assert.equal(called, false);
  });

  it("refuse un corps qui contiendrait une carte", () => {
    assert.throws(
      () => assertNoPaymentFields({ paymentCredentials: { cardNumber: "4242", cvc: "123" } }),
      (err: unknown) => err instanceof RolzoError && err.code === "payment_refused"
    );
    const body = rolzoSessionBody({
      first_name: "Ada",
      last_name: "Martin",
      email: "ada@example.com",
      phone: null,
    });
    assert.deepEqual(Object.keys(body).sort(), ["email_address", "first_name", "last_name"]);
  });
});

describe("rolzo price mapping", () => {
  it("écrit le prix renvoyé et laisse le montant vide sinon", () => {
    const priced = chauffeurItemFields({
      view: parseRolzoBooking(
        {
          data: {
            id: "rolzoPrice1",
            status: "confirmed",
            price: 210.5,
            currency: "EUR",
            vehicle: { name: "Berline" },
            driver: { fullName: "Camille Bernard" },
            cancellationPolicy: "Gratuit jusqu’à 24 h avant",
            cancellationFee: 40,
          },
        },
        "rolzoPrice1"
      ),
      leg: "departure",
      place: "home",
      startAt: "2026-10-01T08:00:00",
      visibleToClient: true,
    });
    assert.equal(priced.amount, 210.5);
    assert.equal(priced.details.price, 210.5);
    assert.equal(priced.details.currency, "EUR");
    assert.equal(priced.details.vehicle, "Berline");
    assert.equal(priced.details.driver, "Camille Bernard");
    assert.equal(priced.details.cancellation_policy, "Gratuit jusqu’à 24 h avant");
    assert.equal(priced.details.cancellation_fee, 40);
    assert.equal(priced.supplier, "ROLZO");
    assert.notEqual(priced.amount, CHAUFFEUR_EUR);

    const empty = chauffeurItemFields({
      view: parseRolzoBooking(
        {
          id: "rolzoPrice2",
          status: "confirmed",
          vehicle: "Van",
        },
        "rolzoPrice2"
      ),
      leg: "arrival",
      place: "hotel",
      startAt: null,
      visibleToClient: false,
    });
    assert.equal(empty.amount, null);
    assert.equal(empty.details.price, null);
    assert.equal(empty.details.driver, null);
    assert.notEqual(empty.amount, CHAUFFEUR_EUR);
    assert.equal(JSON.stringify(empty).includes("paymentCredentials"), false);
  });

  it("préremplit l’iframe aéroport sans toucher au VIP", () => {
    const message = chauffeurIframeMessage({
      encodedInfo: "blob",
      reference: "TB-1",
      leg: "departure",
      place: "home",
      airport: "CDG · Paris",
      stayLabel: null,
      whenIso: "2026-10-01T08:00:00",
    });
    assert.equal(message.serviceType, "airport-transfer");
    assert.deepEqual(message.hide, ["team", "earnings"]);
    assert.equal(message.refrenceId, "TB-1-aller");
    assert.equal(message.pickUpLocation, "domicile");
    assert.equal(message.dropOffLocation, "CDG · Paris");
    assert.equal(message.pickUpDate, "2026-10-01T08:00:00Z");
    assert.equal(JSON.stringify(message).includes("vip-meet-and-greet"), false);

    const back = chauffeurIframeMessage({
      encodedInfo: "blob",
      reference: "TB-1",
      leg: "arrival",
      place: "home",
      airport: "ORY · Paris",
      stayLabel: null,
      whenIso: null,
      bookingId: "rolzoPrice2",
    });
    assert.equal(back.bookingId, "rolzoPrice2");
    assert.equal(back.refrenceId, "TB-1-retour");
    assert.equal("serviceType" in back, false);
  });
});
