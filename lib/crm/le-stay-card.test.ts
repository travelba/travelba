import assert from "node:assert/strict";
import test from "node:test";
import { pliantIdFromStayState, stayBookingCardInsert } from "./le-stay-card";

test("la carte du séjour porte les dates exigées par le dossier", () => {
  const row = stayBookingCardInsert({
    bookingId: "3bb29e58-a60f-4eff-8d55-902db909cafa",
    pliantCardId: "5057d8a7-02d1-4afd-b792-f936f4e7c3bc",
    hotelName: "Sofitel Biarritz Le Miramar",
    sellCents: 18636,
    endDate: "2026-11-08",
    firstName: "Andrea",
    lastName: "Martin",
    last4: "4242",
    today: "2026-11-05",
  });
  assert.ok(row);
  assert.equal(row?.pliant_card_id, "5057d8a7-02d1-4afd-b792-f936f4e7c3bc");
  assert.equal(row?.limit_cents, 18636);
  assert.equal(row?.valid_from, "2026-11-05");
  assert.ok(row?.valid_to);
  assert.equal(row?.status, "active");
  assert.equal(row?.last4, "4242");
  assert.equal(pliantIdFromStayState({ pliantCardId: "5057d8a7-02d1-4afd-b792-f936f4e7c3bc" }), "5057d8a7-02d1-4afd-b792-f936f4e7c3bc");
  assert.equal(stayBookingCardInsert({ ...{ bookingId: "", pliantCardId: "x", hotelName: "H", sellCents: 1, today: "2026-11-05" } }), null);
});
