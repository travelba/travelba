import assert from "node:assert/strict";
import test from "node:test";
import { countryForIata } from "./airports";
import { visaFeeAmount, visaFeeTitle, visaPassengerCount } from "./extras";
import { entryForFrenchPassport, officialVisaApplyUrl } from "./visa-fr";
import { frenchPassportRequired, frenchPassportTrip } from "./visa-trip";

function flight(to: string, from = "CDG") {
  return { kind: "flight", details: { from, to } };
}

test("french passport rules for the fixtures", () => {
  assert.equal(entryForFrenchPassport("FR").status, "none");
  assert.equal(entryForFrenchPassport("DE").status, "none");
  assert.equal(entryForFrenchPassport("MA").status, "none");
  assert.equal(entryForFrenchPassport("CN").status, "none");
  assert.deepEqual(entryForFrenchPassport("US"), { status: "authorization", formality: "ESTA" });
  assert.deepEqual(entryForFrenchPassport("GB"), { status: "authorization", formality: "ETA" });
  assert.deepEqual(entryForFrenchPassport("CA"), { status: "authorization", formality: "AVE" });
  assert.equal(entryForFrenchPassport("IN").status, "visa");
  assert.equal(entryForFrenchPassport("RU").status, "visa");
  assert.equal(entryForFrenchPassport("GP").status, "none");
});

test("arrival airports map to countries", () => {
  assert.equal(countryForIata("cdg"), "FR");
  assert.equal(countryForIata("CMN"), "MA");
  assert.equal(countryForIata("JFK"), "US");
  assert.equal(countryForIata("LHR"), "GB");
  assert.equal(countryForIata("YUL"), "CA");
  assert.equal(countryForIata("DEL"), "IN");
  assert.equal(countryForIata("PTP"), "GP");
  assert.equal(countryForIata("ZZZ"), null);
});

test("Marrakech needs no french-passport formality", () => {
  const trip = frenchPassportTrip([flight("CMN")], 2);
  assert.equal(trip.hasFlight, true);
  assert.equal(trip.needsFormality, false);
  assert.equal(trip.entries.length, 0);
  assert.equal(trip.amount, 0);
});

test("New York needs ESTA and prices the visa service per passenger", () => {
  const trip = frenchPassportTrip([flight("JFK"), flight("CDG", "JFK")], 3);
  assert.equal(trip.needsFormality, true);
  assert.deepEqual(
    trip.entries.map((entry) => entry.formality),
    ["ESTA"]
  );
  assert.equal(trip.passengers, 3);
  assert.equal(trip.amount, 75);
  assert.equal(trip.entries[0]?.applyUrl, "https://esta.cbp.dhs.gov/");
  assert.equal(officialVisaApplyUrl("IN"), "https://indianvisaonline.gov.in/evisa/tvoa.html");
  assert.equal(officialVisaApplyUrl("DZ"), null);
  assert.equal(officialVisaApplyUrl("KN"), null);
  assert.equal(visaFeeAmount(0), 25);
  assert.equal(visaPassengerCount(0), 1);
  assert.equal(visaFeeTitle(2), "Obtention du visa (2 passagers)");
});

test("a connection via the United States still flags ESTA when the destination is visa-free", () => {
  const trip = frenchPassportTrip([flight("JFK"), flight("MEX", "JFK")]);
  assert.equal(trip.needsFormality, true);
  assert.ok(trip.entries.some((entry) => entry.iso === "US"));
  assert.equal(trip.entries.some((entry) => entry.iso === "MX"), false);
});

test("Valmorel stays in France and does not ask for a passport", () => {
  const valmorel = [
    { kind: "hotel", details: { city: "Valmorel", country: "France", hotel_name: "Club Med Valmorel" } },
  ];
  assert.equal(frenchPassportRequired(valmorel, { destination: "Valmorel", title: "Valmorel" }), false);
  assert.equal(
    frenchPassportRequired(
      [
        { kind: "flight", lifecycle: "cancelled", details: { from: "CDG", to: "JFK" } },
        ...valmorel,
      ],
      { destination: "Valmorel" }
    ),
    false
  );
  assert.equal(
    frenchPassportRequired(
      [{ kind: "rail", details: { city_from: "Paris", city_to: "Les Arcs" } }, ...valmorel],
      { destination: "Valmorel" }
    ),
    false
  );
  const rome = [
    { kind: "flight", details: { from: "CDG", to: "FCO" } },
    { kind: "hotel", details: { city: "Rome", country: "Italie" } },
  ];
  assert.equal(frenchPassportRequired(rome, { destination: "Rome" }), false);
  assert.equal(frenchPassportRequired([{ kind: "flight", details: { from: "CDG", to: "PTP" } }], { destination: "Guadeloupe" }), false);
  assert.equal(
    frenchPassportRequired([{ kind: "flight", details: { from: "CDG", to: "JFK" } }], { destination: "New York" }),
    true
  );
  assert.equal(
    frenchPassportRequired(
      [
        { kind: "flight", details: { from: "CDG", to: "LHR" } },
        { kind: "hotel", details: { city: "Londres", country: "Royaume-Uni" } },
      ],
      { destination: "Londres" }
    ),
    true
  );
  assert.equal(
    frenchPassportRequired([{ kind: "rail", details: { city_from: "Paris", city_to: "Londres" } }], { destination: "Londres" }),
    true
  );
  assert.equal(frenchPassportRequired([{ kind: "flight", details: { from: "CDG", to: "CMN" } }], { destination: "Marrakech" }), true);
  assert.equal(
    frenchPassportRequired(
      [{ kind: "hotel", details: { city: "Valmorel", country: "France" } }, { kind: "flight", details: { from: "CDG", to: "ZZZ" } }],
      { destination: "Valmorel" }
    ),
    true
  );
  assert.equal(frenchPassportRequired([], { destination: "Quelque part" }), true);
  assert.equal(frenchPassportRequired([], { destination: "Tel Aviv" }), true);
  assert.equal(frenchPassportRequired([], { destination: "Marrakech" }), true);
  assert.equal(
    frenchPassportRequired([{ kind: "hotel", details: { city: "Zermatt", country: "Suisse" } }], { destination: "Zermatt" }),
    false
  );
});

test("Guadeloupe and an unknown airport do not open the paid service", () => {
  const home = frenchPassportTrip([flight("PTP")]);
  assert.equal(home.needsFormality, false);
  const unknown = frenchPassportTrip([flight("ZZZ")]);
  assert.equal(unknown.needsFormality, false);
  assert.deepEqual(unknown.unknownIatas, ["ZZZ"]);
});
