import assert from "node:assert/strict";
import test from "node:test";
import {
  espaceBalances,
  espaceFileUrl,
  espaceTimelineCards,
  espaceTripCard,
  espaceWhatsappHref,
  resolveEspaceMedia,
  splitEspaceBookings,
} from "./espace-payload";
import type { CrmBooking, CrmBookingItem } from "./types";

function booking(partial: Partial<CrmBooking>): CrmBooking {
  return {
    id: "b1",
    customer_id: "c1",
    reference: "TB-1",
    title: "Marrakech",
    destination: "Marrakech",
    start_date: "2099-03-01",
    end_date: "2099-03-08",
    status: "confirmed",
    visible_to_client: true,
    total_amount: 1000,
    currency: "EUR",
    cover_image_path: "bookings/b1/cover.webp",
    created_at: "",
    updated_at: "",
    ...partial,
  } as CrmBooking;
}

test("les soldes gardent le signe brut", () => {
  const rows = espaceBalances([{ customer_id: "c1", currency: "EUR", balance: -250 } as never], false);
  assert.equal(rows[0]?.value, -250);
  assert.match(rows[0]?.label || "", /250/);
  assert.deepEqual(espaceBalances([{ customer_id: "c1", currency: "EUR", balance: 10 } as never], true), []);
});

test("les fichiers passent par /api/files", () => {
  assert.equal(espaceFileUrl("bookings/b1/cover.webp"), "/api/files?path=bookings%2Fb1%2Fcover.webp");
  assert.equal(espaceFileUrl("/api/covers/x"), "/api/covers/x");
  assert.equal(espaceFileUrl(null), null);
});

test("le prochain séjour et le passé se séparent sans inventer de dates", () => {
  const { upcoming, past } = splitEspaceBookings([
    booking({ id: "soon", end_date: "2099-03-08" }),
    booking({ id: "done", start_date: "2020-01-01", end_date: "2020-01-08", status: "completed" }),
  ]);
  assert.equal(upcoming[0]?.id, "soon");
  assert.equal(past[0]?.id, "done");
  const card = espaceTripCard(booking({}));
  assert.equal(card.href, "/mon-compte/reservations/TB-1");
  assert.equal(card.title, "Marrakech");
});

test("la timeline n’invente pas d’heure d’hôtel", () => {
  const items = [
    {
      id: "h1",
      booking_id: "b1",
      kind: "hotel",
      title: "Riad",
      start_at: "2099-03-01T00:00:00Z",
      visible_to_client: true,
      details: { hotel_name: "Riad Atlas", city: "Marrakech" },
      amount: 400,
      confirmation_ref: "H1",
    },
    {
      id: "f1",
      booking_id: "b1",
      kind: "flight",
      title: "CDG-RAK",
      start_at: "2099-03-01T08:30:00Z",
      visible_to_client: true,
      details: { from_iata: "CDG", to_iata: "RAK", from_city: "Paris", to_city: "Marrakech" },
      amount: 250,
      confirmation_ref: "AF",
    },
    {
      id: "e1",
      booking_id: "b1",
      kind: "expense",
      title: "Pourboire",
      visible_to_client: true,
      details: {},
      amount: 20,
    },
  ] as unknown as CrmBookingItem[];
  const cards = espaceTimelineCards(items);
  assert.equal(cards.some((row) => row.kind === "expense"), false);
  const hotel = cards.find((row) => row.kind === "hotel");
  assert.equal(hotel?.clock, null);
  assert.equal(hotel?.title, "Riad Atlas");
});

test("WhatsApp ouvre l’agence", () => {
  assert.match(espaceWhatsappHref(), /wa.me\/33756841315/);
});

test("les couvertures catalogue restent publiques", async () => {
  assert.equal(await resolveEspaceMedia("/api/covers/abc"), "/api/covers/abc");
  assert.equal(await resolveEspaceMedia(null), null);
});
