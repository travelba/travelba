import assert from "node:assert/strict";
import test from "node:test";
import { hotelPhotoList, photoGesture } from "./hotel-photos";

test("les photos reçues restent, sans doublon et sans photo inventée", () => {
  assert.deepEqual(hotelPhotoList({ photo: null, images: [] }), []);
  assert.deepEqual(hotelPhotoList({ photo: " https://a ", images: ["https://a", "", "https://b"] }), ["https://a", "https://b"]);
  assert.deepEqual(hotelPhotoList({ images: ["https://b", "https://b"] }), ["https://b"]);
});

test("un balayage horizontal n’est pas un appui, le défilement vertical reste à la page", () => {
  assert.equal(photoGesture(4, 3), "pending");
  assert.equal(photoGesture(40, 6), "swipe");
  assert.equal(photoGesture(-30, 8), "swipe");
  assert.equal(photoGesture(8, 40), "scroll");
  assert.equal(photoGesture(20, 20), "scroll");
});
