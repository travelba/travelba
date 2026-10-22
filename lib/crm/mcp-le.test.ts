import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guestNameMatches, leLookup, presentLeReservation, readReservationLittleEmperors, selectLeReservations, type LeCandidate } from "./mcp-le";
import { parseLeBooking, type LeBooking } from "./little-emperors";
import { McpReadError } from "./mcp-passport";

const DOSSIER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

function booking(patch: Partial<LeBooking> = {}): LeBooking {
  return {
    id: 90,
    hotel_id: 44,
    hotel_name: "La Mamounia",
    city: "Marrakech",
    address: "Avenue Bab Jdid",
    website: null,
    check_in: "2026-12-02",
    check_out: "2026-12-06",
    state: "booked",
    confirmation_number: "64570SH046795",
    total_cost: "12000",
    currency: "MAD",
    public_price: "15000",
    public_currency: "MAD",
    board: "Petit-déjeuner",
    hotel_confirmations: ["H998877"],
    is_cancellable: true,
    cancellation_deadline: "2026-11-01",
    guest_names: ["Camille Martin"],
    cancellation_policies: ["Free cancellation before 1 Nov"],
    room_types: ["Suite"],
    benefits: ["Complimentary breakfast"],
    ...patch,
  };
}

function candidate(patch: Partial<LeBooking> = {}, extra: Partial<LeCandidate> = {}): LeCandidate {
  return { booking: booking(patch), crmBookingId: DOSSIER, source: "enregistree", ...extra };
}

test("le nom et l’hôtel rapprochent, y compris Milano et un nom proche", () => {
  assert.equal(guestNameMatches("Camille Martin", "Martin"), true);
  assert.equal(guestNameMatches("Nico Santos", "Santos"), true);
  assert.equal(guestNameMatches("Camille Martin", "Bernard"), false);
  const rows = [
    candidate(),
    candidate({ id: 91, hotel_name: "Nobu Hotel London", confirmation_number: "LE91", guest_names: ["Nico Santos"] }),
  ];
  assert.equal(selectLeReservations(rows, { confirmation: null, nom: "Martin", hotel: "Mamounia", arrivee: null, depart: null }).length, 1);
  assert.equal(selectLeReservations(rows, { confirmation: "64570", nom: null, hotel: null, arrivee: null, depart: null }).length, 1);
  assert.equal(
    selectLeReservations(rows, { confirmation: null, nom: "Martin", hotel: "Mamounia", arrivee: "2026-12-02", depart: "2026-12-06" }).length,
    1
  );
  assert.equal(
    selectLeReservations(rows, { confirmation: null, nom: "Martin", hotel: "Mamounia", arrivee: "2026-01-01", depart: null }).length,
    0
  );
  assert.throws(() => leLookup({}), /nom du client et l’hôtel/);
  assert.throws(() => leLookup({ nom: "Martin" }), /nom du client et l’hôtel/);
});

test("la vue ne met pas le net à la place du public, et nomme le dossier déjà lié", () => {
  const view = presentLeReservation(booking(), { id: DOSSIER, reference: "TB-2026-0090", titre: "Marrakech" }, { source: "api" });
  assert.equal(view.reference, "64570SH046795");
  assert.equal(view.statut, "Réservée");
  assert.equal(view.hotel, "La Mamounia");
  assert.equal(view.ville, "Marrakech");
  assert.equal(view.arrivee, "2026-12-02");
  assert.equal(view.depart, "2026-12-06");
  assert.equal(view.regime, "Petit-déjeuner");
  assert.deepEqual(view.voyageurs, ["Camille Martin"]);
  assert.equal(view.prix_net, 12000);
  assert.equal(view.devise_net, "MAD");
  assert.equal(view.prix_public, 15000);
  assert.equal(view.devise_public, "MAD");
  assert.deepEqual(view.avantages, ["Petit-déjeuner offert"]);
  assert.deepEqual(view.conditions_annulation, ["Free cancellation before 1 Nov"]);
  assert.deepEqual(view.confirmations_hotel, ["H998877"]);
  assert.equal(view.chambres[0]?.type, "Suite");
  assert.equal(view.dossier?.reference, "TB-2026-0090");
});

type Row = Record<string, unknown>;

function jsonContains(hay: unknown, needle: unknown): boolean {
  if (Array.isArray(needle)) {
    return Array.isArray(hay) && needle.every((item) => hay.some((candidate) => jsonContains(candidate, item)));
  }
  if (needle && typeof needle === "object") {
    if (!hay || typeof hay !== "object" || Array.isArray(hay)) return false;
    return Object.entries(needle as Record<string, unknown>).every(([key, value]) =>
      jsonContains((hay as Record<string, unknown>)[key], value)
    );
  }
  return hay === needle;
}

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return api;
      },
      or(expr: string) {
        const tokens = [...expr.matchAll(/%([^%]+)%/g)].map((match) => match[1].toLowerCase());
        filters.push((row) => {
          const blob = JSON.stringify({ confirmation_ref: row.confirmation_ref, details: row.details }).toLowerCase();
          return tokens.some((token) => blob.includes(token));
        });
        return api;
      },
      contains(column: string, value: unknown) {
        filters.push((row) => jsonContains(row[column], value));
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data: rows[0] || null, error: rows.length > 1 ? { code: "PGRST116" } : null });
      },
      then(resolve: (value: { data: Row[]; error: null }) => void) {
        const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return api;
  }
  return { from } as unknown as SupabaseClient;
}

test("une réservation déjà rattachée se lit par référence ou par nom", async () => {
  const stored = {
    le_booking_id: 90,
    confirmation_number: "64570SH046795",
    state: "booked",
    hotel_id: 44,
    hotel_name: "La Mamounia",
    city: "Marrakech",
    address: "Avenue Bab Jdid",
    check_in: "2026-12-02",
    check_out: "2026-12-06",
    currency: "MAD",
    total_cost: "12000",
    guest_names: ["Camille Martin"],
    room_types: ["Suite"],
    cancellation_policies: ["Free cancellation before 1 Nov"],
    crm_booking_id: DOSSIER,
    status: "linked",
    raw: {
      id: 90,
      benefits: ["Complimentary breakfast"],
      board: "Petit-déjeuner",
      public_price: "15000",
      public_currency: "MAD",
      hotel_confirmations: ["H998877"],
    },
  };
  const fresh = parseLeBooking({
    id: 90,
    hotel_name: "La Mamounia",
    city: "Marrakech",
    confirmation_number: "64570SH046795",
    state: "confirmed",
    total_cost: "12000",
    currency: "MAD",
    public_price: "15000",
    check_in: "2026-12-02",
    check_out: "2026-12-06",
    rooms: [
      {
        guest_name: "Camille Martin",
        room_type: "Suite",
        board: "Demi-pension",
        hotel_confirmation: "H998877",
        benefits: ["Complimentary breakfast"],
      },
    ],
  });
  assert.ok(fresh);
  const admin = memoryAdmin({
    crm_le_bookings: [stored, { ...stored, le_booking_id: 91, confirmation_number: "LE91", hotel_name: "Nobu Hotel London", guest_names: ["Nico Santos"], crm_booking_id: null, status: "unmatched" }],
    crm_bookings: [{ id: DOSSIER, reference: "TB-2026-0090", title: "Marrakech" }],
    crm_booking_items: [],
  });
  const byRef = await readReservationLittleEmperors(
    { confirmation: "64570" },
    admin,
    { listBookings: async () => [fresh] }
  );
  assert.equal(byRef.statut, "Réservée");
  assert.equal(byRef.regime, "Demi-pension");
  assert.equal(byRef.prix_net, 12000);
  assert.equal(byRef.prix_public, 15000);
  assert.equal(byRef.dossier?.id, DOSSIER);
  assert.equal(byRef.dossier?.reference, "TB-2026-0090");
  assert.equal(byRef.source, "api");
  assert.deepEqual(byRef.confirmations_hotel, ["H998877"]);

  const byName = await readReservationLittleEmperors(
    { nom: "Camille Martin", hotel: "Mamounia", arrivee: "2026-12-02" },
    admin,
    { listBookings: async () => [fresh] }
  );
  assert.equal(byName.reference, "64570SH046795");
  assert.equal(byName.dossier?.reference, "TB-2026-0090");

  await assert.rejects(
    () => readReservationLittleEmperors({ nom: "Martin", hotel: "Hotel" }, admin, { listBookings: async () => [fresh] }),
    (err: unknown) => err instanceof McpReadError && /Aucune réservation/.test(err.message)
  );
});

test("sans lien Little Emperors, la carte hôtel du dossier suffit", async () => {
  const admin = memoryAdmin({
    crm_le_bookings: [
      {
        le_booking_id: 90,
        confirmation_number: "64570SH046795",
        state: "cancelled",
        hotel_name: "La Mamounia",
        city: "Marrakech",
        check_in: "2026-12-02",
        check_out: "2026-12-06",
        currency: "EUR",
        total_cost: "400",
        guest_names: ["Camille Martin"],
        room_types: [],
        cancellation_policies: [],
        crm_booking_id: null,
        status: "unmatched",
        raw: { id: 90, benefits: [] },
      },
    ],
    crm_bookings: [
      { id: DOSSIER, reference: "TB-2026-0090", title: "Marrakech" },
      { id: OTHER, reference: "TB-2026-0091", title: "Autre" },
    ],
    crm_booking_items: [
      { booking_id: DOSSIER, kind: "hotel", confirmation_ref: "64570", details: { rooms: [{ confirmation_ref: "H998877" }] } },
    ],
  });
  const view = await readReservationLittleEmperors({ confirmation: "H998877" }, admin, { listBookings: async () => [] });
  assert.equal(view.statut, "Annulée");
  assert.equal(view.dossier?.reference, "TB-2026-0090");
  assert.equal(view.prix_net, 400);
  assert.equal(view.prix_public, null);
});

test("deux réservations ne sont pas choisies", async () => {
  const row = {
    le_booking_id: 90,
    confirmation_number: "64570",
    state: "booked",
    hotel_name: "La Mamounia",
    guest_names: ["Camille Martin"],
    check_in: "2026-12-02",
    check_out: "2026-12-06",
    currency: "EUR",
    total_cost: "400",
    crm_booking_id: null,
    raw: { id: 90 },
  };
  const admin = memoryAdmin({
    crm_le_bookings: [
      row,
      { ...row, le_booking_id: 91, confirmation_number: "64571", check_in: "2026-12-10", check_out: "2026-12-12" },
    ],
    crm_bookings: [],
    crm_booking_items: [],
  });
  await assert.rejects(
    () => readReservationLittleEmperors({ nom: "Martin", hotel: "Mamounia" }, admin, { listBookings: async () => [] }),
    /Plusieurs réservations/
  );
});
