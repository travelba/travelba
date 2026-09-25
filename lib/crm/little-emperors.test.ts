import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestLittleEmperorsBooking, leBookingExtract } from "./little-emperors-match";
import {
  LITTLE_EMPERORS_STAGING_ORIGIN,
  applyHotelPublicFields,
  canRemoteCancel,
  hotelPublicFields,
  isLeCancelled,
  leDateOnly,
  listLittleEmperorsBookings,
  littleEmperorsOrigin,
  littleEmperorsWebhookAuthorized,
  parseLeBooking,
  parseLeWebhook,
  splitGuestName,
  webhookKeyMatches,
  LittleEmperorsError,
} from "./little-emperors";

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
  it("refuse l’API de production et Vercel production", () => {
    const previousBase = process.env.LITTLE_EMPERORS_API_BASE;
    const previousEnv = process.env.VERCEL_ENV;
    process.env.LITTLE_EMPERORS_API_BASE = "https://api.littleemperors.com/v2";
    delete process.env.VERCEL_ENV;
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "production_refused";
    });
    process.env.LITTLE_EMPERORS_API_BASE = LITTLE_EMPERORS_STAGING_ORIGIN;
    process.env.VERCEL_ENV = "production";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "vercel_production";
    });
    if (previousBase === undefined) delete process.env.LITTLE_EMPERORS_API_BASE;
    else process.env.LITTLE_EMPERORS_API_BASE = previousBase;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
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
    assert.equal(withSite.items[0]?.details?.phone, undefined);
    assert.equal(withSite.items[0]?.details?.email, undefined);
    assert.equal(canRemoteCancel({ is_cancellable: false }), false);
    assert.equal(canRemoteCancel({ is_cancellable: null }), false);
    assert.equal(splitGuestName("Nico Santos")?.last_name, "Santos");
    assert.equal(splitGuestName("Madonna"), null);
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
    assert.equal(littleEmperorsWebhookAuthorized(headers), true);
    process.env.LITTLE_EMPERORS_WEBHOOK_KEY = "autre";
    assert.equal(littleEmperorsWebhookAuthorized(headers), false);
    if (previous === undefined) delete process.env.LITTLE_EMPERORS_WEBHOOK_KEY;
    else process.env.LITTLE_EMPERORS_WEBHOOK_KEY = previous;
  });
});
