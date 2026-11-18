import assert from "node:assert/strict";
import test from "node:test";
import {
  HOTEL_WEB_REVIEW_REASON,
  PERPLEXITY_MISSING_KEY_WARNING,
  hotelCacheKey,
  hotelWebGaps,
  imageOnOfficialSite,
  isLittleEmperorsHotel,
  loadPerplexityHotel,
  mergeHotelWebFacts,
  parseHotelWebPayload,
  readOfficialOgImage,
  readPerplexityHotelMedia,
  shouldAutoEnrichHotel,
} from "./hotel-web";

const DESCRIPTION =
  "Palace au cœur de Paris, face à la place Vendôme, avec un salon et un jardin intérieur.";

function payload(extra?: Record<string, unknown>) {
  return {
    address: "15 Place Vendôme, 75001 Paris",
    website: "https://www.ritzparis.com/",
    description: DESCRIPTION,
    check_in: "15:00",
    check_out: "12:00",
    reception: { phone: "+33142603830", email: "pas-un-email" },
    reservations: { phone: "appel", email: "reservations@ritzparis.com" },
    concierge: { phone: "+33 1 43 16 30 70", email: "concierge@littleemperors.com" },
    photos: [
      { url: "https://www.ritzparis.com/media/facade.jpg", caption: "Façade" },
      { url: "http://www.ritzparis.com/media/hall.jpg", caption: "Hall" },
      { url: "https://cdn.example/images/pool.jpg", caption: "Piscine" },
      { url: "https://evil.example/not-an-image", caption: "Lien" },
    ],
    sources: ["https://www.ritzparis.com/fr"],
    ...extra,
  };
}

test("parse la réponse JSON et rejette les e-mails et téléphones mal formés", () => {
  const parsed = parseHotelWebPayload(payload());
  assert.equal("facts" in parsed, true);
  if (!("facts" in parsed)) return;
  assert.equal(parsed.facts.address, "15 Place Vendôme, 75001 Paris");
  assert.equal(parsed.facts.reception.phone, "+33142603830");
  assert.equal(parsed.facts.reception.email, null);
  assert.equal(parsed.facts.reservations.phone, null);
  assert.equal(parsed.facts.reservations.email, "reservations@ritzparis.com");
  assert.equal(parsed.facts.concierge.phone, "+33143163070");
  assert.equal(parsed.facts.concierge.email, null);
  assert.deepEqual(parsed.facts.photos.map((photo) => photo.url), ["https://www.ritzparis.com/media/facade.jpg"]);
  assert.equal(parsed.facts.check_in_time, "15:00");
  assert.equal(parsed.facts.check_out_time, "12:00");
  assert.deepEqual(parsed.facts.sources, ["https://www.ritzparis.com/fr"]);
  assert.equal("error" in parseHotelWebPayload("pas du json"), true);
  assert.equal("error" in parseHotelWebPayload({ address: "Court" }), true);
});

test("ne remplit que les champs vides et marque la recherche à vérifier", () => {
  const parsed = parseHotelWebPayload(
    payload({
      address: "1 Rue Autre, 75002 Paris",
      check_in: "16:00",
      photos: [{ url: "https://cdn.example/images/autre.jpg", caption: "Autre" }],
      reception: { phone: "+33142603830", email: "nouveau@ritzparis.com" },
    })
  );
  assert.equal("facts" in parsed, true);
  if (!("facts" in parsed)) return;
  const current = {
    address: "15 Place Vendôme, 75001 Paris",
    check_in_time: "15:00",
    photos: [{ url: "https://cdn.example/images/suite.jpg", caption: "Suite", kind: "room" }],
    hotel_contacts: [{ type: "Reception", first_name: "Ada", last_name: "Martin", email: "desk@ritzparis.com", phone: "" }],
    visible_to_client: true,
    client_hidden: false,
  };
  const merged = mergeHotelWebFacts(current, parsed.facts, { markReview: true, cacheKey: "ritz|paris" });
  assert.equal(merged.details.address, "15 Place Vendôme, 75001 Paris");
  assert.equal(merged.details.check_in_time, "15:00");
  assert.equal((merged.details.photos as { url: string }[])[0].url, "https://cdn.example/images/suite.jpg");
  const reception = (merged.details.hotel_contacts as { type: string; email: string; phone: string }[])[0];
  assert.equal(reception.email, "desk@ritzparis.com");
  assert.equal(reception.phone, "+33142603830");
  assert.equal(merged.details.description, DESCRIPTION);
  assert.equal(merged.details.website, "https://www.ritzparis.com/");
  assert.equal(merged.details.needs_review, true);
  assert.equal(merged.details.review_reason, HOTEL_WEB_REVIEW_REASON);
  assert.equal(merged.details.visible_to_client, true);
  assert.equal(merged.details.client_hidden, false);
  assert.ok(merged.filled.includes("description"));
  assert.ok(!merged.filled.includes("adresse"));
  assert.ok(!merged.filled.includes("photos"));

  const keptReason = mergeHotelWebFacts(
    { review_reason: "Réservation provisoire (tentative).", description: "" },
    parsed.facts,
    { markReview: true }
  );
  assert.equal(keptReason.details.review_reason, "Réservation provisoire (tentative).");
  assert.equal(keptReason.details.needs_review, true);

  const catalogue = mergeHotelWebFacts({}, parsed.facts, { markReview: false });
  assert.equal(catalogue.details.needs_review, undefined);
  assert.equal(catalogue.details.review_reason, undefined);
});

test("sans clé Perplexity, aucun appel et un avertissement", async () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  let called = false;
  try {
    const loaded = await loadPerplexityHotel("Ritz", "Paris", {
      env: { PERPLEXITY_API_KEY: "  " },
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
    });
    assert.deepEqual(loaded, { error: "cle_absente" });
    assert.equal(called, false);
    assert.ok(warnings.some((line) => line.includes(PERPLEXITY_MISSING_KEY_WARNING)));
  } finally {
    console.warn = original;
  }
});

test("une carte Little Emperors sans identifiant réel est recherchée, un le_hotel_id ne l’est pas", () => {
  assert.equal(
    isLittleEmperorsHotel({
      supplier: "Little Emperors",
      details: { source_family: "little_emperors" },
    }),
    false
  );
  assert.equal(isLittleEmperorsHotel({ details: { le_hotel_id: 12 } }), true);
  assert.equal(isLittleEmperorsHotel({ details: { le_hotel_id: "0" } }), false);
  assert.equal(isLittleEmperorsHotel({ details: {} }, true), true);
  assert.equal(
    shouldAutoEnrichHotel({
      kind: "hotel",
      supplier: "Little Emperors",
      title: "St. Regis Dubai",
      details: { city: "Dubai", hotel_name: "St. Regis Dubai", source_family: "little_emperors" },
    }),
    true
  );
  assert.equal(
    shouldAutoEnrichHotel({
      kind: "hotel",
      title: "Ritz",
      details: { city: "Paris", hotel_name: "Ritz", le_hotel_id: 12 },
    }),
    false
  );
  assert.equal(shouldAutoEnrichHotel({ kind: "hotel", title: "Ritz", details: { city: "Paris", hotel_name: "Ritz" } }), true);
  assert.equal(hotelCacheKey("Hôtel Ritz", "Paris"), hotelCacheKey("The Ritz Hotel", "paris"));
  assert.equal(hotelCacheKey("Four Seasons Hotel Milano", "Milano"), hotelCacheKey("Four Seasons Hotel Milano", "Milan"));
  assert.equal(imageOnOfficialSite("https://www.ritzparis.com/media/facade.jpg", "https://www.ritzparis.com/"), true);
  assert.equal(imageOnOfficialSite("https://cdn.example/images/pool.jpg", "https://www.ritzparis.com/"), false);
  assert.equal(imageOnOfficialSite("https://media.ritzparis.com/a.jpg", "https://ritzparis.com/"), true);
  const media = readPerplexityHotelMedia(
    {
      images: [
        { image_url: "https://www.ritzparis.com/media/facade.jpg" },
        { image_url: "https://images.unsplash.com/photo.jpg" },
      ],
      search_results: [{ url: "https://www.ritzparis.com/fr", title: "Ritz" }],
    },
    "https://www.ritzparis.com/"
  );
  assert.deepEqual(media.photos.map((photo) => photo.url), ["https://www.ritzparis.com/media/facade.jpg"]);
  assert.deepEqual(media.sources, ["https://www.ritzparis.com/fr"]);
  assert.equal(
    readOfficialOgImage('<meta property="og:image" content="https://cdn.ritzparis.com/og.jpg">', "https://www.ritzparis.com/"),
    "https://cdn.ritzparis.com/og.jpg"
  );
  assert.deepEqual(hotelWebGaps({ address: "15 Place Vendôme, Paris", description: DESCRIPTION }), [
    "site",
    "arrivée",
    "départ",
    "réception",
    "réservations",
    "concierge",
    "photos",
  ]);
});

test("Perplexity demande les images et ne garde que le domaine officiel, sinon og:image", async () => {
  const calls: string[] = [];
  const withImages = await loadPerplexityHotel("Ritz", "Paris", {
    env: { PERPLEXITY_API_KEY: "test" },
    fetchImpl: async (input, init) => {
      calls.push(String(input));
      const body = JSON.parse(String(init?.body));
      assert.equal(body.return_images, true);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(payload({ photos: [] })) } }],
          images: [
            { image_url: "https://www.ritzparis.com/media/facade.jpg", origin_url: "https://www.ritzparis.com/" },
            { image_url: "https://images.unsplash.com/photo.jpg", origin_url: "https://unsplash.com/x" },
          ],
          search_results: [{ url: "https://www.ritzparis.com/fr" }],
        }),
        { status: 200 }
      );
    },
  });
  assert.equal("facts" in withImages, true);
  if (!("facts" in withImages)) return;
  assert.deepEqual(withImages.facts.photos.map((photo) => photo.url), ["https://www.ritzparis.com/media/facade.jpg"]);
  assert.ok(withImages.facts.sources.includes("https://www.ritzparis.com/fr"));
  assert.equal(calls.length, 1);

  const og = await loadPerplexityHotel("Ritz", "Paris", {
    env: { PERPLEXITY_API_KEY: "test" },
    fetchImpl: async (input) => {
      if (String(input).includes("perplexity")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(payload({ photos: [] })) } }],
            images: [],
          }),
          { status: 200 }
        );
      }
      return new Response('<meta property="og:image" content="https://cdn.ritzparis.com/og.jpg">', { status: 200 });
    },
  });
  assert.equal("facts" in og, true);
  if (!("facts" in og)) return;
  assert.deepEqual(og.facts.photos.map((photo) => photo.url), ["https://cdn.ritzparis.com/og.jpg"]);
});
