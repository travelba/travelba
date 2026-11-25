import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CarnetItinerary } from "@/components/account/CarnetItinerary";
import { documentsForItems } from "./carnet";
import type { CrmBookingDocument, CrmBookingItem } from "./types";
import {
  billetStamp,
  coversSharedFlight,
  dedupeSharedTickets,
  flightsShareReservation,
  mergeBilletExtract,
  readBilletCoverage,
} from "./ticket-share";

function flight(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "id">): CrmBookingItem {
  return {
    booking_id: "b",
    kind: "flight",
    title: "Vol",
    supplier: null,
    confirmation_ref: "ZU5TCO",
    start_at: "2027-04-13T15:50:00",
    end_at: null,
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: { pnr: "KDP4AS", flight_number: "EK 78" },
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

function doc(partial: Partial<CrmBookingDocument> & Pick<CrmBookingDocument, "id">): CrmBookingDocument {
  return {
    booking_id: "b",
    kind: "pdf",
    file_name: "billet.pdf",
    mime_type: "application/pdf",
    storage_path: `bookings/b/${partial.id}.pdf`,
    visible_to_client: true,
    created_at: "",
    ...partial,
  };
}

test("le même numéro de billet relie deux cartes dont le PNR est écrit autrement", () => {
  const left = flight({
    id: "a",
    confirmation_ref: "ZU5TCO",
    details: { flight_number: "EK 78", passengers: [{ first_name: "A", last_name: "B", ticket_number: "1761234567890" }] },
  });
  const right = flight({
    id: "b",
    confirmation_ref: null,
    details: { pnr: "KDP4AS", flight_number: "EK 209", ticket_numbers: ["1761234567890"] },
  });
  assert.equal(flightsShareReservation(left, right), true);
});

test("les segments lus montrent le billet même s’il est sur la mauvaise carte", () => {
  const wrong = flight({
    id: "a3",
    confirmation_ref: "YFFRS8",
    details: { pnr: "YFFRS8", flight_number: "A3 690", from: "ATH", to: "NCE" },
    start_at: "2027-05-02T09:00:00",
  });
  const ek = flight({
    id: "ek78",
    start_at: "2027-04-13T15:50:00",
    details: { pnr: "KDP4AS", flight_number: "EK 78", from: "NCE", to: "DXB" },
  });
  const ticket = doc({
    id: "import",
    booking_item_id: "a3",
    extracted: {
      billet: {
        pnrs: ["ZU5TCO"],
        billets: [],
        segments: [
          { vol: "EK 78", de: "NCE", vers: "DXB", jour: "2027-04-13" },
          { vol: "EK209", de: "DXB", vers: "ATH", jour: "2027-04-20" },
        ],
      },
    },
  });
  assert.equal(coversSharedFlight(ticket, ek, [wrong, ek]), true);
  const shown = documentsForItems([ek, wrong], [ticket], [ek, wrong]).map((row) => row.id);
  assert.deepEqual(shown.sort(), ["import"]);
  const coverage = readBilletCoverage(ticket.extracted);
  assert.equal(coverage?.segments.length, 2);
});

test("les fichiers cités par la carte s’affichent sans rattachement", () => {
  const ek78 = flight({
    id: "ek78",
    details: { pnr: "ZU5TCO", flight_number: "EK 78", source_files: ["a.pdf", "b.pdf"] },
  });
  const ek209 = flight({
    id: "ek209",
    start_at: "2027-04-20T10:50:00",
    details: { pnr: "ZU5TCO", flight_number: "EK 209", source_file_name: "a.pdf", source_files: ["a.pdf", "b.pdf"] },
  });
  const files = [
    doc({ id: "a", file_name: "a.pdf", booking_item_id: null }),
    doc({ id: "b", file_name: "B.PDF", booking_item_id: null }),
  ];
  assert.deepEqual(
    documentsForItems([ek78], files, [ek78, ek209]).map((row) => row.id).sort(),
    ["a", "b"]
  );
  assert.deepEqual(
    documentsForItems([ek209], files, [ek78, ek209]).map((row) => row.id).sort(),
    ["a", "b"]
  );
});

test("la carte ne montre qu’une fois le fichier copié sur les deux vols", () => {
  const sha = "c".repeat(64);
  const ek78 = flight({ id: "ek78" });
  const ek209 = flight({
    id: "ek209",
    start_at: "2027-04-20T10:50:00",
    details: { pnr: "KDP4AS", flight_number: "EK 209" },
  });
  const copies = [
    doc({ id: "on78", booking_item_id: "ek78", content_sha256: sha }),
    doc({ id: "on209", booking_item_id: "ek209", content_sha256: sha }),
  ];
  assert.deepEqual(
    documentsForItems([ek78], copies, [ek78, ek209]).map((row) => row.id),
    ["on78"]
  );
  assert.deepEqual(
    documentsForItems([ek209], copies, [ek78, ek209]).map((row) => row.id),
    ["on209"]
  );
});

test("deux copies du même fichier ne font qu’une vignette, celle de la carte", () => {
  const sha = "b".repeat(64);
  const copies = dedupeSharedTickets(
    [
      doc({ id: "other", booking_item_id: "ek209", content_sha256: sha, storage_path: "bookings/b/other.pdf" }),
      doc({ id: "mine", booking_item_id: "ek78", content_sha256: sha, storage_path: "bookings/b/mine.pdf" }),
    ],
    ["ek78"]
  );
  assert.deepEqual(copies.map((row) => row.id), ["mine"]);
});

test("le carnet client montre le même billet sur les deux vols du PNR", () => {
  const ek78 = flight({
    id: "ek78",
    title: "Nice → Dubaï",
    start_at: "2027-04-13T15:50:00",
    details: { pnr: "KDP4AS", flight_number: "EK 78", from: "NCE", to: "DXB", city_from: "Nice", city_to: "Dubaï" },
  });
  const ek209 = flight({
    id: "ek209",
    title: "Dubaï → Athènes",
    start_at: "2027-04-20T10:50:00",
    details: { pnr: "KDP4AS", flight_number: "EK 209", from: "DXB", to: "ATH", city_from: "Dubaï", city_to: "Athènes" },
  });
  const ticket = doc({ id: "seul", booking_item_id: "ek78", file_name: "billet-passager.pdf" });
  const html = renderToStaticMarkup(
    createElement(CarnetItinerary, {
      booking: {
        id: "b",
        reference: "TB-2026-0204",
        title: "Athènes",
        destination: "Athènes",
        start_date: "2027-04-13",
        end_date: "2027-05-02",
        currency: "EUR",
        status: "confirmed",
        cover_image_path: null,
        cover_credit: null,
        notes_client: null,
        prices_visible: true,
        visible_to_client: true,
        offer_chauffeur: false,
        offer_greeter: false,
        offer_checkin: false,
        offer_visa: false,
        updated_at: "2026-11-01T00:00:00.000Z",
      },
      items: [ek78, ek209],
      docs: [ticket],
    })
  );
  assert.match(html, /EK 78/);
  assert.match(html, /EK 209/);
  assert.equal((html.match(/billet-passager\.pdf/g) || []).length, 4);
});

test("la couverture lue se pose sans effacer le reste", () => {
  const stamp = billetStamp({
    pnr: "zu5tco",
    ticketNumber: "176-1234567890",
    segments: [{ flightNumber: "EK 78", from: "NCE", to: "DXB", departureAt: "2027-04-13T15:50:00" }],
  });
  assert.deepEqual(stamp?.billet.pnrs, ["ZU5TCO"]);
  assert.deepEqual(stamp?.billet.billets, ["1761234567890"]);
  const merged = mergeBilletExtract({ passe: true }, stamp);
  assert.equal((merged as { passe?: boolean }).passe, true);
  assert.equal(billetStamp({ pnr: "12", ticketNumber: "123" }), null);
});
