import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CrmLeBooking } from "./types";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") {
    return { useRouter: () => ({ refresh() {}, push() {} }) };
  }
  return load.call(this, request, parent, isMain);
};

const inboxModule = import("../../components/admin/LittleEmperorsInbox");

function row(patch: Partial<CrmLeBooking> & { booked_on: string; id: string; hotel_name: string; check_in: string }): CrmLeBooking & {
  booked_on: string;
} {
  return {
    le_booking_id: 1,
    confirmation_number: "64570",
    state: "booked",
    hotel_id: 1,
    address: null,
    city: "Paris",
    country: null,
    website: null,
    check_out: "2026-12-22",
    currency: "EUR",
    total_cost: "100",
    is_cancellable: false,
    cancellation_deadline: null,
    guest_names: [],
    cancellation_policies: [],
    room_types: [],
    crm_booking_id: null,
    status: "unmatched",
    candidates: [],
    last_event: null,
    last_error: null,
    created_at: patch.booked_on,
    updated_at: patch.booked_on,
    ...patch,
  };
}

test("la liste montre la date de réservation, plus récente d’abord", async () => {
  const { LittleEmperorsInbox } = await inboxModule;
  const html = renderToStaticMarkup(
    createElement(LittleEmperorsInbox, {
      rows: [
        row({
          id: "arrivee-lointaine",
          hotel_name: "Séjour lointain",
          check_in: "2026-12-20",
          booked_on: "2026-09-01T08:00:00.000Z",
          confirmation_number: "64571",
        }),
        row({
          id: "reservee-apres",
          hotel_name: "Séjour récent",
          check_in: "2026-11-02",
          booked_on: "2026-10-18T08:00:00.000Z",
          confirmation_number: "64570",
        }),
      ],
      customers: [],
      storageReady: true,
      configured: true,
      productionBlocked: false,
      webhookConfigured: false,
      agency: true,
      probe: { last_status: 200, last_error: null, last_ok_at: null },
    })
  );
  const recent = html.indexOf("Séjour récent");
  const laterStay = html.indexOf("Séjour lointain");
  assert.ok(recent >= 0 && laterStay > recent);
  assert.match(html, /Date de réservation, plus récentes/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /Date de réservation · 18 oct\. 2026/);
  assert.match(html, /Date de réservation · 1 sept\. 2026/);
  assert.match(html, /Séjour · .*20 déc\. 2026/);
});
