import assert from "node:assert/strict";
import test from "node:test";
import {
  addressCity,
  formatBanFeature,
  formatPhotonFeature,
  mergeAddressHits,
  searchAddresses,
} from "./address-suggest";

test("la ville se lit sur l’adresse déjà posée", () => {
  assert.equal(addressCity("CDG · Paris"), "Paris");
  assert.equal(addressCity("1 place de l'Exemple, 69002 Lyon, FR"), "Lyon");
  assert.equal(addressCity("8 avenue de l'Opéra, Paris"), "Paris");
  assert.equal(addressCity(""), "");
});

test("une adresse française se lit rue puis ville", () => {
  const hit = formatBanFeature({
    housenumber: "12",
    street: "Rue de Rivoli",
    postcode: "75004",
    city: "Paris",
    name: "12 Rue de Rivoli",
  });
  assert.equal(hit?.title, "12 Rue de Rivoli");
  assert.equal(hit?.subtitle, "75004 Paris");
  assert.equal(hit?.label, "12 Rue de Rivoli, 75004 Paris");
});

test("un terminal hors base française reste proposé", () => {
  const hit = formatPhotonFeature({
    name: "Terminal 2E - Portes M",
    city: "Le Mesnil-Amelot",
    country: "France",
  });
  assert.equal(hit?.title, "Terminal 2E - Portes M");
  assert.equal(hit?.subtitle, "Le Mesnil-Amelot");
  const abroad = formatPhotonFeature({
    name: "Maison Horizon",
    city: "New York",
    country: "États-Unis",
  });
  assert.equal(abroad?.subtitle, "New York, États-Unis");
});

test("les doublons disparaissent, la France passe devant", () => {
  const paris = formatBanFeature({ housenumber: "12", street: "Rue de Rivoli", postcode: "75004", city: "Paris" })!;
  const copy = formatPhotonFeature({
    housenumber: "12",
    street: "Rue de Rivoli",
    postcode: "75004",
    city: "Paris",
    country: "France",
  })!;
  const terminal = formatPhotonFeature({ name: "Terminal 2E", city: "Le Mesnil-Amelot", country: "France" })!;
  const rows = mergeAddressHits([paris], [copy, terminal]);
  assert.deepEqual(
    rows.map((row) => row.title),
    ["12 Rue de Rivoli", "Terminal 2E"]
  );
});

test("la recherche classe près de la ville et interroge les deux sources", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("type=municipality")) {
      return Response.json({ features: [{ geometry: { coordinates: [2.35, 48.86] } }] });
    }
    if (url.includes("photon")) {
      return Response.json({
        features: [{ properties: { name: "Terminal 2E", city: "Le Mesnil-Amelot", country: "France" } }],
      });
    }
    assert.match(url, /lat=48\.86/);
    assert.match(url, /lon=2\.35/);
    return Response.json({
      features: [
        { properties: { housenumber: "12", street: "Rue de Rivoli", postcode: "75004", city: "Paris" } },
      ],
    });
  }) as typeof fetch;
  const hits = await searchAddresses("12 rue de rivoli", "Paris", fetchImpl);
  assert.equal(hits[0]?.label, "12 Rue de Rivoli, 75004 Paris");
  assert.equal(hits[1]?.title, "Terminal 2E");
  assert.equal(calls.some((url) => url.includes("type=municipality")), true);
  assert.equal(calls.some((url) => url.includes("photon")), true);
});
