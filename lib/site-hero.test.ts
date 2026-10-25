import assert from "node:assert/strict";
import test from "node:test";
import { pickHeroVideo, shouldPlayHeroVideo } from "./site-hero";

test("la vidéo du hero suit l’écran et le format, une seule adresse", () => {
  assert.equal(pickHeroVideo({ wide: true, webm: true }), "/videos/hero-desktop.webm");
  assert.equal(pickHeroVideo({ wide: false, webm: true }), "/videos/hero-mobile.webm");
  assert.equal(pickHeroVideo({ wide: true, webm: false }), "/videos/hero-desktop.mp4");
  assert.equal(pickHeroVideo({ wide: false, webm: false }), "/videos/hero-mobile.mp4");
});

test("la vidéo ne démarre pas si le mouvement est réduit ou les données économisées", () => {
  assert.equal(shouldPlayHeroVideo({ reduceMotion: false, saveData: false }), true);
  assert.equal(shouldPlayHeroVideo({ reduceMotion: true, saveData: false }), false);
  assert.equal(shouldPlayHeroVideo({ reduceMotion: false, saveData: true }), false);
});
