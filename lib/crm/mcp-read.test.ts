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
  const result = await readFormalites({}, admin as unknown as SupabaseClient);
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

test("formalites keeps the dossier named by reference", async () => {
  const OTHER = "99999999-9999-4999-8999-999999999999";
  const eqs: { table: string; column: string; value: unknown }[] = [];
  const admin = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          eqs.push({ table, column, value });
          return api;
        },
        is() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        in() {
          return api;
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          if (table === "crm_bookings") {
            const reference = [...eqs].reverse().find((row) => row.table === table && row.column === "reference")?.value;
            const id = [...eqs].reverse().find((row) => row.table === table && row.column === "id")?.value;
            const rows = [{ id: BOOKING, reference: "TB-2026-0082" }].filter((row) => {
              if (reference && row.reference !== reference) return false;
              if (id && row.id !== id) return false;
              return true;
            });
            resolve({ data: rows, error: null });
            return;
          }
          const bookingEq = eqs.find((row) => row.table === table && row.column === "booking_id")?.value;
          const data =
            table === "crm_visa_requests"
              ? [
                  { booking_id: BOOKING, country: "IL", status: "en_cours", step: "paiement" },
                  { booking_id: OTHER, country: "US", status: "en_cours", step: "paiement" },
                ]
              : table === "crm_visa_tasks"
                ? [
                    { booking_id: BOOKING, holder_name: "Camille", reference: "TB-2026-0082", reasons: [] },
                    { booking_id: OTHER, holder_name: "Autre", reference: "TB-1", reasons: [] },
                  ]
                : [];
          resolve({
            data: data.filter((row) => !bookingEq || row.booking_id === bookingEq),
            error: null,
          });
        },
      };
      return api;
    },
  };
  const result = await readFormalites({ reference: "TB-2026-0082" }, admin as unknown as SupabaseClient);
  assert.equal("introuvable" in result, false);
  assert.equal(result.demandes.length, 1);
  assert.equal(result.taches.length, 1);
  assert.equal(result.taches[0].voyageur, "Camille");
  assert.equal(
    eqs.some((row) => row.table === "crm_visa_requests" && row.column === "booking_id" && row.value === BOOKING),
    true
  );
  const missing = await readFormalites({ reference: "TB-INCONNU" }, admin as unknown as SupabaseClient);
  assert.equal(missing.introuvable, true);
  assert.equal(missing.demandes.length, 0);
  assert.equal(missing.taches.length, 0);
});
