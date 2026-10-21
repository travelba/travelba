import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHotelPresentation,
  applyLeStayFacts,
  attachHotelGallery,
  clearHotelGalleryCache,
  hotelPhotos,
  hotelStayFacts,
  benefitLine,
  catalogNameAgrees,
  pickLeStay,
  presentationFromLeHotel,
  roomCaptionMatches,
  roomsFromStay,
  safePhotoUrl,
  stayClock,
} from "./hotel-gallery";

const CDN = "https://d13bre0qp8legl.cloudfront.net/hotels/349";

function photo(name: string, caption: string) {
  return {
    image_url: `${CDN}/${name}.jpg`,
    thumbnail_url: `${CDN}/${name}-thumb.jpg`,
    description: caption,
  };
}

const fairmont = {
  id: 349,
  name: "Fairmont Singapore",
  address: "80 Bras Basah Road, Singapore 189560",
  short_info: [],
  commission_percentage: "10",
  priority_rate: { commission_percentage: "10" },
  total_cost: "999",
  images_gallery: [
    photo("deluxe", "Deluxe Room"),
    photo("harbour", "Deluxe Harbour King"),
    photo("marina", "Deluxe Marina Bay King"),
    photo("lobby", "Lobby"),
    photo("exterior", "Exterior"),
    photo("pool", "Swimming Pool"),
    photo("prego", "Prego"),
  ],
  child_rooms: [
    { id: 1, name: "Deluxe Room" },
    { id: 2, name: "Deluxe Harbour King" },
    { id: 3, name: "Deluxe Marina Bay King" },
  ],
};

describe("photos de chambre Little Emperors", () => {
  it("prend la chambre nommée, pas une autre chambre Deluxe", () => {
    assert.equal(roomCaptionMatches("Deluxe Marina Bay King", "Deluxe Room"), false);
    assert.equal(roomCaptionMatches("Deluxe Marina Bay King", "Deluxe Harbour King"), false);
    assert.equal(roomCaptionMatches("Deluxe Marina Bay King", "deluxe marina bay king room"), true);
    assert.equal(roomCaptionMatches("Panoramic Sea View Room - Twin", "Panoramic Sea View Room"), true);
    assert.equal(roomCaptionMatches("SO Lofty", "SO Lofty"), true);
    const presentation = presentationFromLeHotel(fairmont, ["Deluxe Marina Bay King"]);
    assert.deepEqual(
      presentation.photos.map((row) => row.caption),
      ["Deluxe Marina Bay King", "Exterior", "Lobby", "Swimming Pool", "Prego"]
    );
    assert.equal(presentation.photos[0]?.kind, "room");
    assert.equal(presentation.photos[1]?.kind, "hotel");
    assert.equal(presentation.check_in_time, null);
    assert.equal(JSON.stringify(presentation).includes("999"), false);
    assert.equal(JSON.stringify(presentation).includes("commission"), false);
  });

  it("ouvre sur la chambre deluxe quand la vue Marina Bay n’est pas photographiée", () => {
    const gallery = [
      photo("pool", "Swimming Pool"),
      photo("deluxe-a", "Deluxe Room"),
      photo("deluxe-b", "Deluxe Room"),
      photo("harbour", "Deluxe Harbour King"),
      photo("lobby", "Lobby"),
      photo("exterior", "Exterior"),
    ];
    const presentation = presentationFromLeHotel(
      { ...fairmont, images_gallery: gallery },
      ["Deluxe Marina Bay King"]
    );
    assert.deepEqual(
      presentation.photos.map((row) => row.caption),
      ["Deluxe Room", "Deluxe Room", "Exterior", "Lobby", "Swimming Pool"]
    );
    assert.equal(presentation.photos[0]?.kind, "room");
    assert.equal(presentation.photos.some((row) => row.caption === "Deluxe Harbour King"), false);
  });

  it("retombe sur l’hôtel quand la chambre n’a pas de photo", () => {
    const presentation = presentationFromLeHotel(fairmont, ["Royal Suite"]);
    assert.deepEqual(
      presentation.photos.map((row) => row.caption),
      ["Exterior", "Lobby", "Swimming Pool", "Prego"]
    );
    assert.ok(presentation.photos.every((row) => row.kind === "hotel"));
    assert.equal(presentation.address, "80 Bras Basah Road, Singapore 189560");
  });

  it("lit l’heure seulement quand le catalogue la donne", () => {
    assert.equal(stayClock("00:00"), "");
    assert.equal(stayClock("15:00"), "15h00");
    const presentation = presentationFromLeHotel(
      { ...fairmont, short_info: { check_in_time: "15:00", check_out_time: "12:00" } },
      ["Deluxe Marina Bay King"]
    );
    assert.equal(presentation.check_in_time, "15:00");
    assert.equal(presentation.check_out_time, "12:00");
    assert.equal(presentationFromLeHotel({ short_info: { check_in_time: "00:00" } }, []).check_in_time, null);
  });

  it("refuse une URL qui n’est pas une photo https", () => {
    assert.equal(safePhotoUrl("http://d13bre0qp8legl.cloudfront.net/a.jpg", ["cloudfront.net"]), "");
    assert.equal(safePhotoUrl("https://user:secret@d13bre0qp8legl.cloudfront.net/a.jpg", ["cloudfront.net"]), "");
    assert.equal(safePhotoUrl("javascript:alert(1)"), "");
  });
});

describe("carte hôtel", () => {
  it("n’affiche ni le coût ni la marge, et garde une galerie saisie", () => {
    const manual = {
      kind: "hotel",
      supplier: "Direct",
      start_at: "2026-11-02",
      end_at: "2026-11-05",
      details: {
        hotel_name: "Maison",
        room: "Suite",
        board: "Petit-déjeuner",
        total_cost: "100",
        commission: "12",
        margin: "40",
        photos: [{ url: "https://photos.example/suite.jpg", caption: "Suite", kind: "room" }],
      },
    };
    const facts = hotelStayFacts(manual);
    assert.equal(JSON.stringify(facts).includes("100"), false);
    assert.equal(JSON.stringify(facts).includes("commission"), false);
    assert.equal(facts.find((row) => row.label === "Chambre") && "value" in facts[0], true);
    assert.equal(facts.some((row) => row.label === "Nuits" && "value" in row && row.value === "3 nuits"), true);
    assert.equal(facts.some((row) => row.label === "Pension"), true);
    const kept = applyHotelPresentation(manual, presentationFromLeHotel(fairmont, ["Deluxe Room"]));
    assert.equal(hotelPhotos(kept)[0]?.url, "https://photos.example/suite.jpg");
  });

  it("rattache les conditions et les voyageurs sans écraser la chambre déjà écrite", () => {
    const stay = {
      hotel_id: 349,
      confirmation_number: "LE1",
      check_in: "2026-11-02",
      check_out: "2026-11-05",
      address: "80 Bras Basah Road",
      room_types: ["Deluxe Marina Bay King"],
      conditions: ["Free cancellation before 1 Oct"],
      guest_names: ["Camille Martin"],
      benefits: ["Petit-déjeuner quotidien pour deux personnes"],
    };
    const picked = pickLeStay(
      { kind: "hotel", confirmation_ref: "LE1", details: { le_hotel_id: 349 } },
      [stay, { ...stay, confirmation_number: "LE2", hotel_id: 349 }]
    );
    assert.equal(picked?.confirmation_number, "LE1");
    const item = applyLeStayFacts(
      {
        kind: "hotel",
        confirmation_ref: "LE1",
        start_at: "2026-11-02",
        end_at: "2026-11-05",
        supplier: "Little Emperors",
        details: {
          le_hotel_id: 349,
          hotel_name: "Fairmont Singapore",
          room: "Deluxe Marina Bay King",
        } as Record<string, unknown>,
      },
      stay
    );
    assert.equal(item.details?.address, "80 Bras Basah Road");
    const dirty = applyLeStayFacts(
      {
        kind: "hotel",
        start_at: "2026-11-02",
        end_at: "2026-11-05",
        details: {
          le_hotel_id: 349,
          address: "80 Bras Basah Road Deluxe Marina Bay King",
        } as Record<string, unknown>,
      },
      stay
    );
    assert.equal((dirty.details as Record<string, unknown>).address, "80 Bras Basah Road");
    assert.deepEqual(item.details?.conditions, ["Free cancellation before 1 Oct"]);
    assert.equal(item.details?.guests, "Camille Martin");
    assert.equal(JSON.stringify(item.details).includes("total_cost"), false);
    const facts = hotelStayFacts(item);
    assert.equal(facts.some((row) => row.label === "Avantages"), true);
    assert.equal(facts.some((row) => row.label === "Annulation"), true);
    assert.deepEqual(roomsFromStay(["SO Lofty", "SO Lofty"], ["A", "B"], "LE9").map((row) => row.guests), ["A", "B"]);
    const otherHotel = pickLeStay(
      {
        kind: "hotel",
        title: "Crowne Plaza Changi Airport",
        confirmation_ref: "7356",
        start_at: "2026-11-16",
        end_at: "2026-11-19",
        details: { le_hotel_id: 349, hotel_name: "Crowne Plaza Changi Airport" },
      },
      [stay]
    );
    assert.equal(otherHotel, null);
    assert.equal(catalogNameAgrees("Crowne Plaza Changi Airport", "Fairmont Singapore"), false);
    assert.equal(catalogNameAgrees("Fairmont Singapore", "Fairmont Singapore"), true);
    assert.equal(catalogNameAgrees("SO/ Sotogrande", "SO/ Sotogrande Spa & Golf Resort"), true);
    const upgrade = benefitLine("Surclassement à l'enregistrement, sous réserve de disponibilité");
    assert.equal(upgrade.title, "Surclassement à l'enregistrement");
    assert.equal(upgrade.note, "sous réserve de disponibilité");
    assert.equal(upgrade.tone, "upgrade");
    const early = benefitLine(
      "Enregistrement anticipé et départ tardif — sous réserve de disponibilité et hors dates d'exclusion (hors suites spéciales)"
    );
    assert.equal(early.tone, "schedule");
    assert.match(early.note, /sous réserve/);
    assert.equal(benefitLine("Petit-déjeuner quotidien pour deux personnes").tone, "breakfast");
    assert.equal(benefitLine("Crédit hôtel de 100 $ par séjour").tone, "credit");
    assert.equal(benefitLine("Troisième nuit offerte").tone, "night");
  });

  it("charge la galerie du catalogue pour une carte sans photo", async () => {
    clearHotelGalleryCache();
    let called = "";
    const fetchImpl: typeof fetch = async (input) => {
      called = String(input);
      return new Response(JSON.stringify(fairmont), { status: 200, headers: { "content-type": "application/json" } });
    };
    const [item] = await attachHotelGallery(
      [
        {
          kind: "hotel",
          start_at: "2026-11-19",
          end_at: "2026-11-22",
          details: { le_hotel_id: 349, room: "Deluxe Marina Bay King" } as Record<string, unknown>,
        },
      ],
      fetchImpl
    );
    assert.equal(called, "https://api.littleemperors.com/api/hotels/349");
    assert.equal(hotelPhotos(item)[0]?.caption, "Deluxe Marina Bay King");
    assert.equal(item.details?.check_in_time, undefined);
    const again = await attachHotelGallery([item], async () => {
      throw new Error("pas de second appel");
    });
    assert.equal(hotelPhotos(again[0])[0]?.caption, "Deluxe Marina Bay King");
    assert.equal(hotelPhotos(again[0]).length, 5);
  });
});
