import assert from "node:assert/strict";
import test from "node:test";
import { clientStayFace } from "./client-stay-face";
import { bookingCoverPlan } from "./covers";
import { stayTitleFromItems } from "./staff-stay";
import type { StayFaceItem } from "./client-stay-face";

function hotel(city: string, name: string, start: string, end: string, visible: boolean): StayFaceItem {
  return {
    kind: "hotel",
    title: name,
    start_at: start,
    end_at: end,
    visible_to_client: visible,
    details: { city, hotel_name: name },
  };
}

/** Nice montré, Mondrian Bordeaux caché. Le dossier stocké cite encore les deux. */
const NICE = hotel("Nice", "Anantara Plaza Nice", "2026-11-11", "2026-11-15", true);
const BORDEAUX = hotel("Bordeaux", "Mondrian Bordeaux", "2026-12-11", "2026-12-12", false);
const ITEMS = [NICE, BORDEAUX];

test("Nice visible et Bordeaux caché : le client lit Nice, du 11 au 15 novembre, une seule photo", () => {
  const face = clientStayFace({
    title: "Nice · Bordeaux",
    destination: "Nice · Bordeaux",
    startDate: "2026-11-11",
    endDate: "2026-12-12",
    items: ITEMS,
  });
  assert.equal(face.title, "Nice");
  assert.equal(face.destination, "Nice");
  assert.equal(face.start, "2026-11-11");
  assert.equal(face.end, "2026-11-15");
  assert.deepEqual(face.places, ["Nice"]);

  const cover = bookingCoverPlan(
    { destination: face.destination, title: face.title, cover_image_path: null },
    { items: face.items, places: face.places }
  );
  assert.equal(cover.mode, "single");
  if (cover.mode !== "single") return;
  assert.match(cover.src, /photo-city-nice/);
  assert.doesNotMatch(cover.src, /bordeaux/);

  const raw = bookingCoverPlan(
    { destination: "Nice · Bordeaux", title: "Nice · Bordeaux", cover_image_path: null },
    { items: ITEMS }
  );
  assert.equal(raw.mode, "split");

  assert.equal(stayTitleFromItems("Nice · Bordeaux", "Nice · Bordeaux", ITEMS), "Nice · Bordeaux");
});

test("un nom choisi reste, les dates et la photo suivent les cartes visibles", () => {
  const face = clientStayFace({
    title: "40 ans",
    destination: "Nice · Bordeaux",
    startDate: "2026-11-11",
    endDate: "2026-12-12",
    items: ITEMS,
  });
  assert.equal(face.title, "40 ans");
  assert.equal(face.destination, "Nice");
  assert.equal(face.start, "2026-11-11");
  assert.equal(face.end, "2026-11-15");
  const cover = bookingCoverPlan(
    { destination: face.destination, title: face.title, cover_image_path: null },
    { items: face.items, places: face.places }
  );
  assert.equal(cover.mode, "single");
  if (cover.mode !== "single") return;
  assert.match(cover.src, /photo-city-nice/);
});

test("sans carte visible, le client retrouve les champs saisis du dossier", () => {
  const face = clientStayFace({
    title: "Nice · Bordeaux",
    destination: "Nice · Bordeaux",
    startDate: "2026-11-11",
    endDate: "2026-12-12",
    items: [
      { ...NICE, visible_to_client: false },
      BORDEAUX,
    ],
  });
  assert.equal(face.fromCards, false);
  assert.equal(face.title, "Nice · Bordeaux");
  assert.equal(face.destination, "Nice · Bordeaux");
  assert.equal(face.start, "2026-11-11");
  assert.equal(face.end, "2026-12-12");
});
