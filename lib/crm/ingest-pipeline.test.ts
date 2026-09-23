import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyIngestFamily,
  parsedItemsFromText,
  parserItemsComplete,
  shouldUseVision,
} from "./ingest-parse";
import { dedupeTravelers, mergeFileExtracts } from "./ingest-merge";
import {
  assertStaffIngestPath,
  ingestTmpPath,
  parseIngestTmpPath,
} from "./ingest-storage";
import { emptyBookingExtract } from "./ingest-types";

const AMADEUS = `
Reçu de Billet Electronique Reference du dossier XL8LPD CheckMyTrip App
IATA 20287864
Lundi 03 août 2026
Hahn Air Technologies X1 218 (Opéré Par Air Panama, X1)
03 August 09:45 AÉROPORT MARCOS A. GELABERT PANAMA
(VILLE)
Départ
03 August 10:45 ISLA COLON INTL BOCAS DEL TOROArrivée
Economique (Y)Classe
Référence du dossier compagnie X1/N0OP1Q
Compagnie émettrice : HAHN AIR
`;

const LE_HOTEL = `
Costa Rica Marriott Hotel Hacienda
Belen
Heredia
Reservation Details
Check in
10 August 2026
Check out
11 August 2026
Booking Reference
97620170
Address
Heredia
Guest Room Pool Access 2 Double
Adults
2
Booking name
Guest A
Total
$858.80
`;

const QUOTE = `
Devis
Passion Collection
none are on hold
`;

describe("classifyIngestFamily", () => {
  it("reconnaît un e-ticket Amadeus", () => {
    assert.equal(classifyIngestFamily(AMADEUS, "eticket.pdf"), "amadeus");
  });

  it("reconnaît Little Emperors et un devis", () => {
    assert.equal(classifyIngestFamily(LE_HOTEL, "marriott.pdf"), "little_emperors");
    assert.equal(classifyIngestFamily(QUOTE, "devis.pdf"), "quote");
  });

  it("reconnaît une MRZ comme identité", () => {
    assert.equal(classifyIngestFamily("P<FRADUPONT<<JEAN<<<<<<<<", "scan.jpg"), "identity");
  });

  it("reconnaît une confirmation maeva", () => {
    assert.equal(
      classifyIngestFamily(
        "maeva.com\nN° DE DOSSIER : 15000001\nVOS OPTIONS\nTotal Forfaits Remontées Mécaniques 3 710,00 €",
        "maeva.pdf"
      ),
      "maeva"
    );
  });
});

describe("parserItemsComplete / vision", () => {
  it("considère un Amadeus parseable comme complet, sans vision", () => {
    const parsed = parsedItemsFromText(AMADEUS);
    assert.equal(parserItemsComplete("amadeus", parsed.items), true);
    assert.equal(
      shouldUseVision({
        denseChars: 1200,
        itemCount: parsed.items.length,
        family: "amadeus",
        isImage: false,
        parserComplete: true,
      }),
      false
    );
  });

  it("demande la vision pour une image inconnue", () => {
    assert.equal(
      shouldUseVision({
        denseChars: 0,
        itemCount: 0,
        family: "unknown",
        isImage: true,
        parserComplete: false,
      }),
      true
    );
  });

  it("demande la vision si le calque est pauvre", () => {
    assert.equal(
      shouldUseVision({
        denseChars: 40,
        itemCount: 0,
        family: "unknown",
        isImage: false,
        parserComplete: false,
      }),
      true
    );
  });
});

describe("mergeFileExtracts", () => {
  it("fusionne devis + confirmé sans passer tout le lot en quote", () => {
    const hotel = parsedItemsFromText(LE_HOTEL).items;
    const quoteItem = {
      kind: "hotel" as const,
      title: "Option villa",
      supplier: null,
      confirmation_ref: null,
      start_at: "2026-08-10",
      end_at: "2026-08-12",
      amount: null,
      details: { hotel_name: "Passion", source_file_name: "devis.pdf" },
    };
    const merged = mergeFileExtracts([
      {
        name: "marriott.pdf",
        family: "little_emperors",
        extract: {
          ...emptyBookingExtract(),
          document_status: "confirmed",
          items: hotel.map((item) => ({
            ...item,
            details: { ...item.details, source_file_name: "marriott.pdf" },
          })),
        },
      },
      {
        name: "devis.pdf",
        family: "quote",
        extract: {
          ...emptyBookingExtract(),
          document_status: "quote",
          items: [quoteItem],
        },
      },
    ]);
    assert.equal(merged.extract.document_status, "confirmed");
    assert.equal(merged.extract.total_amount, 0);
    assert.equal(
      merged.extract.items.find((item) => item.kind === "hotel")?.details?.document_amount,
      858.8
    );
    const devis = merged.extract.items.find(
      (item) => item.details?.source_file_name === "devis.pdf"
    );
    assert.equal(devis?.details?.needs_review, true);
    assert.match(merged.extract.notes_client || "", /devis/i);
  });

  it("ne met pas tout le dossier en identity si un passeport est mélangé", () => {
    const hotel = parsedItemsFromText(LE_HOTEL).items;
    const merged = mergeFileExtracts([
      {
        name: "marriott.pdf",
        family: "little_emperors",
        extract: {
          ...emptyBookingExtract(),
          document_status: "confirmed",
          items: hotel,
        },
      },
      {
        name: "passeport.jpg",
        family: "identity",
        identity: true,
        extract: { ...emptyBookingExtract(), document_status: "identity" },
      },
    ]);
    assert.equal(merged.extract.document_status, "confirmed");
    assert.equal(merged.extract.items.length > 0, true);
    assert.equal(merged.warnings.some((row) => row.file === "passeport.jpg"), true);
  });

  it("dédupe les voyageurs sans tenir compte de la casse", () => {
    const travelers = dedupeTravelers([
      { first_name: "Yanik", last_name: "Dupont" },
      { first_name: "YANIK", last_name: "DUPONT" },
      { first_name: "Marie", last_name: "Dupont" },
    ]);
    assert.equal(travelers.length, 2);
  });
});

describe("ingest-tmp paths", () => {
  it("construit et vérifie un chemin staff", () => {
    const staff = "d39602e0-0f4a-4c2e-969d-802bc6eb8996";
    const batch = "e29a2074-5f2c-4719-8507-6947366e37ba";
    const path = ingestTmpPath(staff, batch, "E-ticket PAC.pdf");
    const parsed = parseIngestTmpPath(path);
    assert.equal(parsed.staffUserId, staff);
    assert.equal(parsed.batchId, batch);
    assertStaffIngestPath(path, staff, batch);
    assert.throws(() => assertStaffIngestPath(path, batch, batch));
    assert.throws(() => parseIngestTmpPath("bookings/x/y.pdf"));
  });
});
