import assert from "node:assert/strict";
import test from "node:test";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";
import { cardDateIsStale, isSampleTravelerName, screenInboundExtract } from "./ingest-samples";

const RECEIVED = "2026-10-15T08:00:00.000Z";

function flight(partial: Partial<BookingExtract["items"][number]>): BookingExtract["items"][number] {
  return {
    kind: "flight",
    title: "Paris → Rome",
    supplier: null,
    confirmation_ref: "YQYS8U",
    start_at: "2026-12-17T13:20:00",
    end_at: "2026-12-17T15:40:00",
    amount: null,
    details: { flight_number: "AF 258", from: "CDG", to: "FCO" },
    ...partial,
  };
}

function hotel(partial: Partial<BookingExtract["items"][number]>): BookingExtract["items"][number] {
  return {
    kind: "hotel",
    title: "Park Hyatt",
    supplier: null,
    confirmation_ref: "97620170",
    start_at: "2026-12-17",
    end_at: "2026-12-20",
    amount: null,
    details: { hotel_name: "Park Hyatt", city: "Rome" },
    ...partial,
  };
}

test("les PNR, vols, hôtels et voyageurs d’exemple ne deviennent pas des cartes", () => {
  const extract: BookingExtract = {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    title: "Hôtel Exemples",
    destination: "Rome",
    customer_first_name: "John",
    customer_last_name: "Doe",
    travelers: [
      { first_name: "John", last_name: "Doe" },
      { first_name: "Jane", last_name: "Doe" },
      { first_name: "Jean", last_name: "Dupont" },
      { first_name: "Marie", last_name: "Durand" },
      { first_name: "Joséphine", last_name: "Peterson" },
      { first_name: "Michael", last_name: "Peterson" },
      { first_name: "David", last_name: "Berda" },
    ],
    items: [
      flight({ confirmation_ref: "ABC123", details: { flight_number: "AF123", pnr: "ABC123" } }),
      flight({ confirmation_ref: "DEF456", details: { flight_number: "1234" } }),
      flight({ confirmation_ref: "XYZ123", details: { flight_number: "LX 123" } }),
      flight({ confirmation_ref: "ABCDE1", details: { flight_number: "HV5802" } }),
      flight({ confirmation_ref: "ABCDEFG", details: { flight_number: "TO3456" } }),
      flight({ confirmation_ref: "97531XY", details: { flight_number: "UA100" } }),
      flight({ confirmation_ref: "YQYS8U", details: { flight_number: "5678" } }),
      hotel({ title: "Hôtel Exemples", details: { hotel_name: "Hôtel Exemples" } }),
      hotel({ title: "Option Hôtelière", confirmation_ref: "11111", details: { hotel_name: "Option Hôtelière" } }),
      hotel({ title: "The Grand Hotel", confirmation_ref: "22222", details: { hotel_name: "The Grand Hotel" } }),
      hotel({ title: "Park Hyatt", confirmation_ref: "97620170", details: { hotel_name: "Park Hyatt" } }),
    ],
  };
  const screened = screenInboundExtract(extract, { receivedAt: RECEIVED });
  assert.equal(screened.extract.items.length, 1);
  assert.equal(screened.extract.items[0]?.confirmation_ref, "97620170");
  assert.deepEqual(
    screened.extract.travelers.map((person) => person.last_name),
    ["Berda"]
  );
  assert.equal(screened.extract.customer_first_name, null);
  assert.equal(screened.extract.title, null);
  assert.equal(screened.extract.destination, "Rome");
  const notes = screened.warnings.map((warning) => warning.message).join(" ");
  assert.match(notes, /ABC123/);
  assert.match(notes, /5678/);
  assert.match(notes, /Hôtel Exemples/);
  assert.match(notes, /Option Hôtelière/);
  assert.match(notes, /The Grand Hotel/);
  assert.match(screened.warnings.map((warning) => warning.message).join(" "), /John Doe/);
  assert.equal(isSampleTravelerName("Marie", "Curie"), true);
  assert.equal(isSampleTravelerName("Pierre", "Durand"), true);
  assert.equal(isSampleTravelerName("Marie", "Dubois"), true);
  assert.equal(isSampleTravelerName("John", "Smith"), true);
  assert.equal(isSampleTravelerName("Paul", "Durand"), true);
  assert.equal(isSampleTravelerName("David", "Berda"), false);
  assert.equal(isSampleTravelerName("Adulte", "2"), false);
});

test("un vol ou un hôtel daté bien avant le mail n’est pas créé", () => {
  const extract: BookingExtract = {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    start_date: "2023-06-01",
    end_date: "2023-06-08",
    travelers: [{ first_name: "David", last_name: "Berda" }],
    items: [
      flight({ start_at: "2024-03-02T09:00:00", end_at: "2024-03-02T11:00:00" }),
      hotel({ start_at: "2022-08-01", end_at: "2022-08-05" }),
      flight({
        confirmation_ref: "YQYS8U",
        start_at: "2026-09-20T13:20:00",
        details: { flight_number: "AF 258" },
      }),
    ],
  };
  const screened = screenInboundExtract(extract, { receivedAt: RECEIVED });
  assert.equal(screened.extract.items.length, 1);
  assert.equal(screened.extract.items[0]?.start_at, "2026-09-20T13:20:00");
  assert.equal(screened.extract.start_date, null);
  assert.equal(screened.extract.end_date, null);
  assert.match(screened.warnings.map((warning) => warning.message).join(" "), /2024-03-02/);
  assert.match(screened.warnings.map((warning) => warning.message).join(" "), /2022-08-01/);
  assert.equal(cardDateIsStale("2026-09-16", RECEIVED), false);
  assert.equal(cardDateIsStale("2026-09-15", RECEIVED), true);
  assert.equal(cardDateIsStale("2026-12-01", null), false);
});

test("une image seule, sans confirmation écrite, ne crée ni carte ni voyageur", () => {
  const extract: BookingExtract = {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    customer_first_name: "John",
    customer_last_name: "Doe",
    travelers: [{ first_name: "John", last_name: "Doe" }],
    items: [
      flight({
        confirmation_ref: "ABC123",
        details: { flight_number: "AF123", source_file_name: "image001.png" },
      }),
    ],
  };
  const screened = screenInboundExtract(extract, {
    receivedAt: RECEIVED,
    imageOnly: true,
    sourceText: "Logo de la signature",
    corroborationText: "Logo de la signature",
  });
  assert.equal(screened.extract.items.length, 0);
  assert.equal(screened.extract.travelers.length, 0);
  assert.match(screened.warnings.map((warning) => warning.message).join(" "), /Image seule/);
});

test("chaque PNR et chaque voyageur doit être écrit dans le texte, sinon il est écarté", () => {
  const source = "Passager BERDA/DAVID\nRéférence du dossier YQYS8U\nPark Hyatt 97620170";
  const extract: BookingExtract = {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    start_date: "2026-12-17",
    travelers: [
      { first_name: "David", last_name: "Berda" },
      { first_name: "Jane", last_name: "Doe" },
    ],
    items: [
      flight({ confirmation_ref: "YQYS8U", details: { flight_number: "AF 258", pnr: "YQYS8U" } }),
      flight({
        title: "Rome → Paris",
        confirmation_ref: "ZZZ999",
        details: { flight_number: "AZ 100", pnr: "ZZZ999", source_file_name: "capture.png" },
      }),
      hotel({
        title: "Hôtel inventé",
        confirmation_ref: null,
        details: { hotel_name: "Hôtel inventé", source_file_name: "logo.png" },
      }),
    ],
  };
  const screened = screenInboundExtract(extract, {
    receivedAt: RECEIVED,
    sourceText: source,
    corroborationText: source,
    imageOnly: false,
  });
  assert.equal(screened.extract.items.length, 1);
  assert.equal(screened.extract.items[0]?.confirmation_ref, "YQYS8U");
  const kept = screened.extract.items[0]?.details as { needs_review?: boolean; client_hidden?: boolean } | undefined;
  assert.equal(kept?.needs_review, true);
  assert.equal(kept?.client_hidden, true);
  assert.deepEqual(
    screened.extract.travelers.map((person) => person.last_name),
    ["Berda"]
  );
  const notes = screened.warnings.map((warning) => warning.message).join(" ");
  assert.match(notes, /ZZZ999/);
  assert.match(notes, /Jane Doe/);
  assert.match(notes, /Image seule/);
});

test("une carte réelle récente reste, même si le mail a aussi un exemple", () => {
  const extract: BookingExtract = {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    title: "Rome",
    destination: "Rome",
    start_date: "2026-12-17",
    travelers: [{ first_name: "David", last_name: "Berda" }],
    items: [flight({})],
  };
  const screened = screenInboundExtract(extract, { receivedAt: RECEIVED });
  assert.equal(screened.extract.items.length, 1);
  assert.equal(screened.extract.travelers.length, 1);
  assert.equal(screened.warnings.length, 0);
  assert.equal(screened.extract.title, "Rome");
});
