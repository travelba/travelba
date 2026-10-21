import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGalleryBackfill, planGalleryBackfill, type GalleryStay } from "./hotel-backfill";
import { presentationFromLeHotel } from "./hotel-gallery";

const milanSuperior: GalleryStay = {
  hotel_id: 89,
  hotel_name: "Four Seasons Hotel Milan",
  confirmation_number: "64570SH046735",
  check_in: "2026-12-04",
  check_out: "2026-12-08",
  room_types: ["Superior Room"],
  address: "Via Gesù, 6-8, Milano",
  conditions: ["Free cancellation"],
  benefits: ["Daily breakfast for two guests"],
};

const milanPremium: GalleryStay = {
  ...milanSuperior,
  confirmation_number: "64570SH046795",
  check_out: "2026-12-09",
  room_types: ["Premium Room, King"],
  benefits: ["Hotel credit per stay"],
};

const fairmont: GalleryStay = {
  hotel_id: 349,
  hotel_name: "Fairmont Singapore",
  confirmation_number: "A5G8AKI0592",
  check_in: "2026-11-19",
  check_out: "2026-11-22",
  room_types: ["Deluxe Marina Bay King"],
  address: "80 Bras Basah Road",
  conditions: [],
  benefits: ["Daily breakfast"],
};

function card(partial: {
  title?: string;
  supplier?: string | null;
  confirmation_ref?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: Record<string, unknown>;
}) {
  return {
    kind: "hotel" as const,
    supplier: partial.supplier ?? null,
    confirmation_ref: partial.confirmation_ref ?? null,
    start_at: partial.start_at ?? null,
    end_at: partial.end_at ?? null,
    title: partial.title || "",
    details: partial.details || {},
  };
}

describe("rattrapage galerie Little Emperors", () => {
  it("corrige un identifiant d’un autre hôtel et prend la chambre de la confirmation", () => {
    const item = card({
      title: "Four Seasons Hotel Milano",
      confirmation_ref: "64570SH046735;4378147214",
      start_at: "2026-12-04",
      end_at: "2026-12-08",
      details: {
        source_family: "little_emperors",
        le_hotel_id: 11987,
        hotel_name: "Four Seasons Hotel Milano",
        room: "Chambre Supérieure",
      },
    });
    const plan = planGalleryBackfill(item, [milanSuperior, milanPremium], { hotel_id: 89, name: "Four Seasons Hotel Milan" });
    assert.equal(plan.action, "enrich");
    if (plan.action !== "enrich") return;
    assert.equal(plan.hotelId, 89);
    assert.deepEqual(plan.roomNames, ["Superior Room"]);
    const presentation = presentationFromLeHotel(
      {
        name: "Four Seasons Hotel Milan",
        images_gallery: [
          { image_url: "https://d13bre0qp8legl.cloudfront.net/superior.jpg", description: "Superior Room" },
          { image_url: "https://d13bre0qp8legl.cloudfront.net/premium.jpg", description: "Premium Room" },
          { image_url: "https://d13bre0qp8legl.cloudfront.net/lobby.jpg", description: "Lobby" },
        ],
        child_rooms: [{ name: "Superior Room" }, { name: "Premium Room, King" }],
      },
      plan.roomNames
    );
    const applied = applyGalleryBackfill(item, plan, presentation);
    assert.equal(applied.changed, true);
    assert.equal(applied.item.details?.le_hotel_id, 89);
    assert.equal(applied.item.details?.room, "Chambre Supérieure");
    assert.deepEqual(
      (applied.item.details?.photos as { caption: string; kind: string }[]).filter((photo) => photo.kind === "room").map((photo) => photo.caption),
      ["Superior Room"]
    );
    assert.equal(JSON.stringify(applied.item.details).includes("total_cost"), false);
    const again = applyGalleryBackfill(applied.item, plan, presentation);
    assert.equal(again.changed, false);
  });

  it("ne choisit pas une chambre quand la référence courte couvre plusieurs catégories", () => {
    const item = card({
      title: "Four Seasons Hotel Milan",
      supplier: "Little Emperors",
      confirmation_ref: "64570",
      start_at: "2026-12-04",
      end_at: "2026-12-09",
      details: { hotel_name: "Four Seasons Hotel Milan", source_family: "little_emperors", le_hotel_id: 89, included: ["Déjà écrit"] },
    });
    const plan = planGalleryBackfill(item, [milanSuperior, milanPremium], { hotel_id: 89, name: "Four Seasons Hotel Milan" });
    assert.equal(plan.action, "enrich");
    if (plan.action !== "enrich") return;
    assert.deepEqual(plan.roomNames, []);
    assert.deepEqual(plan.stay?.benefits, []);
  });

  it("relie le Fairmont par le nom et les dates, pas par un cas codé", () => {
    const item = card({
      title: "Fairmont Singapore",
      supplier: "Little Emperors",
      confirmation_ref: "470705216",
      start_at: "2026-11-19",
      end_at: "2026-11-22",
      details: { hotel_name: "Fairmont Singapore", le_hotel_id: 349, source_family: "little_emperors", room: "Deluxe Marina Bay King" },
    });
    const plan = planGalleryBackfill(item, [fairmont], { hotel_id: 349, name: "Fairmont Singapore" });
    assert.equal(plan.action, "enrich");
    if (plan.action !== "enrich") return;
    assert.deepEqual(plan.roomNames, ["Deluxe Marina Bay King"]);
  });

  it("retire l’identifiant Fairmont d’un autre hôtel et ignore une carte qui n’est pas Little Emperors", () => {
    const crowne = card({
      title: "Crowne Plaza Changi Airport",
      supplier: "Expedia TAAP",
      confirmation_ref: "73564866232664",
      details: { source_family: "expedia_taap", le_hotel_id: 349, hotel_name: "Crowne Plaza Changi Airport", included: ["Wifi"] },
    });
    const cleared = planGalleryBackfill(crowne, [fairmont], { hotel_id: 349, name: "Fairmont Singapore" });
    assert.equal(cleared.action, "clear_id");
    const applied = applyGalleryBackfill(crowne, cleared, { photos: [], check_in_time: null, check_out_time: null, address: null });
    assert.equal(applied.item.details?.le_hotel_id, undefined);
    assert.equal(applied.item.details?.source_family, "expedia_taap");
    assert.deepEqual(applied.item.details?.included, ["Wifi"]);
    const other = card({
      title: "AC Hotel Antibes",
      supplier: "Expedia TAAP",
      details: { source_family: "expedia_taap", hotel_name: "AC Hotel Antibes" },
    });
    assert.equal(planGalleryBackfill(other, [], null).reason, "pas une carte Little Emperors");
  });

  it("ne pose pas les photos du Regent sur une carte au nom différent", () => {
    const sample = card({
      title: "Hôtel Exemples",
      details: { source_family: "little_emperors", le_hotel_id: 11987, hotel_name: "Hôtel Exemples" },
    });
    const plan = planGalleryBackfill(sample, [], { hotel_id: 11987, name: "Regent Hong Kong" });
    assert.equal(plan.action, "clear_id");
  });
});
