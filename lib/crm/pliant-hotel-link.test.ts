import assert from "node:assert/strict";
import test from "node:test";
import { hotelLineForIssuedCard, linkIssuedCardToHotel } from "./pliant-hotel-link";

const BOOKING = "22222222-2222-4222-8222-222222222222";
const KEMPINSKI = "33333333-3333-4333-8333-333333333333";
const SETAI = "44444444-4444-4444-8444-444444444444";

function hotel(id: string, name: string) {
  return {
    id,
    kind: "hotel" as const,
    title: name,
    supplier: null,
    details: { hotel_name: name },
    lifecycle: "active" as const,
  };
}

test("la ligne hôtel est unique, nommée, ou absente", () => {
  const hotels = [
    { id: KEMPINSKI, name: "The David Kempinski Tel Aviv", active: true },
    { id: SETAI, name: "The Setai Tel Aviv", active: true },
  ];
  assert.equal(hotelLineForIssuedCard({ hotels: [hotels[0]] }), KEMPINSKI);
  assert.equal(hotelLineForIssuedCard({ hotels, designation: "Visa" }), null);
  assert.equal(hotelLineForIssuedCard({ hotels, designation: "Kempinski" }), KEMPINSKI);
  assert.equal(hotelLineForIssuedCard({ hotels, itemId: SETAI }), SETAI);
  assert.equal(hotelLineForIssuedCard({ hotels, itemId: "pas-un-hotel" }), null);
  assert.equal(
    hotelLineForIssuedCard({
      hotels: [...hotels, { id: "gone", name: "Fermé", active: false }],
      designation: "Visa",
    }),
    null
  );
});

test("la carte se lie à l’hôtel nommé et ne remplace pas une carte déjà là", async () => {
  const arrivals: Record<string, unknown>[] = [
    {
      id: "arrival-setai",
      booking_id: BOOKING,
      booking_item_id: SETAI,
      pliant_card_id: "card-deja",
      card_closed_at: null,
      task_note: "Lien demandé",
    },
  ];
  const admin = {
    from(table: string) {
      const filters: { col: string; val: unknown }[] = [];
      const rows = () =>
        arrivals.filter((row) => filters.every((filter) => row[filter.col] === filter.val));
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return api;
        },
        is(col: string, val: unknown) {
          filters.push({ col, val });
          return api;
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        insert: async (payload: Record<string, unknown>) => {
          if (table !== "crm_hotel_arrivals") return { error: { message: "table" } };
          arrivals.push(payload);
          return { error: null };
        },
        update(payload: Record<string, unknown>) {
          const chain = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            is(col: string, val: unknown) {
              filters.push({ col, val });
              return chain;
            },
            then(onFulfilled: (value: { error: null }) => unknown) {
              for (const row of rows()) Object.assign(row, payload);
              return Promise.resolve({ error: null }).then(onFulfilled);
            },
          };
          return chain;
        },
      };
      return api;
    },
  };

  const linked = await linkIssuedCardToHotel(admin, {
    bookingId: BOOKING,
    cardId: "card-kempinski",
    last4: "4242",
    limitCents: 333600,
    currency: "EUR",
    items: [hotel(KEMPINSKI, "The David Kempinski Tel Aviv"), hotel(SETAI, "The Setai Tel Aviv")],
    designation: "Kempinski",
  });
  assert.equal(linked, KEMPINSKI);
  const created = arrivals.find((row) => row.booking_item_id === KEMPINSKI);
  assert.equal(created?.pliant_card_id, "card-kempinski");
  assert.equal(created?.task_note, "Saisie agence");

  const kept = await linkIssuedCardToHotel(admin, {
    bookingId: BOOKING,
    cardId: "card-autre",
    last4: "1111",
    limitCents: 1000,
    currency: "EUR",
    items: [hotel(SETAI, "The Setai Tel Aviv")],
    itemId: SETAI,
  });
  assert.equal(kept, null);
  assert.equal(arrivals.find((row) => row.booking_item_id === SETAI)?.pliant_card_id, "card-deja");

  const skipped = await linkIssuedCardToHotel(admin, {
    bookingId: BOOKING,
    cardId: "card-vague",
    last4: null,
    limitCents: 1000,
    currency: "EUR",
    items: [hotel(KEMPINSKI, "The David Kempinski Tel Aviv"), hotel(SETAI, "The Setai Tel Aviv")],
    designation: "Hôtel",
  });
  assert.equal(skipped, null);
});
