import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandMark } from "../../components/crm/BrandMark";
import { CarnetItinerary } from "../../components/account/CarnetItinerary";
import {
  airlineIataFromFlightNumber,
  brandMarkForItem,
  inferAirlineIata,
  inferCarBrand,
  inferRailBrand,
} from "./brand-marks";
import type { CrmBookingItem } from "./types";
import type { PublicBooking } from "./public-booking";

test("IATA depuis le n° de vol ou le nom", () => {
  assert.equal(airlineIataFromFlightNumber("AF 1789"), "AF");
  assert.equal(inferAirlineIata({ airline: "Copa Airlines", flight_number: "CM 123" }), "CM");
  assert.equal(inferAirlineIata({ airline: "Air France" }), "AF");
  assert.equal(inferAirlineIata({ airline: "Royal Air Maroc" }), "AT");
  assert.equal(inferAirlineIata({ airline: "TUI fly" }), "TB");
  assert.equal(inferAirlineIata({ airline_iata: "7P" }), "7P");
});

test("logos vol et SIXT", () => {
  const flight = brandMarkForItem({
    kind: "flight",
    details: { airline: "Air France", flight_number: "AF 1" },
  });
  assert.equal(flight?.code, "AF");
  assert.match(flight?.src || "", /AF/);
  const car = brandMarkForItem({ kind: "car", supplier: "SIXT" });
  assert.equal(car?.code, "sixt");
  assert.equal(inferCarBrand("Hertz Genève")?.slug, "hertz");
  const alamo = brandMarkForItem({ kind: "car", supplier: "Expedia TAAP / Alamo" });
  assert.equal(alamo?.code, "alamo");
  assert.equal(alamo?.src, "/brands/cars/alamo.svg");
  const budget = brandMarkForItem({
    kind: "car",
    supplier: "Expedia TAAP",
    title: "Le Mesnil-Amelot : location Budget (Standard)",
  });
  assert.equal(budget?.code, "budget");
  assert.equal(budget?.src, "/brands/cars/budget.svg");
  assert.equal(brandMarkForItem({ kind: "car", supplier: "Expedia TAAP", title: "Peugeot 3008" }), null);
});

test("compagnie ferroviaire : le champ opérateur prime, sinon le train, le produit ou le fournisseur", () => {
  assert.equal(inferRailBrand({ operator: "Eurostar" })?.slug, "eurostar");
  assert.equal(inferRailBrand({ operator: "Thalys" })?.slug, "eurostar");
  assert.equal(inferRailBrand({ compagnie: "Trenitalia" })?.slug, "trenitalia");
  assert.equal(inferRailBrand({ airline: "Italo" })?.slug, "italo");
  assert.equal(inferRailBrand({ carrier: "Renfe" })?.slug, "renfe");
  assert.equal(inferRailBrand({ railway: "Deutsche Bahn" })?.slug, "db");
  assert.equal(inferRailBrand({ company: "SBB CFF FFS" })?.slug, "sbb");
  assert.equal(inferRailBrand({ operator: "ÖBB" })?.slug, "obb");
  assert.equal(inferRailBrand({ operator: "SNCB" })?.slug, "sncb");
  assert.equal(inferRailBrand({ operator: "SNCF" })?.slug, "sncf");

  assert.equal(inferRailBrand({ operator: "SNCF", title: "Lyria 9211 Paris → Genève" })?.slug, "sncf");
  assert.equal(inferRailBrand({ operator: "Trainline", title: "TGV INOUI 6941" })?.slug, "sncf");

  assert.equal(inferRailBrand({ train_number: "TGV INOUI 6941" })?.slug, "sncf");
  assert.equal(inferRailBrand({ flight_number: "OUIGO 7651" })?.slug, "sncf");
  assert.equal(inferRailBrand({ product: "Intercités" })?.slug, "sncf");
  assert.equal(inferRailBrand({ title: "TER 875412 Paris → Chartres" })?.slug, "sncf");
  assert.equal(inferRailBrand({ supplier: "SNCF Connect", title: "Paris → Lyon" })?.slug, "sncf");
  assert.equal(inferRailBrand({ supplier: "SNCF Connect", title: "Lyria 9211 Paris → Genève" })?.slug, "lyria");

  assert.equal(inferRailBrand({ title: "Thalys 9345 Paris → Bruxelles" })?.slug, "eurostar");
  assert.equal(inferRailBrand({ flight_number: "ES 9014" })?.slug, "eurostar");
  assert.equal(inferRailBrand({ product: "Frecciarossa" })?.slug, "trenitalia");
  assert.equal(inferRailBrand({ train_number: "FR 9610" })?.slug, "trenitalia");
  assert.equal(inferRailBrand({ product_name: "AVE 03104" })?.slug, "renfe");
  assert.equal(inferRailBrand({ title: "Iryo Madrid → Barcelone" })?.slug, "iryo");
  assert.equal(inferRailBrand({ train_number: "ICE 955" })?.slug, "db");
  assert.equal(inferRailBrand({ supplier: "CFF" })?.slug, "sbb");
  assert.equal(inferRailBrand({ supplier: "FFS" })?.slug, "sbb");
  assert.equal(inferRailBrand({ title: "Railjet 60" })?.slug, "obb");
  assert.equal(inferRailBrand({ supplier: "NMBS" })?.slug, "sncb");
  assert.equal(inferRailBrand({ service: "inOui" })?.slug, "sncf");

  assert.equal(inferRailBrand({ supplier: "Trainline", title: "New York → Washington" }), null);
  assert.equal(inferRailBrand({ title: "Notice de voyage" }), null);
  assert.equal(inferRailBrand({ title: "Avenue de la gare" }), null);
  assert.equal(inferRailBrand({ title: "Terminus" }), null);
  assert.equal(inferRailBrand({ product: "Intercités" })?.slug, "sncf");
});

test("la carte train prend le logo local, ou l’icône train s’il n’y a pas de compagnie", () => {
  const sncf = brandMarkForItem({
    kind: "rail",
    supplier: "SNCF Connect",
    title: "TGV INOUI 6941 Paris → Chambéry",
  });
  assert.equal(sncf?.kind, "rail");
  assert.equal(sncf?.code, "sncf");
  assert.equal(sncf?.src, "/brands/rail/sncf.svg");
  assert.equal(sncf?.alt, "SNCF");

  const logos = ["sncf", "eurostar", "trenitalia", "italo", "renfe", "iryo", "db", "sbb", "obb", "lyria", "sncb"];
  for (const slug of logos) {
    const svg = readFileSync(join(process.cwd(), "public/brands/rail", `${slug}.svg`), "utf8");
    assert.match(svg, /<svg/);
    assert.equal(svg.includes("<image"), false);
    assert.equal(/https?:\/\/(?!www\.w3\.org)/.test(svg), false);
  }

  assert.equal(
    brandMarkForItem({ kind: "rail", supplier: "Amtrak", title: "New York → Washington" }),
    null
  );

  const marked = renderToStaticMarkup(
    createElement(BrandMark, {
      item: { kind: "rail", supplier: "Eurostar", title: "Paris → Londres" },
      className: "h-10 w-10",
    })
  );
  assert.match(marked, /src="\/brands\/rail\/eurostar\.svg"/);
  assert.match(marked, /alt="Eurostar"/);
  assert.match(marked, /h-10 w-10/);

  const plain = renderToStaticMarkup(
    createElement(BrandMark, {
      item: { kind: "rail", title: "New York → Washington" },
      className: "h-10 w-10",
    })
  );
  assert.equal(plain.includes("/brands/rail/"), false);
  assert.match(plain, /bg-\[var\(--admin-peach\)\]/);

  const booking = {
    id: "b1",
    reference: "TB-2026-0001",
    title: "Lyon",
    destination: "Lyon",
    start_date: "2026-06-12",
    end_date: "2026-06-12",
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
    updated_at: "2026-06-01T00:00:00.000Z",
  } as PublicBooking;
  const train: CrmBookingItem = {
    id: "train",
    booking_id: "b1",
    kind: "rail",
    title: "Paris → Lyon",
    supplier: "SNCF Connect",
    confirmation_ref: null,
    start_at: "2026-06-12T07:12:00",
    end_at: "2026-06-12T09:18:00",
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: { flight_number: "TGV INOUI 6601", train_number: "6601" },
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
  };
  const carnet = renderToStaticMarkup(
    createElement(CarnetItinerary, { booking, items: [train], docs: [] })
  );
  assert.match(carnet, /src="\/brands\/rail\/sncf\.svg"/);
  assert.match(carnet, /h-10 w-10/);

  const panel = readFileSync(join(process.cwd(), "components/admin/BookingItemsPanel.tsx"), "utf8");
  assert.match(panel, /item\.kind === "rail" && brandMarkForItem\(item\)/);
  assert.match(panel, /BrandMark item=\{item\} className="h-8 w-8 shrink-0"/);
  const ingest = readFileSync(join(process.cwd(), "components/crm/IngestItemCard.tsx"), "utf8");
  assert.match(ingest, /item\.kind === "rail" && brandMarkForItem\(item\)/);
  assert.match(ingest, /BrandMark item=\{item\} className="h-9 w-9 shrink-0"/);
});
