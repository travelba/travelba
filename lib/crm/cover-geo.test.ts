import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverGeocodeQuery } from "./covers";
import { geocodeAgrees, legacyNearestCover, photoFromGeocodeHit } from "./cover-geo";

describe("photoFromGeocodeHit", () => {
  it("rattache Aghouatim à Marrakech, pas au Maroc générique", () => {
    const photo = photoFromGeocodeHit({
      label: "Aghouatim, Maroc",
      lat: 31.37475,
      lon: -7.93467,
      countryCode: "ma",
    });
    assert.equal(photo, "photo-1677837488142-a85ffbffe408");
  });

  it("génère Dinant au lieu d’Amsterdam", () => {
    const hit = {
      label: "Dinant, Belgique",
      lat: 50.2608,
      lon: 4.9122,
      countryCode: "be",
    };
    assert.equal(photoFromGeocodeHit(hit), "photo-city-dinant");
    assert.equal(legacyNearestCover(hit), "photo-1534351590666-13e3e96b5017");
  });

  it("génère Valmorel au lieu de la tour Eiffel", () => {
    const hit = {
      label: "Valmorel, La Léchère, Savoie, France",
      lat: 45.458,
      lon: 6.447,
      countryCode: "fr",
    };
    assert.equal(photoFromGeocodeHit(hit), "photo-city-valmorel");
    assert.notEqual(photoFromGeocodeHit(hit), "photo-1502602898657-3e91760cbb34");
    const legacy = legacyNearestCover(hit);
    assert.ok(legacy);
    assert.notEqual(legacy, "photo-city-valmorel");
  });

  it("ignore un libellé qui n’est pas un lieu", () => {
    assert.equal(geocodeAgrees("40 ans", "Ans, Liège, Belgique"), false);
    assert.equal(geocodeAgrees("Dinant", "Dinant, Namur, Wallonie, Belgique"), true);
  });

  it("envoie au géocodeur la ville écrite, pas le titre choisi", () => {
    assert.equal(
      coverGeocodeQuery({ destination: "Dinant", title: "40 ans" }),
      "Dinant"
    );
    assert.equal(coverGeocodeQuery({ destination: null, title: "40 ans" }), "40 ans");
  });

  it("garde Marrakech quand la région est écrite", () => {
    const photo = photoFromGeocodeHit({
      label: "Aghouatim, Marrakech-Safi, Maroc",
      lat: 31.37475,
      lon: -7.93467,
      countryCode: "ma",
    });
    assert.equal(photo, "photo-1677837488142-a85ffbffe408");
  });
});
