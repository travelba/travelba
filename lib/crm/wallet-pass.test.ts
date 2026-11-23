import assert from "node:assert/strict";
import test from "node:test";
import {
  WALLET_CHAMPAGNE,
  WALLET_INK,
  WALLET_NAVY,
  WALLET_PASS_TYPE_ID,
  buildBoardingPass,
  buildHotelPass,
  buildTransferPass,
  flightHasAirlinePass,
  walletClock,
  walletDate,
  walletLocation,
  walletPassHref,
  type WalletItem,
} from "./wallet-pass";

const identity = { passTypeId: WALLET_PASS_TYPE_ID, teamId: "ABCDE12345", bookingId: "11111111-1111-4111-8111-111111111111" };

function item(partial: Partial<WalletItem> & Pick<WalletItem, "kind">): WalletItem {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    title: "",
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    details: {},
    visible_to_client: true,
    lifecycle: "active",
    ...partial,
  };
}

test("l’hôtel porte le nom, l’adresse, les dates, la confirmation, le voyageur et le point", () => {
  const built = buildHotelPass(
    item({
      kind: "hotel",
      title: "Milan",
      confirmation_ref: "LE-88",
      start_at: "2026-11-12",
      end_at: "2026-11-14",
      details: {
        hotel_name: "Maison Horizon",
        address: "12 via Torino",
        city: "Milan",
        check_in_time: "15:00",
        latitude: 45.46,
        longitude: 9.19,
      },
    }),
    "Camille Martin",
    identity
  );
  assert.ok(built);
  assert.equal(built.style, "hotel");
  assert.equal(built.pass.backgroundColor, WALLET_NAVY);
  assert.equal(built.pass.foregroundColor, WALLET_INK);
  assert.equal(built.pass.labelColor, WALLET_CHAMPAGNE);
  assert.equal(built.pass.passTypeIdentifier, WALLET_PASS_TYPE_ID);
  assert.equal(built.pass.logoText, "TBA");
  const generic = built.pass.generic as { primaryFields: { value: string }[]; auxiliaryFields: { key: string; value: string }[]; backFields: { key: string; value: string }[] };
  assert.equal(generic.primaryFields[0].value, "Maison Horizon");
  assert.equal(generic.auxiliaryFields.find((row) => row.key === "guest")?.value, "Camille Martin");
  assert.equal(generic.auxiliaryFields.find((row) => row.key === "confirmation")?.value, "LE-88");
  assert.equal(generic.backFields.find((row) => row.key === "address")?.value, "12 via Torino, Milan");
  assert.equal(generic.backFields.find((row) => row.key === "checkin")?.value, "15h00");
  assert.deepEqual(built.pass.locations, [{ latitude: 45.46, longitude: 9.19, relevantText: "Maison Horizon" }]);
  assert.equal("relevantDate" in built.pass, false);
});

test("une heure absente, minuit, ou un point invalide ne sont pas inventés", () => {
  assert.equal(walletClock(null), null);
  assert.equal(walletClock("2026-11-12T00:00:00"), null);
  assert.equal(walletClock("00:00"), null);
  assert.equal(walletClock("15:00"), "15h00");
  assert.equal(walletDate(""), null);
  assert.equal(walletDate("pas-une-date"), null);
  assert.equal(walletLocation(null, 9, "Hôtel"), null);
  assert.equal(walletLocation(0, 0, "Hôtel"), null);
  assert.equal(walletLocation(91, 2, "Hôtel"), null);
  const built = buildHotelPass(
    item({ kind: "hotel", title: "Maison", start_at: "2026-11-12T00:00:00", details: { latitude: "nord" } }),
    null,
    identity
  );
  assert.ok(built);
  const generic = built.pass.generic as { auxiliaryFields: { key: string }[]; backFields: { key: string }[] };
  assert.equal(generic.auxiliaryFields.some((row) => row.key === "guest"), false);
  assert.equal(generic.backFields.some((row) => row.key === "checkin"), false);
  assert.equal("locations" in built.pass, false);
});

test("le transfert garde l’heure, le lieu, le chauffeur et le téléphone déjà écrits", () => {
  const built = buildTransferPass(
    item({
      kind: "transfer",
      supplier: "Talixo",
      start_at: "2026-11-12T09:40:00",
      details: { pickup: "CDG terminal 2E", dropoff: "Hôtel", driver: "Marc", phone: "+33 6 00 00 00 00" },
    }),
    identity
  );
  assert.ok(built);
  const generic = built.pass.generic as { primaryFields: { value: string }[]; secondaryFields: { key: string; value: string }[]; auxiliaryFields: { key: string; value: string }[] };
  assert.equal(generic.primaryFields[0].value, "CDG terminal 2E");
  assert.match(generic.secondaryFields.find((row) => row.key === "when")?.value || "", /09h40/);
  assert.equal(generic.auxiliaryFields.find((row) => row.key === "driver")?.value, "Marc");
  assert.equal(generic.auxiliaryFields.find((row) => row.key === "company")?.value, "Talixo");
  assert.equal(generic.auxiliaryFields.find((row) => row.key === "phone")?.value, "+33 6 00 00 00 00");
  assert.equal(buildTransferPass(item({ kind: "transfer", details: {} }), identity), null);
});

test("le vol de repli reprend les villes et n’invente ni siège ni porte", () => {
  const built = buildBoardingPass(
    item({
      kind: "flight",
      supplier: "Air Example",
      confirmation_ref: "AB12CD",
      start_at: "2026-11-12T14:20:00",
      details: { flight_number: "EX 100", from: "cdg", to: "jfk", city_from: "Paris", city_to: "New York" },
    }),
    "Camille Martin",
    identity
  );
  assert.ok(built);
  const boarding = built.pass.boardingPass as {
    transitType: string;
    primaryFields: { key: string; label: string; value: string }[];
    auxiliaryFields: { key: string }[];
  };
  assert.equal(boarding.transitType, "PKTransitTypeAir");
  assert.equal(boarding.primaryFields.find((row) => row.key === "origin")?.value, "CDG");
  assert.equal(boarding.primaryFields.find((row) => row.key === "origin")?.label, "Paris");
  assert.equal(boarding.auxiliaryFields.some((row) => row.key === "seat" || row.key === "gate"), false);
  assert.equal(buildBoardingPass(item({ kind: "flight", title: "Vol" }), null, identity), null);
});

test("sans certificat, ou avec un .pkpass de compagnie, le bouton reste absent", () => {
  const flight = item({
    kind: "flight",
    start_at: "2026-11-12T14:20:00",
    details: { flight_number: "EX100", from: "CDG", to: "JFK", city_from: "Paris", city_to: "New York" },
  });
  assert.equal(walletPassHref({ ready: false, reference: "TB-2026-0001", item: flight }), null);
  assert.equal(
    walletPassHref({ ready: true, reference: "TB-2026-0001", item: flight }),
    "/api/client/bookings/TB-2026-0001/passe/22222222-2222-4222-8222-222222222222"
  );
  const docs = [{ file_name: "EX100.pkpass", mime_type: "application/vnd.apple.pkpass", booking_item_id: flight.id }];
  assert.equal(flightHasAirlinePass(flight, docs), true);
  assert.equal(walletPassHref({ ready: true, reference: "TB-2026-0001", item: flight, docs }), null);
  assert.equal(
    walletPassHref({
      ready: true,
      reference: "TB-2026-0001",
      item: item({ kind: "hotel", visible_to_client: false, title: "Maison" }),
    }),
    null
  );
});
