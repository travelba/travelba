import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { redactIngestText } from "./ingest-redact";
import { sanitizeExtractedPrices } from "./ingest-types";
import {
  applyStructuredHints,
  inferAirportIata,
  parseAmadeusFlights,
  parseAmadeusReceipt,
  parseDdMonYy,
  parseHotelConfirmationLetter,
  parseLittleEmperorsHotel,
  parseNantipaConfirmation,
  parseSixtCar,
  parseTransferConfirmation,
  parseUsMonthDayYear,
  parsedItemsFromText,
  parseDocumentMoney,
  structuredHintFromPdfText,
} from "./ingest-parse";
import { findMatchingItem, mergeExtractItems } from "./item-match";

const AMADEUS_HAHN = `
Reçu de Billet Electronique Reference du dossier XL8LPD CheckMyTrip App
IATA 20287864
Lundi 03 août 2026
Hahn Air Technologies X1 218 (Opéré Par Air Panama, X1)
03 August 09:45 AÉROPORT MARCOS A. GELABERT PANAMA
(VILLE)
Départ
03 August 10:45 ISLA COLON INTL BOCAS DEL TOROArrivée
Scan for check-in. Not to be used
as boarding pass.
Economique (Y)Classe
Bagages autorisés 2PC pour PAX
Référence du dossier compagnie X1/N0OP1Q
Reçu de paiement
Mode de paiement : CCVI XXXXXXXXXXXX8445
Compagnie émettrice : HAHN AIR
`;

const AMADEUS_COPA = `
Reçu de Billet Electronique Reference du dossier XLDW2Z CheckMyTrip App
IATA 20255270
Mercredi 12 août 2026
Copa Airlines CM 18 (Opéré Par Copa Airlines, CM)
12 August 09:50 ENRIQUE MALEK INTL DAVIDDépart
12 August 11:03 AÉROPORT DE TOCUMEN PANAMA (VILLE)Arrivée
Economique (W)Classe
Bagages autorisés 1PC pour PAX
Référence du dossier compagnie CM/ACHLQR
Compagnie émettrice : COPA AIRLINES
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
97620170;97620172
Address
700 Meters West From Bridgestone/Firestone, Heredia Province, Heredia, 40703
Guest Room Pool Access 2 Double
Adults
3
Booking name
Guest A
Daily breakfast for two guests
Guest Room Pool Access 2 Double
Adults
3
Booking name
Guest B
Total
$858.80
Cancellation policy
Free cancellation before 23:59 on 8 August 2026
`;

const NANTIPA = `
Santa Teresa - Cobano, Puntarenas
NANTIPA
18093Reservation Number:
RESERVATIONS DETAILS____________________ 08/02/2026 08/07/2026
VILLA BF 5PAX 1 5 2BRI 5 $ 1,530.00 $ 7,650.00
GENERAL HOTEL POLICIES
Check In: 15:00 hours (16:00 in Villas) / Check Out: 12:00 hours
`;

const TRANSFER = `
TRANSFER CONFIRMATION
Service:Départ(DROPOFF)
Type de véhicule: Van
Itinéraire : Waldorf Astoria Panama → Aéroport International de Tocumen (PTY)
Date : 18 août 2026
Heure de prise en charge : 18h45
Le tarif total du service de transport est de 85,00 USD.
`;

describe("redactIngestText", () => {
  it("masque une ligne CCVI", () => {
    const out = redactIngestText("Mode de paiement : CCVI XXXXXXXXXXXX8445");
    assert.equal(out.includes("8445"), false);
    assert.equal(out.includes("CCVI"), false);
  });

  it("masque un PAN dans les notes sans casser l’extract", () => {
    const cleaned = sanitizeExtractedPrices({
      document_status: "quote",
      title: "Rio",
      destination: "Rio",
      start_date: null,
      end_date: null,
      currency: "USD",
      total_amount: 1,
      notes_client: "Mode de paiement : CCVI XXXXXXXXXXXX8445\nDevis à confirmer.",
      customer_email: null,
      customer_first_name: null,
      customer_last_name: null,
      items: [],
      travelers: [],
    });
    assert.equal(cleaned.total_amount, null);
    assert.equal(cleaned.document_status, "quote");
    assert.equal((cleaned.notes_client || "").includes("8445"), false);
    assert.match(cleaned.notes_client || "", /Devis/);
  });
});

describe("inferAirportIata", () => {
  it("mappe Gelabert, Isla Colón, David, Tocumen", () => {
    assert.equal(inferAirportIata("AÉROPORT MARCOS A. GELABERT PANAMA")?.iata, "PAC");
    assert.equal(inferAirportIata("ISLA COLON INTL BOCAS DEL TORO")?.iata, "BOC");
    assert.equal(inferAirportIata("ENRIQUE MALEK INTL DAVID")?.iata, "DAV");
    assert.equal(inferAirportIata("AÉROPORT DE TOCUMEN PANAMA (VILLE)")?.iata, "PTY");
    assert.equal(inferAirportIata("CHARLES-DE-GAULLE PARIS")?.iata, "CDG");
    assert.equal(inferAirportIata("AÉROPORT DE GENÈVE GENÈVE")?.iata, "GVA");
    assert.equal(inferAirportIata("HEATHROW LONDRES")?.iata, "LHR");
    assert.equal(inferAirportIata("MARSEILLE PROVENCE MARSEILLE")?.iata, "MRS");
  });
});

describe("parseAmadeusReceipt", () => {
  it("lit Hahn Air / Air Panama sans IATA imprimé", () => {
    const parsed = parseAmadeusReceipt(AMADEUS_HAHN);
    assert.ok(parsed);
    assert.equal(parsed.confirmation_ref, "XL8LPD");
    assert.equal(parsed.pnr, "N0OP1Q");
    assert.equal(parsed.airline, "Air Panama");
    assert.equal(parsed.supplier, "HAHN AIR");
    assert.equal(parsed.flight_number, "X1 218");
    assert.equal(parsed.from, "PAC");
    assert.equal(parsed.to, "BOC");
    assert.equal(parsed.start_at, "2026-08-03T09:45:00");
    assert.equal(parsed.end_at, "2026-08-03T10:45:00");
    assert.equal(parsed.baggage, "2PC");
    assert.equal(parsed.cabin, "Economique (Y)");
    assert.notEqual(parsed.confirmation_ref, "20287864");
  });

  it("lit Copa David → Tocumen", () => {
    const parsed = parseAmadeusReceipt(AMADEUS_COPA);
    assert.ok(parsed);
    assert.equal(parsed.confirmation_ref, "XLDW2Z");
    assert.equal(parsed.airline, "Copa Airlines");
    assert.equal(parsed.flight_number, "CM 18");
    assert.equal(parsed.from, "DAV");
    assert.equal(parsed.to, "PTY");
    assert.equal(parsed.start_at, "2026-08-12T09:50:00");
  });
});

describe("parseDocumentMoney", () => {
  it("lit le total hôtel Little Emperors sans le coller au prix vendu", () => {
    assert.deepEqual(parseDocumentMoney(LE_HOTEL), { amount: 858.8, currency: "USD" });
    const items = parsedItemsFromText(LE_HOTEL).items;
    assert.equal(items[0]?.amount, null);
    assert.equal(items[0]?.details?.document_amount, 858.8);
    assert.equal(items[0]?.details?.document_currency, "USD");
    const cleaned = sanitizeExtractedPrices({
      document_status: "confirmed",
      title: "Costa Rica",
      destination: "Costa Rica",
      start_date: "2026-08-10",
      end_date: "2026-08-11",
      currency: "USD",
      total_amount: 858.8,
      notes_client: null,
      customer_email: null,
      customer_first_name: null,
      customer_last_name: null,
      items,
      travelers: [],
    });
    assert.equal(cleaned.total_amount, null);
    assert.equal(cleaned.items[0].amount, null);
    assert.equal(cleaned.items[0].details?.document_amount, 858.8);
  });

  it("lit le tarif transfert USD", () => {
    assert.deepEqual(parseDocumentMoney(TRANSFER), { amount: 85, currency: "USD" });
    const items = parsedItemsFromText(TRANSFER).items;
    assert.equal(items[0]?.details?.document_amount, 85);
  });
});

describe("parseLittleEmperorsHotel", () => {
  it("garde un hôtel et deux chambres, sans le net", () => {
    const parsed = parseLittleEmperorsHotel(LE_HOTEL);
    assert.ok(parsed);
    assert.match(parsed.hotel_name || "", /Marriott Hotel Hacienda Belen/i);
    assert.equal(parsed.confirmation_ref, "97620170;97620172");
    assert.equal(parsed.start_at, "2026-08-10");
    assert.equal(parsed.end_at, "2026-08-11");
    assert.equal(parsed.rooms.length, 2);
    assert.equal(parsed.included.includes("Petit-déjeuner"), true);
    assert.equal(JSON.stringify(parsed).includes("858"), false);
  });
});

describe("parseNantipaConfirmation", () => {
  it("lit les dates US sans l’heure CGV 15:00", () => {
    const parsed = parseNantipaConfirmation(NANTIPA);
    assert.ok(parsed);
    assert.equal(parsed.confirmation_ref, "18093");
    assert.equal(parsed.start_at, "2026-08-02");
    assert.equal(parsed.end_at, "2026-08-07");
    assert.equal(parsed.start_at?.includes("T"), false);
    assert.match(parsed.rooms[0]?.room || "", /VILLA/i);
  });
});

describe("parseTransferConfirmation", () => {
  it("lit dropoff Van sans le tarif", () => {
    const parsed = parseTransferConfirmation(TRANSFER);
    assert.ok(parsed);
    assert.match(parsed.pickup || "", /Waldorf/i);
    assert.match(parsed.dropoff || "", /Tocumen/i);
    assert.equal(parsed.vehicle, "Van");
    assert.equal(parsed.start_at, "2026-08-18T18:45:00");
  });
});

describe("parseUsMonthDayYear", () => {
  it("lit 08/02/2026 comme 2 août", () => {
    assert.equal(parseUsMonthDayYear("08/02/2026 08/07/2026"), "2026-08-02");
  });
});

describe("structuredHintFromPdfText", () => {
  it("marque un devis Passion comme quote", () => {
    const hint = structuredHintFromPdfText("DevisPassion Collection | Luxury Travel\nNº 33826");
    assert.match(hint, /quote/i);
  });

  it("ne prend pas Scan for check-in pour un hôtel", () => {
    const hint = structuredHintFromPdfText(AMADEUS_HAHN);
    assert.match(hint, /VOL /);
    assert.equal(hint.includes("HOTEL"), false);
    assert.equal(hint.includes("8445"), false);
  });

  it("classe Toucan comme activités", () => {
    const hint = structuredHintFromPdfText(
      "TOUCAN DISCOVERY\nÉTAPE 1\nEl Silencio Lodge\nParc National Manuel Antonio"
    );
    assert.match(hint, /activités/i);
    assert.equal(hint.includes("HOTEL"), false);
  });
});

describe("applyStructuredHints", () => {
  it("fusionne dix e-tickets du même vol et complète l’IATA", () => {
    const extract = applyStructuredHints(
      {
        document_status: "confirmed",
        title: "Panama",
        destination: "Panama",
        start_date: null,
        end_date: null,
        currency: "USD",
        total_amount: 12,
        notes_client: null,
        customer_email: null,
        customer_first_name: null,
        customer_last_name: null,
        items: Array.from({ length: 5 }, () => ({
          kind: "flight" as const,
          title: "Vol",
          supplier: null,
          confirmation_ref: "XL8LPD",
          start_at: "2026-08-03T09:45:00",
          end_at: null,
          amount: 99,
          details: { flight_number: "X1 218" },
        })),
        travelers: [],
      },
      [AMADEUS_HAHN, AMADEUS_HAHN, AMADEUS_COPA]
    );
    const flights = extract.items.filter((item) => item.kind === "flight");
    assert.equal(flights.length, 2);
    const hahn = flights.find((item) => item.details?.flight_number === "X1 218");
    assert.equal(hahn?.details?.from, "PAC");
    assert.equal(hahn?.details?.to, "BOC");
    const copa = flights.find((item) => item.details?.flight_number === "CM 18");
    assert.equal(copa?.details?.from, "DAV");
  });
});

describe("findMatchingItem hotel dual-ref", () => {
  it("rapproche 97620170 et 97620170;97620172", () => {
    const existing = [{ kind: "hotel", confirmation_ref: "97620170", title: "Marriott" }];
    const hit = findMatchingItem(existing, {
      kind: "hotel",
      confirmation_ref: "97620170;97620172",
    });
    assert.equal(hit?.title, "Marriott");
  });
});

describe("mergeExtractItems", () => {
  it("garde un vol pour cinq passagers", () => {
    const merged = mergeExtractItems(
      Array.from({ length: 5 }, (_, i) => ({
        kind: "flight",
        confirmation_ref: "XL8LPD",
        start_at: "2026-08-03T09:45:00",
        title: `Pax ${i}`,
        details: { flight_number: "X1 218" },
      }))
    );
    assert.equal(merged.length, 1);
  });
});

const SAMPLE_DIR = "/tmp/ingest-samples/text";
const UPLOAD_DIR = "/tmp/ingest-uploads";

const AMADEUS_AF_RT = `
Reçu de Billet Electronique Reference du dossier AB12CD CheckMyTrip App
IATA 20289905
Vendredi 18 septembre 2026
Check-in
Air France AF 1142 (Opéré Par Air France, AF)
18 September 15:00 CHARLES-DE-GAULLE PARIS Terminal : 2F - Aerogare 2
Terminal F
Départ
18 September 16:10 AÉROPORT DE GENÈVE GENÈVE Terminal : 1Arrivée
Economique (V)Classe
Bagages autorisés 2PC pour PAX
Dimanche 20 septembre 2026
Check-in
Air France AF 1643 (Opéré Par Air France, AF)
20 September 10:30 AÉROPORT DE GENÈVE GENÈVE Terminal : 1Départ
20 September 11:45 CHARLES-DE-GAULLE PARIS Terminal : 2F - Aerogare 2
Terminal F
Arrivée
Economique (F)Classe
Bagages autorisés 2PC pour PAX
Référence du dossier compagnie AF/AB12CD
Compagnie émettrice : AIR FRANCE
`;

const AMADEUS_BA = `
Reçu de Billet Electronique Reference du dossier XY34ZT CheckMyTrip App
Samedi 03 octobre 2026
British Airways BA 346 (Opéré Par British Airways, BA)
03 October 09:20 HEATHROW LONDRES Terminal : 3Départ
03 October 12:20 MARSEILLE PROVENCE MARSEILLE Terminal : 1Arrivée
Economique (N)Classe
Bagages autorisés 1PC pour PAX
Référence du dossier compagnie BA/XY34ZT
Compagnie émettrice : BRITISH AIRWAYS
`;

const SIXT = `
Votre réservation chez SIXT Genève (Genf) Aéroport est confirmée : #1234567890
Pickup on 18 Septembre 2026 at 16:00
Genève (Genf) Aéroport - Terminal 1, Centre de location de
voitures
Voir l’itinéraire
Return on 20 Septembre 2026 at 09:30
Genève (Genf) Aéroport - Route de Pre-Bois 29 (P51), Geneve
(Meyrin), Suisse 1215
See map
Votre catégorie réservée est Intermédiaire SUV
Smart #3 Brabus ou similaire
Total (TTC) CHF 333.10
Caution remboursable
Numéro de réservation : 1234567890
`;

const LEELA = `
Greetings from The Leela Mumbai!
we are pleased to confirm your reservation as per the details below:
Reservation StatusGuest Name(s)
Guest Test
Reservation Number
1500001111
Check In
14-SEP-26
Check Out
17-SEP-26
Adults Per Room
1
Room Type
Premier City View
Grand Total
13,750.00 INR
TENTATIVE
The Leela Mumbai
Sahar,Andheri East,Mumbai-400059,India
Total Duration of Stay
3
14:00 12:00
Pick Up Time
Drop Off Time
00:00 00:00
RESERVATION CONFIRMATION
Cancellation Policy : Reservation must be cancelled 48 hours prior
`;

describe("parseAmadeusFlights aller-retour", () => {
  it("crée deux segments CDG → GVA et GVA → CDG", () => {
    const flights = parseAmadeusFlights(AMADEUS_AF_RT);
    assert.equal(flights.length, 2);
    assert.equal(flights[0].from, "CDG");
    assert.equal(flights[0].to, "GVA");
    assert.equal(flights[0].flight_number, "AF 1142");
    assert.equal(flights[0].start_at, "2026-09-18T15:00:00");
    assert.equal(flights[0].terminal, "2F");
    assert.equal(flights[1].from, "GVA");
    assert.equal(flights[1].to, "CDG");
    assert.equal(flights[1].flight_number, "AF 1643");
    assert.equal(flights[1].start_at, "2026-09-20T10:30:00");
  });

  it("lit Heathrow → Marseille", () => {
    const parsed = parseAmadeusReceipt(AMADEUS_BA);
    assert.ok(parsed);
    assert.equal(parsed.from, "LHR");
    assert.equal(parsed.to, "MRS");
    assert.equal(parsed.flight_number, "BA 346");
    assert.equal(parsed.start_at, "2026-10-03T09:20:00");
    assert.equal(parsed.terminal, "3");
  });
});

describe("parseSixtCar", () => {
  it("lit prise et restitution sans le TTC", () => {
    const parsed = parseSixtCar(SIXT);
    assert.ok(parsed);
    assert.equal(parsed.confirmation_ref, "1234567890");
    assert.equal(parsed.start_at, "2026-09-18T16:00:00");
    assert.equal(parsed.end_at, "2026-09-20T09:30:00");
    assert.match(parsed.pickup || "", /Genève/);
    assert.match(parsed.vehicle || "", /Intermédiaire SUV/);
    assert.equal(JSON.stringify(parsed).includes("333"), false);
  });
});

describe("parseHotelConfirmationLetter", () => {
  it("lit The Leela en date only, sans 14:00 ni tarif", () => {
    const parsed = parseHotelConfirmationLetter(LEELA);
    assert.ok(parsed);
    assert.equal(parsed.start_at, "2026-09-14");
    assert.equal(parsed.end_at, "2026-09-17");
    assert.equal(parsed.start_at?.includes("T"), false);
    assert.match(parsed.hotel_name || "", /Leela Mumbai/i);
    assert.equal(parsed.needs_review, true);
    assert.equal(JSON.stringify(parsed).includes("13750"), false);
  });
});

describe("parseDdMonYy", () => {
  it("lit 14-SEP-26", () => {
    assert.equal(parseDdMonYy("14-SEP-26"), "2026-09-14");
  });
});

describe("échantillons PDF agence", () => {
  const eticket = `${SAMPLE_DIR}/etickets/eticket-01.txt`;
  if (!existsSync(eticket)) return;

  it("parse un e-ticket Amadeus réel", () => {
    const parsed = parseAmadeusReceipt(readFileSync(eticket, "utf8"));
    assert.ok(parsed);
    assert.equal(parsed.from, "PAC");
    assert.equal(parsed.to, "BOC");
    assert.equal(parsed.start_at, "2026-08-03T09:45:00");
    assert.equal(parsed.confirmation_ref.length, 6);
  });

  it("parse le Marriott Little Emperors réel", () => {
    const parsed = parseLittleEmperorsHotel(
      readFileSync(`${SAMPLE_DIR}/hotel/hotel-01.txt`, "utf8")
    );
    assert.ok(parsed);
    assert.equal(parsed.confirmation_ref, "97620170;97620172");
    assert.equal(parsed.rooms.length, 2);
    assert.match(parsed.hotel_name || "", /Marriott/i);
  });

  it("parse Nantipa réel en MM/DD", () => {
    const parsed = parseNantipaConfirmation(
      readFileSync(`${SAMPLE_DIR}/hotel/nantipa-01.txt`, "utf8")
    );
    assert.ok(parsed);
    assert.equal(parsed.start_at, "2026-08-02");
    assert.equal(parsed.end_at, "2026-08-07");
  });
});

describe("PDF déposés (upload)", () => {
  const files = existsSync(UPLOAD_DIR)
    ? readdirSync(UPLOAD_DIR).filter((name) => name.endsWith(".txt"))
    : [];
  if (!files.length) return;

  it("découpe l’aller-retour Air France en deux vols", () => {
    const name = files.find((row) => /PARIS_GENEVA|GENEVA/i.test(row));
    if (!name) return;
    const flights = parseAmadeusFlights(readFileSync(`${UPLOAD_DIR}/${name}`, "utf8"));
    assert.equal(flights.length, 2);
    assert.equal(flights[0].from, "CDG");
    assert.equal(flights[0].to, "GVA");
    assert.equal(flights[1].from, "GVA");
    assert.equal(flights[1].to, "CDG");
    assert.equal(flights[0].start_at, "2026-09-18T15:00:00");
  });

  it("lit Heathrow → Marseille", () => {
    const name = files.find((row) => /LONDON_MARSEILLE|MARSEILLE/i.test(row));
    if (!name) return;
    const parsed = parseAmadeusReceipt(readFileSync(`${UPLOAD_DIR}/${name}`, "utf8"));
    assert.equal(parsed?.from, "LHR");
    assert.equal(parsed?.to, "MRS");
  });

  it("lit SIXT sans le tarif CHF", () => {
    const name = files.find((row) => /SIXT/i.test(row));
    if (!name) return;
    const parsed = parseSixtCar(readFileSync(`${UPLOAD_DIR}/${name}`, "utf8"));
    assert.ok(parsed);
    assert.equal(parsed.start_at, "2026-09-18T16:00:00");
    assert.equal(parsed.end_at, "2026-09-20T09:30:00");
    assert.equal(JSON.stringify(parsed).includes("333"), false);
  });

  it("lit The Leela sans heure de politique ni transfert 00:00", () => {
    const hit = files.find((row) =>
      /The Leela Mumbai/i.test(readFileSync(`${UPLOAD_DIR}/${row}`, "utf8"))
    );
    if (!hit) return;
    const text = readFileSync(`${UPLOAD_DIR}/${hit}`, "utf8");
    const parsed = parseHotelConfirmationLetter(text);
    assert.ok(parsed);
    assert.equal(parsed.start_at, "2026-09-14");
    assert.equal(parsed.end_at, "2026-09-17");
    assert.equal(parseTransferConfirmation(text), null);
  });
});
