import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { weatherFromCode } from "./destination-weather";

describe("weatherFromCode", () => {
  it("traduit les codes WMO courants", () => {
    assert.deepEqual(weatherFromCode(0), { label: "Ensoleillé", icon: "sun" });
    assert.deepEqual(weatherFromCode(2), { label: "Nuageux", icon: "cloud_sun" });
    assert.deepEqual(weatherFromCode(3), { label: "Couvert", icon: "cloud" });
    assert.deepEqual(weatherFromCode(45), { label: "Brouillard", icon: "fog" });
    assert.deepEqual(weatherFromCode(61), { label: "Pluie", icon: "rain" });
    assert.deepEqual(weatherFromCode(71), { label: "Neige", icon: "snow" });
    assert.deepEqual(weatherFromCode(95), { label: "Orage", icon: "storm" });
  });
});
