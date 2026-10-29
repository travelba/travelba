import assert from "node:assert/strict";
import test from "node:test";
import { timezoneForCountryCode } from "./airport-time";
import { timezoneForCity, timezoneForCountry, timezoneForStay, validTimeZone } from "./stay-timezone";

test("la ville de séjour donne le fuseau : Nice, Deauville, Paris, Tel Aviv, Mahé, New York", () => {
  assert.equal(timezoneForCity("Nice"), "Europe/Paris");
  assert.equal(timezoneForCity("Deauville"), "Europe/Paris");
  assert.equal(timezoneForCity("Paris"), "Europe/Paris");
  assert.equal(timezoneForCity("Tel Aviv"), "Asia/Jerusalem");
  assert.equal(timezoneForCity("Tel Aviv-Yafo"), "Asia/Jerusalem");
  assert.equal(timezoneForCity("Mahé"), "Indian/Mahe");
  assert.equal(timezoneForCity("Seychelles"), "Indian/Mahe");
  assert.equal(timezoneForCity("New York"), "America/New_York");
  assert.equal(timezoneForCity("NYC"), "America/New_York");
});

test("une ville inconnue ne reçoit pas un fuseau inventé", () => {
  assert.equal(timezoneForCity("Ville inconnue"), null);
  assert.equal(timezoneForCity(""), null);
  assert.equal(timezoneForCity(null), null);
  assert.deepEqual(timezoneForStay({ city: "Ville inconnue" }), { zone: null, source: null });
  assert.deepEqual(timezoneForStay({ stored: "nimp" }), { zone: null, source: null });
});

test("le dossier TB-2026-0075 : Anantara Plaza Nice, champ vide, se place à Paris", () => {
  assert.deepEqual(
    timezoneForStay({ stored: null, hotelZone: null, city: "Nice", country: "France", destination: "Nice" }),
    { zone: "Europe/Paris", source: "ville" }
  );
});

test("la ville passe avant le champ du dossier, qui ne sert qu’en dernier recours", () => {
  assert.deepEqual(timezoneForStay({ stored: "Asia/Bangkok", city: "Nice" }), { zone: "Europe/Paris", source: "ville" });
  assert.deepEqual(timezoneForStay({ stored: "Asia/Bangkok", destination: "Nice" }), { zone: "Europe/Paris", source: "ville" });
  assert.deepEqual(timezoneForStay({ stored: "Asia/Bangkok", city: "Ville inconnue" }), { zone: "Asia/Bangkok", source: "dossier" });
  assert.deepEqual(timezoneForStay({ stored: "Asia/Bangkok" }), { zone: "Asia/Bangkok", source: "dossier" });
});

test("la carte hôtel et le pays comblent une ville absente", () => {
  assert.deepEqual(timezoneForStay({ hotelZone: "Asia/Tokyo", city: "Ville inconnue" }), { zone: "Asia/Tokyo", source: "hotel" });
  assert.deepEqual(timezoneForStay({ hotelZone: "Asia/Tokyo", city: "Paris" }), { zone: "Europe/Paris", source: "ville" });
  assert.deepEqual(timezoneForStay({ country: "Thaïlande" }), { zone: "Asia/Bangkok", source: "pays" });
  assert.deepEqual(timezoneForStay({ country: "Thailand" }), { zone: "Asia/Bangkok", source: "pays" });
  assert.deepEqual(timezoneForStay({ country: "TH" }), { zone: "Asia/Bangkok", source: "pays" });
  assert.deepEqual(timezoneForStay({ country: "Seychelles" }), { zone: "Indian/Mahe", source: "pays" });
  assert.deepEqual(timezoneForStay({ country: "Émirats arabes unis" }), { zone: "Asia/Dubai", source: "pays" });
  assert.deepEqual(timezoneForStay({ country: "Royaume-Uni" }), { zone: "Europe/London", source: "pays" });
  assert.deepEqual(timezoneForStay({ country: "États-Unis" }), { zone: null, source: null });
  assert.deepEqual(timezoneForStay({ country: "États-Unis", stored: "America/Chicago" }), { zone: "America/Chicago", source: "dossier" });
});

test("une destination à plusieurs villes, un code postal ou un pays dans le libellé", () => {
  assert.equal(timezoneForCity("Tel Aviv et Seychelles"), "Asia/Jerusalem");
  assert.equal(timezoneForCity("Nice, France"), "Europe/Paris");
  assert.equal(timezoneForCity("06000 Nice"), "Europe/Paris");
  assert.equal(timezoneForCity("Paris → Nice"), "Europe/Paris");
  assert.equal(timezoneForCity("Paris → Tel Aviv"), "Asia/Jerusalem");
  assert.equal(timezoneForCity("Nice (Côte d’Azur)"), "Europe/Paris");
  assert.equal(timezoneForCity("Victoria, Mahé"), "Indian/Mahe");
  assert.equal(timezoneForCity("Milano"), "Europe/Rome");
  assert.equal(timezoneForCity("Phuket"), "Asia/Bangkok");
  assert.equal(timezoneForCity("Saint-Barthélemy"), "America/St_Barthelemy");
  assert.equal(timezoneForCity("Courchevel 1850"), "Europe/Paris");
});

test("le jeu de villes hors ligne et les noms IANA prennent le relais de la liste maison", () => {
  assert.equal(timezoneForCity("Nairobi"), "Africa/Nairobi");
  assert.equal(timezoneForCity("Marrakesh"), "Africa/Casablanca");
  assert.equal(timezoneForCity("Scottsdale", "United States"), "America/Phoenix");
  assert.equal(timezoneForCity("Scottsdale", "Australie"), "Australia/Hobart");
  assert.equal(timezoneForCity("Scottsdale"), "America/Phoenix");
  assert.equal(timezoneForCity("Florence", "United States"), "America/New_York");
  assert.equal(timezoneForCity("Saint-Barthélemy", "France"), "America/St_Barthelemy");
  assert.equal(timezoneForCity("Victoria", "Seychelles"), "Indian/Mahe");
  assert.equal(timezoneForCity("Victoria", "Canada"), "America/Vancouver");
  assert.equal(timezoneForCity("Florence"), "Europe/Rome");
  assert.equal(timezoneForCity("Cabo San Lucas"), "America/Mazatlan");
  assert.equal(timezoneForCity("Kinshasa"), "Africa/Kinshasa");
});

test("un pays à plusieurs fuseaux ne donne pas de fuseau tout seul", () => {
  assert.equal(timezoneForCountry("France"), "Europe/Paris");
  assert.equal(timezoneForCountry("Italie"), "Europe/Rome");
  assert.equal(timezoneForCountry("Israël"), "Asia/Jerusalem");
  assert.equal(timezoneForCountry("USA"), null);
  assert.equal(timezoneForCountry("Canada"), null);
  assert.equal(timezoneForCountry("Australie"), null);
  assert.equal(timezoneForCountry("Brésil"), null);
  assert.equal(timezoneForCountry(""), null);
});

test("chaque fuseau du résolveur est connu d’ICU", () => {
  for (const code of ["FR", "SC", "IL", "MV", "BL", "GI", "CV", "SX", "GU", "XK", "VA"]) {
    const zone = timezoneForCountryCode(code);
    assert.ok(zone && validTimeZone(zone), `${code} → ${zone}`);
  }
  for (const city of ["Deauville", "Gustavia", "Hanga Roa", "Puerto Ayora", "Fernando de Noronha", "Ushuaia", "Bariloche", "Tromsø"]) {
    const zone = timezoneForCity(city);
    assert.ok(zone && validTimeZone(zone), `${city} → ${zone}`);
  }
});
