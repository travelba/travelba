import assert from "node:assert/strict";
import test from "node:test";
import { hotelImageLoader, hotelPhotoList, photoGesture } from "./hotel-photos";

test("les photos reçues restent, sans doublon et sans photo inventée", () => {
  assert.deepEqual(hotelPhotoList({ photo: null, images: [] }), []);
  assert.deepEqual(hotelPhotoList({ photo: " https://a ", images: ["https://a", "", "https://b"] }), ["https://a", "https://b"]);
  assert.deepEqual(hotelPhotoList({ images: ["https://b", "https://b"] }), ["https://b"]);
});

test("le chargeur indique la largeur sans casser une adresse qui a déjà une requête", () => {
  assert.equal(hotelImageLoader({ src: "https://cdn.example/a.jpg", width: 640 }), "https://cdn.example/a.jpg?w=640");
  assert.equal(hotelImageLoader({ src: "https://cdn.example/a.jpg?v=1", width: 828 }), "https://cdn.example/a.jpg?v=1&w=828");
  assert.equal(hotelImageLoader({ src: "/covers/a.webp", width: 480 }), "/covers/a.webp?w=480");
});
test("un balayage horizontal n’est pas un appui, le défilement vertical reste à la page", () => {
  assert.equal(photoGesture(4, 3), "pending");
  assert.equal(photoGesture(40, 6), "swipe");
  assert.equal(photoGesture(-30, 8), "swipe");
  assert.equal(photoGesture(8, 40), "scroll");
  assert.equal(photoGesture(20, 20), "scroll");
});
