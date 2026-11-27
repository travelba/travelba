import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { toDirectDeskStay } from "./hotel-direct-desk";

const ROW = {
  id: "stay-1",
  customer_id: "client-1",
  booking_id: "dossier-1",
  phase: "cancelled",
  pay_method: "agency",
  trial: false,
  state: { hotelName: "Hotel Indigo", confirmation: "HTL1", stripe: "captured" as const, hotelPay: "paid" as const, clientRefunded: false },
};

test("la file écarte un séjour annulé et un essai confirmé", () => {
  assert.equal(toDirectDeskStay(ROW), null);
  assert.equal(
    toDirectDeskStay({
      ...ROW,
      phase: "confirmed",
      trial: true,
      state: { ...ROW.state, hotelPay: "link_ready" },
    }),
    null
  );
  const open = toDirectDeskStay(
    { ...ROW, phase: "transmitted", trial: false, booking_id: null },
    { clientName: "Camille Martin", dossierHref: null }
  );
  assert.ok(open);
  assert.equal(open?.hotel, "Hotel Indigo");
  assert.equal(open?.clientName, "Camille Martin");
  assert.equal(open?.dossierHref, null);
  const paying = toDirectDeskStay(
    { ...ROW, phase: "confirmed", trial: false, state: { ...ROW.state, hotelPay: "refund_requested" } },
    { clientName: "Camille Martin", dossierHref: "/admin/reservations/dossier-1", dossierLabel: "TB-2026-0001" }
  );
  assert.equal(paying?.phase, "confirmed");
  assert.equal(paying?.dossierLabel, "TB-2026-0001");
  assert.equal(
    toDirectDeskStay({
      ...ROW,
      phase: "confirmed",
      state: { ...ROW.state, hotelPay: "paid", stripe: "captured" },
    }),
    null
  );
});

test("le bureau n’est plus sur la fiche client", () => {
  const fiche = readFileSync(join(import.meta.dirname, "../../app/admin/clients/[id]/page.tsx"), "utf8");
  assert.equal(fiche.includes("HotelDirectDesk"), false);
  assert.equal(fiche.includes("loadDirectStays"), false);
  assert.match(fiche, /HotelAccessCard/);
  const home = readFileSync(join(import.meta.dirname, "../../app/admin/page.tsx"), "utf8");
  assert.match(home, /HotelDirectDesk/);
  assert.match(home, /loadHotelDirectDesk/);
  const dossier = readFileSync(join(import.meta.dirname, "../../app/admin/reservations/[id]/page.tsx"), "utf8");
  assert.match(dossier, /surface: "dossier"/);
});
