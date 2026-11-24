import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hotelStayConflicts, suggestBookingByTraveler } from "./email-match";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";
import { incomingTrip, reunionPlan, type TripDossier } from "./trip-match";

function hotelExtract(city: string, hotel: string, start: string, end: string, ref: string): BookingExtract {
  const extract = emptyBookingExtract();
  extract.document_status = "confirmed";
  extract.title = city;
  extract.destination = city;
  extract.start_date = start;
  extract.end_date = end;
  extract.customer_first_name = "Camille";
  extract.customer_last_name = "Queyrel";
  extract.travelers = [{ first_name: "Camille", last_name: "Queyrel" }];
  extract.items = [
    {
      kind: "hotel",
      title: hotel,
      supplier: "Little Emperors",
      confirmation_ref: ref,
      start_at: start,
      end_at: end,
      amount: null,
      include_in_ledger: false,
      details: { hotel_name: hotel, city },
    },
  ];
  return extract;
}

function dossier(id: string, city: string, start: string, end: string): TripDossier {
  return {
    id,
    customerId: "client-queyrel",
    reference: id,
    status: "draft",
    visible: false,
    start,
    end,
    places: [city],
    people: [{ first_name: "Camille", last_name: "Queyrel" }],
  };
}

describe("une réservation par destination", () => {
  it("Negresco à Nice puis Alpaga à Megève donnent deux dossiers", () => {
    const nice = dossier("nice", "Nice", "2026-11-18", "2026-11-20");
    const megeve = hotelExtract("Megève", "L'Alpaga", "2026-12-13", "2026-12-18", "71986SH009279");
    const reunion = reunionPlan(incomingTrip(megeve, "client-queyrel"), [nice]);
    assert.equal(reunion.keeper, null);
    assert.equal(hotelStayConflicts(megeve, { destination: "Nice", title: "Nice" }), true);
    const suggestion = suggestBookingByTraveler(
      megeve,
      [
        {
          id: "nice",
          customer_id: "client-queyrel",
          reference: "TB-NICE",
          title: "Nice",
          destination: "Nice",
          status: "draft",
          start_date: "2026-11-18",
          end_date: "2026-11-20",
        },
      ],
      [{ booking_id: "nice", first_name: "Camille", last_name: "Queyrel" }],
      [],
      [{ id: "client-queyrel", first_name: "Camille", last_name: "Queyrel", company_name: null, email: "camille@example.com" }]
    );
    assert.equal(suggestion.candidates.length, 0);
  });

  it("deux hôtels de la même ville aux dates consécutives restent le même dossier", () => {
    const first = dossier("nice-1", "Nice", "2026-11-18", "2026-11-20");
    const next = hotelExtract("Nice", "Le Negresco", "2026-11-20", "2026-11-22", "6755SH018700");
    const reunion = reunionPlan(incomingTrip(next, "client-queyrel"), [first]);
    assert.equal(reunion.keeper?.id, "nice-1");
    assert.equal(hotelStayConflicts(next, { destination: "Nice", title: "Nice" }), false);
  });
});
