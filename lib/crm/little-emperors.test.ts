import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestLittleEmperorsBooking, leBookingExtract, planLeCarnetWrite, LE_HOLD } from "./little-emperors-match";
import {
  LITTLE_EMPERORS_STAGING_ORIGIN,
  applyHotelPublicFields,
  canRemoteCancel,
  hotelPublicFields,
  isLeCancelled,
  leDateOnly,
  littleEmperorsActionAllowed,
  listLittleEmperorsBookings,
  leBookBody,
  littleEmperorsApiKey,
  littleEmperorsOrigin,
  littleEmperorsProductionBlocked,
  littleEmperorsWidgetUrl,
  parseLeFilters,
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
  it("la production appelle l’API de production, le reste reste sur le staging", () => {
    const previousBase = process.env.LITTLE_EMPERORS_API_BASE;
    const previousEnv = process.env.VERCEL_ENV;
    const previousKey = process.env.LITTLE_EMPERORS_API_KEY;
    delete process.env.VERCEL_ENV;
    process.env.LITTLE_EMPERORS_API_BASE = "https://api.littleemperors.com/v2";
    assert.throws(() => littleEmperorsOrigin(), (err: unknown) => {
      return err instanceof LittleEmperorsError && err.code === "production_refused";
    });
    process.env.LITTLE_EMPERORS_API_BASE = LITTLE_EMPERORS_STAGING_ORIGIN;
    assert.equal(littleEmperorsOrigin(), LITTLE_EMPERORS_STAGING_ORIGIN);
    process.env.VERCEL_ENV = "production";
    process.env.LITTLE_EMPERORS_API_KEY = "prod-key";
    assert.equal(littleEmperorsOrigin(), "https://api.littleemperors.com");
    assert.equal(littleEmperorsApiKey(), "prod-key");
    assert.equal(littleEmperorsProductionBlocked(), false);
    assert.equal(
      littleEmperorsWidgetUrl("S3SS10N"),
      "https://api.littleemperors.com/widgets/credit-card?session_id=S3SS10N"
    );
    assert.equal(littleEmperorsWidgetUrl("bad id"), null);
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
    assert.equal(booking.rooms[0]?.room_type, "Superior Double-Double");
    assert.deepEqual(booking.rooms[0]?.benefits, ["Complimentary breakfast"]);
    assert.equal(booking.rooms[0]?.deposit_policy, null);
    assert.equal(leBookingExtract(booking).document_status, "confirmed");
    assert.equal(leBookingExtract(booking).items[0]?.amount, null);
    assert.equal(leBookingExtract(booking).items[0]?.details?.le_total_cost, "243.83");
    assert.equal(leBookingExtract(booking).total_amount, null);
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
    assert.deepEqual(withSite.items[0]?.details?.included, ["Petit-déjeuner offert"]);
    assert.equal(withSite.items[0]?.details?.phone, undefined);
    assert.equal(withSite.items[0]?.details?.email, undefined);
    assert.equal(canRemoteCancel({ is_cancellable: false }), false);
    assert.equal(canRemoteCancel({ is_cancellable: null }), false);
    assert.equal(splitGuestName("Nico Santos")?.last_name, "Santos");
    assert.equal(splitGuestName("Madonna"), null);
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
    assert.equal(littleEmperorsActionAllowed("partner", "search"), false);
    assert.equal(littleEmperorsActionAllowed("partner", "book"), false);
    assert.equal(littleEmperorsActionAllowed("agent", "quote"), true);
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

  it("garde le détail de chambre et ne met pas le coût fournisseur au prix vendu", () => {
    const booking = parseLeBooking({
      ...sample,
      eta: "18",
      latitude: "51.51",
      longitude: "-0.15",
      rooms: [
        {
          id: 3,
          guest_name: "Nico Santos",
          guest_email: "guest@example.com",
          room_type: "Deluxe King",
          adults: 2,
          children: [{ age: 7, name: "Lou" }],
          cancellation_policy: "Free cancellation before 16:00 on 1 Oct",
          deposit_policy: "No deposit required at time of booking.",
          total_cost: 240,
          benefits: ["Complimentary breakfast", "$100 hotel credit per stay"],
          additional_benefits: ["Free Wi-Fi"],
          benefits_footnotes: ["*subject to availability"],
          public_inclusions: ["20% off spa treatments"],
          rate_title: ["Best Available Rate"],
          has_upgrade_benefit: true,
          eta: "18",
          images: [{ url: "https://cdn.example/room.jpg" }],
        },
      ],
    });
    assert.ok(booking);
    assert.equal(booking.eta, "18");
    assert.equal(booking.rooms[0]?.adults, 2);
    assert.equal(booking.rooms[0]?.children[0]?.name, "Lou");
    assert.equal(JSON.stringify(booking).includes("guest@example.com"), false);
    const extract = leBookingExtract(booking);
    const details = extract.items[0]?.details;
    assert.equal(details?.le_total_cost, "243.83");
    assert.equal(extract.items[0]?.amount, null);
    assert.equal(details?.included?.includes("Petit-déjeuner offert"), true);
    assert.equal(details?.included?.includes("Crédit hôtel de 100 $ par séjour"), true);
    assert.equal(details?.included?.includes("Free Wi-Fi"), true);
    assert.equal(details?.included?.includes("20% off spa treatments"), true);
    assert.deepEqual(details?.benefit_footnotes, ["*subject to availability"]);
    assert.equal(details?.deposit_policy, "No deposit required at time of booking.");
    assert.equal(details?.rooms?.[0]?.guests?.includes("Lou"), true);
    assert.equal(details?.room, "Deluxe King");
    assert.deepEqual(
      parseLeFilters({
        wellness: [{ id: 4, name: "Spa" }, { id: "x", name: "Ignoré" }],
        activities: [{ id: 2, name: "Ski" }],
      }),
      { wellness: [{ id: 4, name: "Spa" }], activities: [{ id: 2, name: "Ski" }] }
    );
    assert.equal(details?.image, "https://cdn.example/room.jpg");
    const body = leBookBody({
      start_date: "2026-11-02",
      end_date: "2026-11-05",
      session_id: "S3SS10N",
      rate_index: "A2C",
      hotel_id: 1,
      guest_name: "Nico Santos",
      guest_email: "nico@example.com",
      rooms: [{ adults: 2, children: [{ age: 7 }] }],
    });
    assert.equal(JSON.stringify(body).includes("credit_card"), false);
    assert.equal(JSON.stringify(body).includes("cvc"), false);
    assert.equal(body.rooms[0]?.send_email_to_guest, false);
    const held = planLeCarnetWrite({
      booking,
      autoBookingId: null,
      candidates: [
        { booking_id: "b1", customer_id: "c1", reason: "Même client, même destination", score: 40 },
        { booking_id: "b2", customer_id: "c1", reason: "Même client, même destination", score: 40 },
      ],
      linked: null,
      items: null,
      namedCustomerIds: [],
    });
    assert.equal(held.kind, "hold");
    if (held.kind === "hold") assert.equal(held.message, LE_HOLD.same_stay);
    const created = planLeCarnetWrite({
      booking,
      autoBookingId: null,
      candidates: [],
      linked: null,
      items: null,
      namedCustomerIds: [],
    });
    assert.equal(created.kind, "create_customer");
    const failed = planLeCarnetWrite({
      booking: { ...booking, state: "failed" },
      autoBookingId: null,
      candidates: [],
      linked: null,
      items: null,
      namedCustomerIds: [],
    });
    assert.equal(failed.kind, "hold");
    if (failed.kind === "hold") assert.equal(failed.message, LE_HOLD.unconfirmed);
  });
});
