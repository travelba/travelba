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
    assert.equal(photo, "photo-1534351590666-13e3e96b5017");
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
