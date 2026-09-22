import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrmBookingItem } from "./types";
import {
  carnetVisible,
  coverQuery,
  flightCardSubtitle,
  flightCardTitle,
  flightCities,
  flightIata,
  groupByDay,
  hotelCityLine,
  hotelDisplayName,
  hotelStayLabel,
  itemClock,
  itemPriceLabel,
  unlinkedDocuments,
  whatsappModifyHref,
} from "./carnet";
import { canPublishCarnet } from "./bookings";
import { bookingCoverUrl } from "./covers";
import { sanitizeExtractedPrices } from "./ingest-types";
import { formatMoney } from "./money";

function item(partial: Partial<CrmBookingItem>): CrmBookingItem {
  return {
    id: "i",
    booking_id: "b",
    kind: "flight",
    title: "Vol",
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("carnet", () => {
  it("liste à part les pièces non rattachées à une carte", () => {
    const doc = (id: string) => ({
      id,
      booking_id: "b",
      kind: "pdf",
      file_name: `${id}.pdf`,
      mime_type: "application/pdf",
      storage_path: `bookings/b/${id}.pdf`,
      visible_to_client: true,
      created_at: "",
    });
    const docs = [doc("linked"), doc("voucher")];
    const orphans = unlinkedDocuments(docs, [item({ source_document_id: "linked" })]);
    assert.deepEqual(orphans.map((d) => d.id), ["voucher"]);
    assert.equal(unlinkedDocuments(docs, []).length, 2);
  });

  it("écrit 3 nuits sans répéter les jours", () => {
    const label = hotelStayLabel(
      item({
        kind: "hotel",
        start_at: "2026-08-12",
        end_at: "2026-08-15",
      })
    );
    assert.match(label, /3 nuits/);
  });

  it("affiche le nom d’hôtel avant la ville", () => {
    const hotel = item({
      kind: "hotel",
      title: "Santa Teresa",
      details: { hotel_name: "Nantipa", city: "Santa Teresa" },
    });
    assert.equal(hotelDisplayName(hotel), "Nantipa");
    assert.equal(hotelCityLine(hotel), "Santa Teresa");
    assert.equal(
      hotelDisplayName(item({ kind: "hotel", title: "Andaz", details: { city: "Marrakech" } })),
      "Andaz"
    );
  });

  it("saute les jours sans prestation", () => {
    const groups = groupByDay([
      item({ start_at: "2026-08-12T10:00:00Z", title: "Aller" }),
      item({ start_at: "2026-08-20T18:00:00Z", title: "Retour" }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0][0], "2026-08-12");
  });

  it("répète l’hôtel chaque nuit du séjour", () => {
    const groups = groupByDay([
      item({
        id: "h",
        kind: "hotel",
        title: "Andaz",
        start_at: "2026-08-12",
        end_at: "2026-08-15",
      }),
      item({ id: "f", start_at: "2026-08-12T10:00:00", title: "Aller" }),
    ]);
    assert.equal(groups.map(([day]) => day).join(","), "2026-08-12,2026-08-13,2026-08-14");
    assert.equal(groups[1][1].some((row) => row.title === "Andaz"), true);
    assert.equal(groups[1][1].some((row) => row.title === "Aller"), false);
  });

  it("n’affiche l’activité ski que le jour d’arrivée", () => {
    const groups = groupByDay([
      item({
        id: "h",
        kind: "hotel",
        title: "L'Amara",
        start_at: "2027-03-20",
        end_at: "2027-03-27",
      }),
      item({
        id: "a",
        kind: "activity",
        title: "Forfaits Les Portes du Soleil",
        start_at: "2027-03-20",
        end_at: "2027-03-27",
      }),
    ]);
    assert.equal(groups.map(([day]) => day).join(","), "2027-03-20,2027-03-21,2027-03-22,2027-03-23,2027-03-24,2027-03-25,2027-03-26");
    assert.equal(groups[0][1].some((row) => row.kind === "activity"), true);
    assert.equal(groups[1][1].some((row) => row.kind === "activity"), false);
  });

  it("répète la location chaque jour, sans le jour de restitution", () => {
    const groups = groupByDay([
      item({
        id: "c",
        kind: "car",
        title: "Hertz",
        start_at: "2026-08-12",
        end_at: "2026-08-15",
      }),
    ]);
    assert.equal(groups.map(([day]) => day).join(","), "2026-08-12,2026-08-13,2026-08-14");
  });

  it("affiche le prix vendu seulement le premier jour", () => {
    const hotel = item({
      kind: "hotel",
      amount: 800,
      start_at: "2026-08-12",
      end_at: "2026-08-15",
    });
    assert.equal(itemPriceLabel(hotel, "EUR", "2026-08-12"), formatMoney(800, "EUR"));
    assert.equal(itemPriceLabel(hotel, "EUR", "2026-08-13"), null);
    assert.equal(itemPriceLabel(hotel, "EUR", "2026-08-14"), null);
    assert.equal(itemPriceLabel(hotel, "EUR"), formatMoney(800, "EUR"));

    const flight = item({
      kind: "flight",
      amount: 250,
      start_at: "2026-08-12T22:00:00",
      end_at: "2026-08-13T08:00:00",
    });
    assert.equal(itemPriceLabel(flight, "EUR", "2026-08-12"), formatMoney(250, "EUR"));
    assert.equal(itemPriceLabel(flight, "EUR", "2026-08-13"), null);

    const car = item({
      kind: "car",
      amount: 400,
      start_at: "2026-08-12",
      end_at: "2026-08-18",
    });
    assert.equal(itemPriceLabel(car, "EUR", "2026-08-12"), formatMoney(400, "EUR"));
    assert.equal(itemPriceLabel(car, "EUR", "2026-08-15"), null);
  });

  it("cache un séjour sans carte visible", () => {
    assert.equal(
      carnetVisible({ visible_to_client: true }, [
        item({ visible_to_client: false, kind: "hotel" }),
      ]),
      false
    );
    assert.equal(
      carnetVisible({ visible_to_client: true }, [
        item({ visible_to_client: true, kind: "hotel" }),
      ]),
      true
    );
  });

  it("prend la ville d’arrivée, pas Paris", () => {
    assert.equal(coverQuery("Marrakech · Essaouira", "Voyage"), "Marrakech");
    assert.equal(coverQuery("Paris · Marrakech", "Voyage"), "Marrakech");
    assert.equal(coverQuery("CDG → RAK", "Vol"), "RAK");
    assert.equal(coverQuery("Paris", "Week-end"), "Paris");
    assert.equal(coverQuery("Nice, France", null), "Nice");
  });

  it("sert une couverture Unsplash légère", () => {
    const url = bookingCoverUrl(
      { destination: "Marrakech", title: "Voyage", cover_image_path: null },
      800
    );
    assert.match(url, /w=800/);
    assert.match(url, /h=600/);
    assert.match(url, /q=70/);
  });

  it("respecte l’ordre agent dans un même jour", () => {
    const groups = groupByDay([
      item({ id: "b", start_at: "2026-08-12T18:00:00", title: "Soir", sort_order: 0 }),
      item({ id: "a", start_at: "2026-08-12T08:00:00", title: "Matin", sort_order: 1 }),
    ]);
    assert.equal(groups[0][1][0].title, "Soir");
    assert.equal(groups[0][1][1].title, "Matin");
  });

  it("prépare le WhatsApp de modification", () => {
    const href = whatsappModifyHref("33756841315", "TBA-1042", "Marrakech");
    assert.match(href, /wa\.me\/33756841315/);
    assert.match(href, /TBA-1042/);
  });

  it("affiche l’heure locale imprimée sans conversion", () => {
    assert.equal(itemClock("2026-08-12T08:40:00"), "08h40");
    assert.equal(itemClock("2026-08-12T00:00:00"), "");
  });

  it("sépare IATA et villes sur le vol", () => {
    const flight = item({
      title: "Paris → Marrakech",
      details: { from: "CDG", to: "RAK", city_from: "Paris", city_to: "Marrakech" },
    });
    assert.equal(flightIata(flight), "CDG → RAK");
    assert.equal(flightCities(flight), "Paris → Marrakech");
    assert.equal(flightCardTitle(flight), "CDG → RAK");
    assert.equal(flightCardSubtitle(flight), "Paris → Marrakech");
  });

  it("affiche le prix unitaire × billets", () => {
    const flight = item({
      kind: "flight",
      amount: 250,
      details: { ticket_count: 5 },
    });
    assert.equal(itemPriceLabel(flight, "EUR"), `5 × ${formatMoney(250, "EUR")}`);
    assert.equal(
      itemPriceLabel(item({ kind: "flight", amount: 250 }), "EUR"),
      formatMoney(250, "EUR")
    );
  });

  it("refuse de publier un carnet sans carte métier", () => {
    assert.equal(canPublishCarnet([{ kind: "fee" }]), false);
    assert.equal(canPublishCarnet([{ kind: "hotel" }]), true);
  });

  it("propose le total séjour depuis le montant document, sans coller le net sur la carte", () => {
    const cleaned = sanitizeExtractedPrices({
      document_status: "confirmed",
      title: "Marrakech",
      destination: "Marrakech",
      start_date: "2026-08-12",
      end_date: "2026-08-15",
      currency: "EUR",
      total_amount: 858.8,
      notes_client: null,
      customer_email: null,
      customer_first_name: null,
      customer_last_name: null,
      items: [
        {
          kind: "hotel",
          title: "Andaz",
          supplier: null,
          confirmation_ref: "97620170",
          start_at: "2026-08-12",
          end_at: "2026-08-15",
          amount: 858.8,
          details: {},
        },
      ],
      travelers: [],
    });
    assert.equal(cleaned.total_amount, 858.8);
    assert.equal(cleaned.items[0].amount, null);
    assert.equal(cleaned.items[0].details?.document_amount, 858.8);
    assert.equal(cleaned.items[0].details?.document_currency, "EUR");
  });
});
