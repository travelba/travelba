import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFormalites } from "./mcp-read";

const BOOKING = "22222222-2222-4222-8222-222222222222";

test("formalites lists visa requests by created_at", async () => {
  const orders: { table: string; column: string }[] = [];
  const admin = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        is() {
          return api;
        },
        order(column: string) {
          orders.push({ table, column });
          return api;
        },
        limit() {
          return api;
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          const data =
            table === "crm_visa_requests"
              ? [
                  { booking_id: BOOKING, country: "IL", status: "en_cours", step: "paiement" },
                  { booking_id: BOOKING, country: "US", status: "piece", step: "piece" },
                ]
              : [];
          resolve({ data, error: null });
        },
      };
      return api;
    },
  };
  const result = await readFormalites(admin as unknown as SupabaseClient);
  assert.equal(
    orders.some((row) => row.table === "crm_visa_requests" && row.column === "updated_at"),
    false
  );
  assert.equal(
    orders.some((row) => row.table === "crm_visa_requests" && row.column === "created_at"),
    true
  );
  assert.equal(result.demandes.length, 1);
  assert.equal(result.demandes[0].statut, "en_cours");
  assert.equal(result.demandes[0].lien, `/admin/reservations/${BOOKING}`);
});
