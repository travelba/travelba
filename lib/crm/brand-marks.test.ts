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
  assert.equal(inferAirlineIata({ airline: "Royal Air Maroc" }), "AT");
  assert.equal(inferAirlineIata({ airline: "TUI fly" }), "TB");
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
  const alamo = brandMarkForItem({ kind: "car", supplier: "Expedia TAAP / Alamo" });
  assert.equal(alamo?.code, "alamo");
  assert.equal(alamo?.src, "/brands/cars/alamo.svg");
  const budget = brandMarkForItem({
    kind: "car",
    supplier: "Expedia TAAP",
    title: "Le Mesnil-Amelot : location Budget (Standard)",
  });
  assert.equal(budget?.code, "budget");
  assert.equal(budget?.src, "/brands/cars/budget.svg");
  assert.equal(brandMarkForItem({ kind: "car", supplier: "Expedia TAAP", title: "Peugeot 3008" }), null);
});
