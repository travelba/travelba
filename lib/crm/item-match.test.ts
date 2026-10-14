import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findHotelBookingCard,
  findHotelSameStay,
  findMatchingItem,
  hotelMatchKeepsStay,
  hotelSameStay,
  hotelRefsShareBooking,
  itemMatchKey,
  keptHotelStayFields,
  mergeExtractItems,
} from "./item-match";

describe("itemMatchKey", () => {
  it("fusionne deux vols au même numéro et jour", () => {
    const a = {
      kind: "flight",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T10:25:00Z",
      details: { flight_number: "AF 123" },
    };
    const b = {
      kind: "flight",
      confirmation_ref: "ABC123",
      start_at: "2026-08-12T10:25:00+02:00",
      details: { flight_number: "AF123" },
    };
    assert.equal(itemMatchKey(a), itemMatchKey(b));
  });

  it("ne fusionne pas aller et retour", () => {
    const out = itemMatchKey({
      kind: "flight",
      start_at: "2026-08-12T10:00:00Z",
      details: { flight_number: "AF123" },
    });
    const back = itemMatchKey({
      kind: "flight",
      start_at: "2026-08-20T18:00:00Z",
      details: { flight_number: "AF124" },
    });
    assert.notEqual(out, back);
  });

  it("trouve l’hôtel existant par réf.", () => {
    const existing = [{ kind: "hotel", confirmation_ref: "97620170", title: "Andaz" }];
    const hit = findMatchingItem(existing, {
      kind: "hotel",
      confirmation_ref: "97620170",
      title: "Andaz Papagayo",
    });
    assert.equal(hit?.title, "Andaz");
  });

  it("n’invente pas de clé sans réf. ni dates", () => {
    assert.equal(itemMatchKey({ kind: "activity", title: "Spa" }), null);
  });

  it("ne fusionne pas forfaits et cours maeva le même jour", () => {
    const merged = mergeExtractItems([
      {
        kind: "activity",
        title: "Forfaits Les Portes du Soleil",
        start_at: "2027-03-20",
        confirmation_ref: null,
      },
      {
        kind: "activity",
        title: "Cours collectifs journée",
        start_at: "2027-03-20",
        confirmation_ref: null,
      },
    ]);
    assert.equal(merged.length, 2);
    const hit = findMatchingItem(merged, {
      kind: "activity",
      title: "Forfaits Les Portes du Soleil",
      start_at: "2027-03-20",
    });
    assert.equal(hit?.title, "Forfaits Les Portes du Soleil");
  });

  it("ouvre une carte train quand le même dossier part un autre jour", () => {
    const existing = [
      {
        kind: "rail",
        confirmation_ref: "FEFZ75",
        title: "Milano · Roma",
        start_at: "2026-12-08T17:35:00+00:00",
      },
    ];
    const incoming = {
      kind: "rail",
      confirmation_ref: "FEFZ75",
      title: "Frecciarossa 9615",
      start_at: "2026-12-09T08:58:00+00:00",
    };
    assert.equal(findMatchingItem(existing, incoming), null);
    const sameDay = mergeExtractItems([
      incoming,
      { ...incoming, title: "Frecciarossa 9615" },
    ]);
    assert.equal(sameDay.length, 1);
  });

  it("fusionne une assurance réimportée par titre et jour", () => {
    const existing = [
      { kind: "insurance", title: "Assurance Multirisques", start_at: "2027-03-20" },
    ];
    const hit = findMatchingItem(existing, {
      kind: "insurance",
      title: "Assurance Multirisques",
      start_at: "2027-03-20",
    });
    assert.equal(hit?.title, "Assurance Multirisques");
  });

  it("complète l’hôtel déjà là quand le nom et les nuits sont les mêmes", () => {
    const existing = [
      {
        kind: "hotel",
        title: "Mondrian Bordeaux Les Carmes",
        confirmation_ref: null,
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      },
    ];
    const incoming = {
      kind: "hotel",
      title: "Mondrian Bordeaux",
      confirmation_ref: "B7G5AJC0552",
      start_at: "2026-10-13",
      end_at: "2026-10-14",
      details: { hotel_name: "Mondrian Bordeaux" },
    };
    assert.equal(findMatchingItem(existing, incoming)?.title, "Mondrian Bordeaux Les Carmes");
    assert.equal(hotelMatchKeepsStay(existing[0], incoming), true);
    const kept = keptHotelStayFields(existing[0], incoming);
    assert.equal(kept.title, "Mondrian Bordeaux Les Carmes");
    assert.equal(kept.confirmation_ref, "B7G5AJC0552");
  });

  it("ne fusionne pas deux hôtels qui ont déjà des références différentes", () => {
    const existing = [
      {
        kind: "hotel",
        title: "Hotel Eden",
        confirmation_ref: "97620170",
        start_at: "2026-06-12",
        end_at: "2026-06-15",
      },
    ];
    const incoming = {
      kind: "hotel",
      title: "Hotel Eden",
      confirmation_ref: "97620171",
      start_at: "2026-06-12",
      end_at: "2026-06-15",
    };
    assert.equal(findHotelSameStay(existing, incoming), null);
    assert.equal(findMatchingItem(existing, incoming), null);
  });

  it("ne choisit pas entre deux hôtels au même nom", () => {
    const existing = [
      {
        kind: "hotel",
        title: "Mondrian Bordeaux",
        confirmation_ref: null,
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      },
      {
        kind: "hotel",
        title: "Mondrian Bordeaux Les Carmes",
        confirmation_ref: null,
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      },
    ];
    assert.equal(
      findHotelSameStay(existing, {
        kind: "hotel",
        title: "Mondrian Bordeaux",
        confirmation_ref: "B7G5AJC0552",
        start_at: "2026-10-13",
        end_at: "2026-10-14",
      }),
      null
    );
  });

  it("reconnaît le numéro court et une autre chambre de la même réservation", () => {
    assert.equal(hotelRefsShareBooking("64570", "64570SH046795"), true);
    assert.equal(hotelRefsShareBooking("64570SH046734", "64570SH046795"), true);
    assert.equal(hotelRefsShareBooking("97620170", "97620171"), false);
    const existing = [
      { kind: "hotel", confirmation_ref: "64570SH046795", title: "Four Seasons Hotel Milan" },
      { kind: "hotel", confirmation_ref: "45609SH011085", title: "Casa Monti" },
    ];
    assert.equal(
      findHotelBookingCard(existing, { kind: "hotel", confirmation_ref: "64570", title: "Hotel Milan" })?.title,
      "Four Seasons Hotel Milan"
    );
    assert.equal(
      findHotelBookingCard(
        [
          { kind: "hotel", confirmation_ref: "64570SH046734", title: "Chambre A" },
          { kind: "hotel", confirmation_ref: "64570SH046795", title: "Chambre B" },
        ],
        { kind: "hotel", confirmation_ref: "64570", title: "Four Seasons" }
      ),
      null
    );
  });

  it("garde le nom et la référence complète de la carte", () => {
    const kept = keptHotelStayFields(
      {
        title: "Four Seasons Hotel Milan",
        confirmation_ref: "64570SH046795",
        supplier: "Little Emperors",
        start_at: "2026-12-04",
        end_at: "2026-12-09",
        details: { hotel_name: "Four Seasons Hotel Milan", included: ["Petit-déjeuner"] },
      },
      {
        title: "Hotel Milan",
        confirmation_ref: "64570",
        supplier: null,
        start_at: "2026-12-04",
        end_at: "2026-12-08",
        details: { hotel_name: "Hotel Milan", included: ["Surclassement"] },
      }
    );
    assert.equal(kept.title, "Four Seasons Hotel Milan");
    assert.equal(kept.confirmation_ref, "64570SH046795");
    assert.equal(kept.end_at, "2026-12-09");
    assert.deepEqual(kept.details.included, ["Petit-déjeuner", "Surclassement"]);
    assert.equal(kept.details.hotel_name, "Four Seasons Hotel Milan");
  });

  it("fusionne cinq e-tickets du même segment", () => {
    const merged = mergeExtractItems(
      Array.from({ length: 5 }, () => ({
        kind: "flight",
        confirmation_ref: "XLDW2Z",
        start_at: "2026-08-12T09:50:00",
        details: { flight_number: "CM 18" },
      }))
    );
    assert.equal(merged.length, 1);
    assert.equal((merged[0]?.details as { ticket_count?: number } | undefined)?.ticket_count, 5);
  });

  it("replie la mention vide sur l’hôtel du même nom qui a des dates", () => {
    const dated = {
      kind: "hotel",
      title: "Fairmont Singapore",
      confirmation_ref: "470705216",
      start_at: "2026-11-19",
      end_at: "2026-11-22",
      details: { hotel_name: "Fairmont Singapore", included: ["Petit-déjeuner"] },
    };
    const hollow = {
      kind: "hotel",
      title: "Fairmont Singapore",
      confirmation_ref: null,
      start_at: null,
      end_at: null,
      details: { hotel_name: "Fairmont Singapore", included: ["Crédit hôtel"] },
    };
    for (const items of [
      [dated, hollow],
      [hollow, dated],
    ]) {
      const merged = mergeExtractItems(items);
      assert.equal(merged.length, 1);
      assert.equal(merged[0]?.confirmation_ref, "470705216");
      assert.equal(merged[0]?.start_at, "2026-11-19");
      assert.equal(merged[0]?.end_at, "2026-11-22");
      const included = (merged[0]?.details as { included?: string[] } | undefined)?.included || [];
      assert.deepEqual([...included].sort(), ["Crédit hôtel", "Petit-déjeuner"]);
    }
    assert.equal(
      hotelSameStay(
        { kind: "hotel", title: "Crowne Plaza Changi Airport", start_at: "2026-11-16", end_at: "2026-11-19" },
        { kind: "hotel", title: "Fairmont Singapore", start_at: "2026-11-19", end_at: "2026-11-22" }
      ),
      false
    );
    assert.equal(
      hotelSameStay(
        { kind: "hotel", title: "Hotel Eden", start_at: "2026-06-01", end_at: "2026-06-04" },
        { kind: "hotel", title: "Autre hôtel", start_at: "2026-06-02", end_at: "2026-06-05" }
      ),
      true
    );
  });
});
