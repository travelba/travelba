import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncBookingDebit } from "./bookings";
import { isStayRollupDebit, withoutOffAgencyStay } from "./ledger-display";
import type { CrmBooking } from "./types";

test("un séjour hors agence sort du solde, commission comprise non", () => {
  const stay = { id: "stay", direction: "debit", kind: "booking", external_id: null, booking_id: "b1" };
  const fee = { id: "fee", direction: "debit", kind: "booking", external_id: "booking:b1:agency-commission", booking_id: "b1" };
  const kept = withoutOffAgencyStay([stay, fee], new Set(["b1"]));
  assert.deepEqual(kept.map((row) => row.id), ["fee"]);
  assert.equal(isStayRollupDebit(stay), true);
  assert.deepEqual(withoutOffAgencyStay([stay], new Set()), [stay]);
});

test("passer hors agence annule chaque débit Séjour, y compris un second saisi à la main", async () => {
  const voided: string[][] = [];
  const rollups = [
    { id: "258ed545-cf13-48eb-a407-c7c91d71a180", direction: "debit", kind: "booking", external_id: null, status: "posted", source: "manual", amount: 1785 },
    { id: "4adf16ac-9a78-44d8-b920-df8029b40307", direction: "debit", kind: "booking", external_id: null, status: "posted", source: "manual", amount: 900 },
  ];
  const admin = {
    from() {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        is() {
          return api;
        },
        neq() {
          return api;
        },
        update() {
          return api;
        },
        in(_column: string, ids: string[]) {
          voided.push(ids);
          return api;
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          resolve({ data: voided.length ? null : rollups, error: null });
        },
      };
      return api;
    },
  };
  await syncBookingDebit(admin as unknown as SupabaseClient, {
    id: "b1",
    status: "confirmed",
    total_amount: 1785,
    visible_to_client: true,
    include_in_ledger: true,
    client_settles_stay: true,
    currency: "EUR",
    reference: "TB-2026-0041",
    title: "Séjour",
    customer_id: "c1",
    billing_customer_id: "c1",
  } as CrmBooking);
  assert.deepEqual(voided[0]?.slice().sort(), rollups.map((row) => row.id).sort());
});
