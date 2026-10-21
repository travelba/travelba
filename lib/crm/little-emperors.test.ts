import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideLittleEmperorsAuto,
  leBookingExtract,
  leItemsForHotelStamp,
  suggestLittleEmperorsBooking,
} from "./little-emperors-match";
import { suggestBookingByReference } from "./email-match";
import { emptyBookingExtract } from "./ingest-types";
import {
  LITTLE_EMPERORS_STAGING_ORIGIN,
  applyHotelPublicFields,
  canRemoteCancel,
  hotelPublicFields,
  isLeCancelled,
  leDateOnly,
  littleEmperorsActionAllowed,
  littleEmperorsApiKey,
  littleEmperorsProductionBlocked,
  listLittleEmperorsBookings,
  littleEmperorsOrigin,
  LITTLE_EMPERORS_PRODUCTION_ORIGIN,
  littleEmperorsWebhookAuthorized,
  littleEmperorsWebhookConfigured,
  parseLeBooking,
  parseLeWebhook,
  splitGuestName,
  webhookKeyMatches,
  LittleEmperorsError,
} from "./little-emperors";
import { createServiceClient } from "../supabase/admin";

const sample = {
  id: 88,
  hotel_id: 9626,
  hotel_name: "Nobu Hotel London Portman Square",
  city: "London",
  address: "22 Portman Square, London W1H 7BG, UK",
  phone: "+44 20 0000 0000",
  email: "hotel@example.com",
  check_in: "2026-11-02",
  check_out: "2026-11-05",
  state: "booked",
  confirmation_number: "LECONF88",
  total_cost: "243.83",
  currency: "GBP",
  is_cancellable: true,
  cancellation_deadline: "2026-10-01 12:00:00",
  rooms: [
    {
      guest_name: "Nico Santos",
      room_type: "Superior Double-Double",
      cancellation_policy: "Free cancellation before 16:00 on 1 Oct",
      benefits: ["Complimentary breakfast"],
      guest_email: "guest@example.com",
    },
  ],
};

describe("little emperors staging client", () => {
  it("appelle l’API de production sur Vercel Production, le staging ailleurs", () => {
    const previousBase = process.env.LITTLE_EMPERORS_API_BASE;
    const previousEnv = process.env.VERCEL_ENV;
    const previousKey = process.env.LITTLE_EMPERORS_API_KEY;
    delete process.env.VERCEL_ENV;
    delete process.env.LITTLE_EMPERORS_API_BASE;
    assert.equal(littleEmperorsProductionBlocked(), false);
    assert.equal(littleEmperorsOrigin(), LITTLE_EMPERORS_STAGING_ORIGIN);
    process.env.LITTLE_EMPERORS_API_BASE = "https://api.littleemperors.com/v2";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "production_refused";
    });
    process.env.LITTLE_EMPERORS_API_BASE = "https://evil.example/v2";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "staging_only";
    });
    process.env.VERCEL_ENV = "preview";
    delete process.env.LITTLE_EMPERORS_API_BASE;
    assert.equal(littleEmperorsOrigin(), LITTLE_EMPERORS_STAGING_ORIGIN);
    process.env.VERCEL_ENV = "production";
    process.env.LITTLE_EMPERORS_API_KEY = "prod-key";
    delete process.env.LITTLE_EMPERORS_API_BASE;
    assert.equal(littleEmperorsProductionBlocked(), false);
    assert.equal(littleEmperorsApiKey(), "prod-key");
    assert.equal(littleEmperorsOrigin(), LITTLE_EMPERORS_PRODUCTION_ORIGIN);
    process.env.LITTLE_EMPERORS_API_BASE = "https://api.littleemperors.com/v2";
    assert.equal(littleEmperorsOrigin(), LITTLE_EMPERORS_PRODUCTION_ORIGIN);
    process.env.LITTLE_EMPERORS_API_BASE = "https://api-staging.littleemperors.com";
    assert.equal(littleEmperorsOrigin(), LITTLE_EMPERORS_STAGING_ORIGIN);
    process.env.LITTLE_EMPERORS_API_BASE = "https://evil.example";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "host_refused";
    });
    process.env.LITTLE_EMPERORS_API_BASE = "https://api.littleemperors.com.evil.com";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "host_refused";
    });
    process.env.LITTLE_EMPERORS_API_BASE = "http://api.littleemperors.com";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "bad_base";
    });
    process.env.LITTLE_EMPERORS_API_BASE = "https://user:secret@api.littleemperors.com";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "bad_base";
    });
    if (previousBase === undefined) delete process.env.LITTLE_EMPERORS_API_BASE;
    else process.env.LITTLE_EMPERORS_API_BASE = previousBase;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousKey === undefined) delete process.env.LITTLE_EMPERORS_API_KEY;
    else process.env.LITTLE_EMPERORS_API_KEY = previousKey;
  });

  it("en production, la lecture est un GET /v2/hotels/bookings", async () => {
    const previousBase = process.env.LITTLE_EMPERORS_API_BASE;
    const previousEnv = process.env.VERCEL_ENV;
    const previousKey = process.env.LITTLE_EMPERORS_API_KEY;
    process.env.VERCEL_ENV = "production";
    process.env.LITTLE_EMPERORS_API_KEY = "prod-key";
    delete process.env.LITTLE_EMPERORS_API_BASE;
    let called = "";
    let method = "";
    let auth = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      called = String(input);
      method = init?.method || "";
      auth = new Headers(init?.headers).get("authorization") || "";
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const rows = await listLittleEmperorsBookings(fetchImpl);
    assert.deepEqual(rows, []);
    assert.equal(called, "https://api.littleemperors.com/v2/hotels/bookings");
    assert.equal(method, "GET");
    assert.equal(auth, "Bearer prod-key");
    if (previousBase === undefined) delete process.env.LITTLE_EMPERORS_API_BASE;
    else process.env.LITTLE_EMPERORS_API_BASE = previousBase;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousKey === undefined) delete process.env.LITTLE_EMPERORS_API_KEY;
    else process.env.LITTLE_EMPERORS_API_KEY = previousKey;
  });

  it("ne garde ni téléphone ni e-mail d’hôtel", () => {
    const booking = parseLeBooking(sample);
    assert.ok(booking);
    assert.equal(booking.hotel_name, "Nobu Hotel London Portman Square");
    assert.equal(booking.address, "22 Portman Square, London W1H 7BG, UK");
    assert.equal(booking.city, "London");
    assert.equal(booking.website, null);
    assert.equal(JSON.stringify(booking).includes("hotel@example.com"), false);
    assert.equal(JSON.stringify(booking).includes("+44"), false);
    assert.equal(JSON.stringify(booking).includes("guest@example.com"), false);
    assert.deepEqual(booking.guest_names, ["Nico Santos"]);
    assert.equal(booking.check_in, "2026-11-02");
    assert.equal(leDateOnly("2026-11-02T00:00:00"), "2026-11-02");
    const hotel = hotelPublicFields({
      name: "Nobu Hotel London Portman Square",
      address: "22 Portman Square",
      location: "London, United Kingdom",
      website: "https://www.nobuhotels.com",
      phone: "+44 20 0000 0000",
      email: "stay@example.com",
    });
    assert.equal(hotel.website, "https://www.nobuhotels.com");
    assert.equal(hotel.location, "London, United Kingdom");
    assert.equal(JSON.stringify(hotel).includes("stay@example.com"), false);
    assert.equal(JSON.stringify(hotel).includes("+44"), false);
    const merged = applyHotelPublicFields(booking, hotel);
    assert.equal(merged.website, "https://www.nobuhotels.com");
    assert.equal(merged.city, "London");
  });

  it("ne fabrique pas de réservation quand la liste répond 400", async () => {
    const previous = process.env.LITTLE_EMPERORS_API_KEY;
    const previousEnv = process.env.VERCEL_ENV;
    delete process.env.VERCEL_ENV;
    const previousBase = process.env.LITTLE_EMPERORS_API_BASE;
    process.env.LITTLE_EMPERORS_API_KEY = "test-key";
    process.env.LITTLE_EMPERORS_API_BASE = LITTLE_EMPERORS_STAGING_ORIGIN;
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "error", message: "Call to a member function bookings() on null" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    await assert.rejects(() => listLittleEmperorsBookings(fetchImpl), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "bookings_null";
    });
    if (previous === undefined) delete process.env.LITTLE_EMPERORS_API_KEY;
    else process.env.LITTLE_EMPERORS_API_KEY = previous;
    if (previousBase === undefined) delete process.env.LITTLE_EMPERORS_API_BASE;
    else process.env.LITTLE_EMPERORS_API_BASE = previousBase;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  });

  it("rapproche par référence unique et n’annule pas en créant un dossier", () => {
    const booking = parseLeBooking(sample);
    assert.ok(booking);
    const suggestion = suggestLittleEmperorsBooking(
      booking,
      [
        {
          id: "b1",
          reference: "TB1",
          title: "Londres",
          destination: "London",
          customer_id: "c1",
          status: "confirmed",
          start_date: "2026-11-02",
          end_date: "2026-11-05",
        },
        {
          id: "b2",
          reference: "TB2",
          title: "Autre",
          destination: "Rome",
          customer_id: "c2",
          status: "confirmed",
          start_date: "2026-11-02",
          end_date: "2026-11-05",
        },
      ],
      new Map([
        ["b1", [{ confirmation_ref: "LECONF88" }]],
        ["b2", [{ confirmation_ref: "AUTRE99" }]],
      ]),
      [
        { id: "c1", first_name: "Nico", last_name: "Santos", company_name: null, email: "nico@example.com" },
        { id: "c2", first_name: "Ada", last_name: "Lovelace", company_name: null, email: "ada@example.com" },
      ]
    );
    assert.equal(suggestion.autoBookingId, "b1");
    const tied = suggestLittleEmperorsBooking(
      booking,
      [
        {
          id: "b1",
          reference: "TB1",
          title: "Londres",
          destination: "London",
          customer_id: "c1",
          status: "confirmed",
          start_date: "2026-11-02",
          end_date: "2026-11-05",
        },
        {
          id: "b2",
          reference: "TB2",
          title: "Londres 2",
          destination: "London",
          customer_id: "c1",
          status: "confirmed",
          start_date: "2026-11-02",
          end_date: "2026-11-05",
        },
      ],
      new Map([
        ["b1", [{ confirmation_ref: "LECONF88" }]],
        ["b2", [{ confirmation_ref: "LECONF88" }]],
      ]),
      [{ id: "c1", first_name: "Nico", last_name: "Santos", company_name: null, email: "nico@example.com" }]
    );
    assert.equal(tied.autoBookingId, null);
    const cancelled = parseLeBooking({ ...sample, state: "cancelled" });
    assert.ok(cancelled);
    assert.equal(isLeCancelled(cancelled.state), true);
    assert.equal(isLeCancelled("booked", "hotel_booking_cancel"), true);
    assert.equal(leBookingExtract(cancelled).document_status, "cancelled");
    const withSite = leBookingExtract({ ...cancelled, website: "https://www.maison-test.example/hotel" });
    assert.equal(withSite.items[0]?.details?.website, "https://www.maison-test.example/hotel");
    assert.equal(withSite.items[0]?.details?.le_hotel_id, cancelled.hotel_id);
    assert.deepEqual(withSite.items[0]?.details?.included, ["Petit-déjeuner offert"]);
    assert.deepEqual(withSite.items[0]?.details?.conditions, ["Free cancellation before 16:00 on 1 Oct"]);
    assert.equal(withSite.items[0]?.details?.rooms?.[0]?.guests, "Nico Santos");
    assert.equal(withSite.items[0]?.details?.rooms?.[0]?.type, "Superior Double-Double");
    assert.equal(JSON.stringify(withSite.items[0]).includes("243.83"), false);
    assert.equal(withSite.items[0]?.details?.phone, undefined);
    assert.equal(withSite.items[0]?.details?.email, undefined);
    assert.equal(canRemoteCancel({ is_cancellable: false }), false);
    assert.equal(canRemoteCancel({ is_cancellable: null }), false);
    assert.equal(splitGuestName("Nico Santos")?.last_name, "Santos");
    assert.equal(splitGuestName("Madonna"), null);
  });

  it("crée le dossier pour une fiche unique et laisse le doute en attente", () => {
    const booking = parseLeBooking(sample);
    assert.ok(booking);
    const nico = {
      id: "c1",
      first_name: "Nico",
      last_name: "Santos",
      company_name: null,
      email: "nico@example.com",
    };
    const unique = decideLittleEmperorsAuto({
      booking,
      suggestion: { autoBookingId: null, candidates: [] },
      customers: [nico],
    });
    assert.deepEqual(unique, { kind: "create", customerId: "c1" });

    const homonyms = decideLittleEmperorsAuto({
      booking,
      suggestion: { autoBookingId: null, candidates: [] },
      customers: [nico, { ...nico, id: "c2", email: "autre@example.com" }],
    });
    assert.equal(homonyms.kind, "wait");

    const nobody = decideLittleEmperorsAuto({
      booking,
      suggestion: { autoBookingId: null, candidates: [] },
      customers: [],
    });
    assert.equal(nobody.kind, "wait");

    const fuzzy = decideLittleEmperorsAuto({
      booking,
      suggestion: { autoBookingId: null, candidates: [] },
      customers: [
        { id: "c9", first_name: "Zoé", last_name: "Santoz", company_name: null, email: "zoe@example.com" },
      ],
    });
    assert.equal(fuzzy.kind, "wait");

    const cancelled = parseLeBooking({ ...sample, state: "cancelled" });
    assert.ok(cancelled);
    assert.equal(
      decideLittleEmperorsAuto({
        booking: cancelled,
        suggestion: { autoBookingId: null, candidates: [] },
        customers: [nico],
      }).kind,
      "wait"
    );
    assert.deepEqual(
      decideLittleEmperorsAuto({
        booking: cancelled,
        suggestion: { autoBookingId: null, candidates: [] },
        customers: [nico],
        linkedBookingId: "b-deja",
      }),
      { kind: "link", bookingId: "b-deja" }
    );

    const tied = decideLittleEmperorsAuto({
      booking,
      suggestion: {
        autoBookingId: null,
        candidates: [
          { booking_id: "b1", customer_id: "c1", label: "TB1", reason: "Référence fournisseur", score: 90 },
          { booking_id: "b2", customer_id: "c1", label: "TB2", reason: "Référence fournisseur", score: 90 },
        ],
      },
      customers: [nico],
    });
    assert.equal(tied.kind, "wait");

    assert.deepEqual(
      decideLittleEmperorsAuto({
        booking,
        suggestion: { autoBookingId: "b-mail", candidates: [] },
        customers: [nico],
      }),
      { kind: "link", bookingId: "b-mail" }
    );
    assert.equal(
      decideLittleEmperorsAuto({
        booking,
        suggestion: { autoBookingId: null, candidates: [] },
        customers: [nico],
        ignored: true,
      }).kind,
      "wait"
    );
    assert.equal(leBookingExtract(booking).customer_email, "");
  });

  it("relie la confirmation du mail et celle de l’API, puis pose l’hôtel", () => {
    const booking = parseLeBooking({ ...sample, confirmation_number: "64570" });
    assert.ok(booking);
    const suggestion = suggestLittleEmperorsBooking(
      booking,
      [
        {
          id: "b-mail",
          reference: "TB9",
          title: "Londres",
          destination: "London",
          customer_id: "c1",
          status: "draft",
          start_date: "2026-11-02",
          end_date: "2026-11-05",
        },
      ],
      new Map([["b-mail", [{ confirmation_ref: "64570SH046795" }]]]),
      [{ id: "c1", first_name: "Nico", last_name: "Santos", company_name: null, email: "nico@example.com" }]
    );
    assert.equal(suggestion.autoBookingId, "b-mail");
    assert.equal(
      decideLittleEmperorsAuto({
        booking,
        suggestion,
        customers: [{ id: "c1", first_name: "Nico", last_name: "Santos", company_name: null, email: "" }],
      }).kind,
      "link"
    );

    const extract = emptyBookingExtract();
    extract.items = [
      {
        kind: "hotel",
        title: "Nobu Hotel London Portman Square",
        supplier: "Little Emperors",
        confirmation_ref: "64570SH046795",
        start_at: "2026-11-02",
        end_at: "2026-11-05",
        amount: null,
        details: {},
      },
    ];
    const fromMail = suggestBookingByReference(
      extract,
      [{ id: "b-api", reference: "TB8", title: "Londres", destination: "London", customer_id: "c1" }],
      new Map([["b-api", [{ confirmation_ref: "64570" }]]])
    );
    assert.equal(fromMail.autoBookingId, "b-api");

    const ids = leItemsForHotelStamp(
      [
        { id: "room", title: "Nobu", confirmation_ref: "64570SH046795", details: { hotel_name: "Nobu Hotel London Portman Square" } },
        { id: "other", title: "Autre hôtel", confirmation_ref: "99999", details: { hotel_name: "Autre hôtel" } },
        { id: "named", title: "Nobu Hotel London Portman Square", confirmation_ref: null, details: {} },
        { id: "wrong", title: "Nobu Hotel London Portman Square", confirmation_ref: null, details: { le_hotel_id: 4 } },
      ],
      { confirmation_number: "64570", hotel_name: "Nobu Hotel London Portman Square", hotel_id: 9626 }
    );
    assert.deepEqual(ids, ["room", "named"]);
  });

  it("la preview enregistre la lecture MyLER, pas les autres secrets", () => {
    const previousEnv = process.env.VERCEL_ENV;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl || "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "preview-service-role";
    assert.throws(() => createServiceClient(), /SUPABASE_SERVICE_ROLE_KEY manquant/);
    assert.doesNotThrow(() => createServiceClient({ allowPreview: true }));
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  });

  it("laisse le partenaire actualiser, pas rattacher ni annuler", () => {
    assert.equal(littleEmperorsActionAllowed("partner", "sync"), true);
    assert.equal(littleEmperorsActionAllowed("partner", "attach"), false);
    assert.equal(littleEmperorsActionAllowed("partner", "cancel"), false);
    assert.equal(littleEmperorsActionAllowed("partner", "init"), false);
    assert.equal(littleEmperorsActionAllowed("agent", "attach"), true);
    assert.equal(littleEmperorsActionAllowed("admin", "cancel"), true);
  });

  it("lit le webhook d’annulation sans inventer de contact", () => {
    const parsed = parseLeWebhook({ event: "hotel_booking_cancel", data: { ...sample, state: "canceled" } });
    assert.equal(parsed?.event, "hotel_booking_cancel");
    assert.equal(parsed?.booking?.state, "canceled");
    assert.equal(parsed?.booking?.website, null);
    assert.equal(webhookKeyMatches("secret", "secret"), true);
    assert.equal(webhookKeyMatches("secret", "autre"), false);
    const headers = new Headers({ "x-access-key": "secret" });
    const previous = process.env.LITTLE_EMPERORS_WEBHOOK_KEY;
    process.env.LITTLE_EMPERORS_WEBHOOK_KEY = "secret";
    assert.equal(littleEmperorsWebhookConfigured(), true);
    assert.equal(littleEmperorsWebhookAuthorized(headers), true);
    process.env.LITTLE_EMPERORS_WEBHOOK_KEY = "autre";
    assert.equal(littleEmperorsWebhookAuthorized(headers), false);
    if (previous === undefined) delete process.env.LITTLE_EMPERORS_WEBHOOK_KEY;
    else process.env.LITTLE_EMPERORS_WEBHOOK_KEY = previous;
    assert.equal(littleEmperorsWebhookConfigured(), Boolean(previous && previous.trim()));
  });
});
