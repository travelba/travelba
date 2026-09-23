import assert from "node:assert/strict";
import test from "node:test";
import {
  airlineIataFromFlightNumber,
  brandMarkForItem,
  inferAirlineIata,
  inferCarBrand,
} from "./brand-marks";

test("IATA depuis le n° de vol ou le nom", () => {
  assert.equal(airlineIataFromFlightNumber("AF 1789"), "AF");
  assert.equal(inferAirlineIata({ airline: "Copa Airlines", flight_number: "CM 123" }), "CM");
  assert.equal(inferAirlineIata({ airline: "Air France" }), "AF");
  assert.equal(inferAirlineIata({ airline_iata: "7P" }), "7P");
});

test("logos vol et SIXT", () => {
  const flight = brandMarkForItem({
    kind: "flight",
    details: { airline: "Air France", flight_number: "AF 1" },
  });
  assert.equal(flight?.code, "AF");
  assert.match(flight?.src || "", /AF/);
  const car = brandMarkForItem({ kind: "car", supplier: "SIXT" });
  assert.equal(car?.code, "sixt");
  assert.equal(inferCarBrand("Hertz Genève")?.slug, "hertz");
});
