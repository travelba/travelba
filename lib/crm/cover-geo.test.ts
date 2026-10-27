import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverGeocodeQuery } from "./covers";
import { geocodeAgrees, photoFromGeocodeHit } from "./cover-geo";

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

  it("rattache une ville belge à la photo la plus proche", () => {
    const photo = photoFromGeocodeHit({
      label: "Dinant, Belgique",
      lat: 50.2608,
      lon: 4.9122,
      countryCode: "be",
    });
    assert.equal(photo, "photo-city-dinant");
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

  it("ne donne pas la tour Eiffel à une ville française hors catalogue", () => {
    const photo = photoFromGeocodeHit({
      label: "Millau, Aveyron, France",
      lat: 44.0986,
      lon: 3.0778,
      countryCode: "fr",
    });
    assert.notEqual(photo, "photo-1502602898657-3e91760cbb34");
    assert.equal(photo, "photo-antibes-garoupe");
  });

  it("reconnaît Montpellier avant le pays", () => {
    const photo = photoFromGeocodeHit({
      label: "Montpellier, Hérault, France",
      lat: 43.6109,
      lon: 3.8767,
      countryCode: "fr",
    });
    assert.equal(photo, "photo-city-montpellier");
  });

  it("garde la tour Eiffel quand le lieu est la France", () => {
    const photo = photoFromGeocodeHit({
      label: "France",
      lat: 46.6034,
      lon: 1.8883,
      countryCode: "fr",
    });
    assert.equal(photo, "photo-1502602898657-3e91760cbb34");
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
