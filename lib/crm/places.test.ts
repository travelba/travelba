import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPlace, destinationQuery, placeLabel, placesFromGeocode } from "./places";

describe("places", () => {
  it("écrit Ville, Pays", () => {
    assert.equal(placeLabel("Tel Aviv", "Israël"), "Tel Aviv, Israël");
    assert.equal(placeLabel("France", "France"), "France");
  });

  it("complète le dernier lieu d’une liste", () => {
    assert.equal(destinationQuery("Paris · tel"), "tel");
    assert.equal(applyPlace("Paris · tel", "Tel Aviv, Israël"), "Paris · Tel Aviv, Israël");
    assert.equal(applyPlace("tel", "Tel Aviv, Israël"), "Tel Aviv, Israël");
  });

  it("propose la ville et le pays, avec la région si homonymes", () => {
    const places = placesFromGeocode([
      { name: "Avoriaz", country: "France", country_code: "FR", admin1: "Auvergne-Rhône-Alpes", feature_code: "PPL" },
      { name: "Avoriaz", country: "France", country_code: "FR", admin1: "Auvergne-Rhône-Alpes", feature_code: "PPL" },
      { name: "Paris", country: "United States", country_code: "US", admin1: "Texas", feature_code: "PPL" },
      { name: "Paris", country: "United States", country_code: "US", admin1: "Kentucky", feature_code: "PPL" },
      { name: "Charles de Gaulle", country: "France", country_code: "FR", feature_code: "AIRP" },
    ]);
    assert.deepEqual(
      places.map((place) => place.label),
      ["Avoriaz, France", "Paris, Texas, États-Unis", "Paris, Kentucky, États-Unis"]
    );
  });
});
