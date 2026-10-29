import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCancellationVerdict,
  leCancellationVerdict,
  leStayAnchor,
  personNamesAlign,
  supplierCancellationVerdict,
  type StayAnchor,
} from "./cancellation-standing";
import { emptyBookingExtract } from "./ingest-types";

const HOTEL = "The NoMad Hotel, London";
const HOTEL_ID = 9882;

function stay(patch: Partial<StayAnchor> & Pick<StayAnchor, "confirmation">): StayAnchor {
  return {
    hotel: HOTEL,
    hotelId: HOTEL_ID,
    people: [],
    checkIn: "2026-10-30",
    checkOut: "2026-11-03",
    active: true,
    leId: null,
    at: null,
    ...patch,
  };
}

/** Confirmations actives des dossiers TB-2026-0040 / 0041 / 0043. */
const active: StayAnchor[] = [
  stay({
    confirmation: "3103360446",
    people: ["Cohen Laura", "Laura Emilie Cohen"],
    checkIn: "2026-10-29",
    leId: 126679,
    at: "2026-09-28T14:34:03.000Z",
  }),
  stay({
    confirmation: "3104088572",
    people: ["Cohen Normann", "Norman Steven Cohen"],
    leId: 126681,
    at: "2026-09-28T14:42:33.000Z",
  }),
  stay({
    confirmation: "3105358205",
    people: ["Cohen Jordan", "Jordan Cohen"],
    leId: 126683,
    at: "2026-09-28T14:44:10.000Z",
  }),
];

test("Laura, Glenda et Jordan : les anciens numéros NoMad sont remplacés", () => {
  assert.equal(personNamesAlign("Cohen Laura", "Laura Emilie Cohen"), true);
  assert.equal(personNamesAlign("Cohen Normann", "Norman Steven Cohen"), true);
  assert.equal(personNamesAlign("Moore Glenda", "Glenda Lorraine Moore"), true);
  assert.equal(personNamesAlign("Cohen Laura", "Cohen Jordan"), false);

  const laura = supplierCancellationVerdict(
    stay({
      confirmation: "3103269814",
      people: ["Cohen Laura"],
      active: false,
      leId: 126438,
    }),
    active
  );
  assert.equal(laura.suivi, "remplacée");
  assert.equal(laura.alerte, false);
  assert.equal(laura.remplacee_par, "3103360446");

  const glenda = supplierCancellationVerdict(
    stay({
      confirmation: "3101007411;3100571056",
      people: ["Moore Glenda", "Cohen Laura"],
      active: false,
      leId: 126442,
    }),
    active
  );
  assert.equal(glenda.suivi, "remplacée");
  assert.equal(glenda.alerte, false);
  assert.equal(glenda.remplacee_par, "3103360446");

  const jordan = leCancellationVerdict(
    {
      confirmation_number: "3099743468;3100179823;3104882030",
      state: "cancelled",
      hotel_name: HOTEL,
      hotel_id: HOTEL_ID,
      check_in: "2026-10-30",
      check_out: "2026-11-03",
      guest_names: ["Cohen Jordan", "Cohen Laura", "Cohen Kevin"],
      le_booking_id: 126443,
    },
    active
  );
  assert.equal(jordan.suivi, "remplacée");
  assert.equal(jordan.alerte, false);
  assert.equal(jordan.remplacee_par, "3105358205");
});

test("un mail d’annulation antérieur à la carte active est historique", () => {
  const extract = emptyBookingExtract();
  extract.document_status = "cancelled";
  extract.start_date = "2026-10-30";
  extract.end_date = "2026-11-03";
  extract.items = [
    {
      kind: "hotel",
      title: HOTEL,
      supplier: "Little Emperors",
      confirmation_ref: "3099743468;3100179823;3104882030",
      start_at: "2026-10-30",
      end_at: "2026-11-03",
      amount: null,
      include_in_ledger: false,
      details: { hotel_name: HOTEL },
    },
  ];
  const verdict = extractCancellationVerdict(
    { label: "booking-cancellation", receivedAt: "2026-09-28T14:14:08.000Z", extract },
    active
  );
  assert.equal(verdict.suivi, "historique");
  assert.equal(verdict.alerte, false);
  assert.equal(verdict.remplacee_par, "3105358205");

  const oldNumbers = leStayAnchor({
    confirmation: "3099743468;3100179823;3104882030",
    hotel: HOTEL,
    hotelId: HOTEL_ID,
    people: ["Cohen Jordan"],
    checkIn: "2026-10-30",
    checkOut: "2026-11-03",
    state: "cancelled",
    leId: 126443,
  });
  extract.travelers = [{ first_name: "Jordan", last_name: "Cohen" }];
  const late = extractCancellationVerdict(
    { label: "booking-cancellation", receivedAt: "2026-10-20T09:00:00.000Z", extract },
    [...active, oldNumbers]
  );
  assert.equal(late.suivi, "remplacée");
  assert.equal(late.alerte, false);
  assert.equal(late.remplacee_par, "3105358205");
});

test("le numéro de la carte active annulée déclenche l’alerte", () => {
  const verdict = supplierCancellationVerdict(
    stay({
      confirmation: "3103360446",
      people: ["Cohen Laura"],
      active: false,
      leId: 130000,
      at: "2026-10-01T10:00:00.000Z",
    }),
    active
  );
  assert.equal(verdict.suivi, "annulée");
  assert.equal(verdict.alerte, true);
  assert.equal(verdict.remplacee_par, null);
});

test("un autre hôtel sur les mêmes dates n’est pas une annulation NoMad", () => {
  const verdict = supplierCancellationVerdict(
    stay({
      confirmation: "999000111",
      hotel: "Hilton London",
      hotelId: 4,
      people: ["Cohen Laura"],
      active: false,
      leId: 140000,
    }),
    active
  );
  assert.equal(verdict.suivi, null);
  assert.equal(verdict.alerte, false);
});

test("une confirmation n’est pas une alerte", () => {
  const anchor = leStayAnchor({
    confirmation: "3103360446",
    hotel: HOTEL,
    hotelId: HOTEL_ID,
    people: ["Cohen Laura"],
    checkIn: "2026-10-29",
    checkOut: "2026-11-03",
    state: "booked",
    leId: 126679,
  });
  assert.equal(anchor.active, true);
  const verdict = leCancellationVerdict(
    {
      confirmation_number: "3103360446",
      state: "booked",
      hotel_name: HOTEL,
      guest_names: ["Cohen Laura"],
      le_booking_id: 126679,
    },
    active
  );
  assert.equal(verdict.alerte, false);
  assert.equal(verdict.suivi, null);
});
