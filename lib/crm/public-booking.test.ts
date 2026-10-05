import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_BOOKING_KEYS, toPublicBooking } from "./public-booking";
import type { CrmBooking } from "./types";

const row: CrmBooking = {
  id: "b-1",
  customer_id: "c-1",
  billing_customer_id: "c-2",
  billing_company_id: "co-1",
  payer_kind: "company",
  fees_follow_stay: true,
  reference: "TB-2026-0004",
  title: "Marrakech",
  destination: "Marrakech",
  status: "confirmed",
  start_date: "2026-11-01",
  end_date: "2026-11-05",
  currency: "EUR",
  total_amount: 4800,
  include_in_ledger: true,
  agency_commission: true,
  client_settles_stay: false,
  cover_image_path: "bookings/b-1/cover.webp",
  cover_credit: null,
  notes_client: "Bon voyage",
  notes_internal: "Marge 12 %",
  visible_to_client: true,
  prices_visible: false,
  offer_chauffeur: true,
  offer_greeter: false,
  offer_checkin: false,
  offer_visa: true,
  archived_at: null,
  archived_was_visible: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-02T00:00:00.000Z",
};

test("la projection publique ne garde que les colonnes du carnet", () => {
  const pub = toPublicBooking({ ...row, share_code: "ABCDEFGH" } as CrmBooking);
  assert.deepEqual(Object.keys(pub).sort(), [...PUBLIC_BOOKING_KEYS].sort());
  assert.equal(pub.reference, "TB-2026-0004");
  assert.equal(pub.notes_client, "Bon voyage");
  assert.equal(pub.prices_visible, false);
  assert.equal(pub.offer_chauffeur, true);
  const leaked = pub as unknown as Record<string, unknown>;
  for (const key of [
    "notes_internal",
    "total_amount",
    "customer_id",
    "billing_customer_id",
    "billing_company_id",
    "agency_commission",
    "include_in_ledger",
    "client_settles_stay",
    "archived_at",
    "archived_was_visible",
    "share_code",
    "payer_kind",
    "fees_follow_stay",
    "created_at",
  ]) {
    assert.equal(key in leaked, false, key);
  }
});

test("une colonne absente de la ligne ne devient pas undefined dans la projection", () => {
  const partial: Partial<CrmBooking> = { ...row };
  delete partial.cover_credit;
  const pub = toPublicBooking(partial as CrmBooking);
  assert.equal("cover_credit" in pub, false);
});
