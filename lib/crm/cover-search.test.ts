import assert from "node:assert/strict";
import test from "node:test";
import {
  coverCreditLabel,
  coverFileFromOpenverse,
  coverHitsFromOpenverse,
  coverSearchUrl,
  isCoverPhotoId,
  isSafeCoverImageUrl,
  normalizeCoverSearchQuery,
  rankCoverHits,
  searchCoverPhotos,
} from "./cover-search";

const MARRAKECH = "11111111-1111-4111-8111-111111111111";
const PORTRAIT = "22222222-2222-4222-8222-222222222222";
const NC = "33333333-3333-4333-8333-333333333333";

test("city titles outrank unpublished series", () => {
  const ranked = rankCoverHits(
    [
      { id: "a", title: "Day 76 - unpublished challenge Marrakech", thumb: "", credit: null },
      { id: "b", title: "Médina, Marrakech", thumb: "", credit: null },
    ],
    "Marrakech"
  );
  assert.equal(ranked[0]?.id, "b");
});

test("cover search query keeps the city and drops noise", () => {
  assert.equal(normalizeCoverSearchQuery("  Avoriaz  "), "Avoriaz");
  assert.equal(normalizeCoverSearchQuery("a"), null);
  assert.equal(normalizeCoverSearchQuery("Marrakech\u0000 medina"), "Marrakech medina");
  assert.equal(normalizeCoverSearchQuery("x".repeat(120))?.length, 80);
});

test("cover hits keep landscape photographs with a usable licence", () => {
  const hits = coverHitsFromOpenverse({
    results: [
      {
        id: MARRAKECH,
        license: "by",
        width: 1600,
        height: 900,
        title: "Médina, Marrakech",
        creator: "Nadia K.",
      },
      {
        id: PORTRAIT,
        license: "cc0",
        width: 800,
        height: 1600,
        title: "Portrait",
        creator: "A",
      },
      {
        id: NC,
        license: "by-nc",
        width: 2000,
        height: 1200,
        title: "Souk",
        creator: "X",
      },
      {
        id: "not-a-uuid",
        license: "cc0",
        width: 2000,
        height: 1200,
        title: "Logo de la ville",
      },
    ],
  });
  assert.deepEqual(
    hits.map((hit) => hit.id),
    [MARRAKECH]
  );
  assert.equal(hits[0]?.thumb, `https://api.openverse.org/v1/images/${MARRAKECH}/thumb/`);
  assert.equal(hits[0]?.credit, "Photo : Nadia K. · CC BY");
  assert.equal(coverCreditLabel("cc0", "Anyone"), null);
  assert.equal(coverCreditLabel("by", "*_*"), "Photo · CC BY");
});

test("cover image urls stay on public https hosts", () => {
  assert.equal(isSafeCoverImageUrl("https://live.staticflickr.com/1/photo.jpg"), true);
  assert.equal(isSafeCoverImageUrl("http://live.staticflickr.com/1/photo.jpg"), false);
  assert.equal(isSafeCoverImageUrl("https://user:pass@live.staticflickr.com/1/photo.jpg"), false);
  assert.equal(isSafeCoverImageUrl("https://127.0.0.1/photo.jpg"), false);
  assert.equal(isSafeCoverImageUrl("https://169.254.169.254/latest"), false);
  assert.equal(isSafeCoverImageUrl("https://localhost/photo.jpg"), false);
  assert.equal(isCoverPhotoId(MARRAKECH), true);
  assert.equal(isCoverPhotoId("../cover.webp"), false);
  assert.equal(
    coverFileFromOpenverse({
      license: "pdm",
      url: "https://upload.wikimedia.org/wikipedia/commons/a/a.jpg",
      creator: "Archives",
    })?.credit,
    null
  );
  assert.equal(
    coverFileFromOpenverse({ license: "by-nc", url: "https://live.staticflickr.com/a.jpg" }),
    null
  );
});

test("search asks for a wide city photo then fills in", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const id = calls.length === 1 ? MARRAKECH : PORTRAIT;
    const body = {
      results: [
        {
          id,
          license: "cc0",
          width: calls.length === 1 ? 1800 : 1400,
          height: 900,
          title: "Avoriaz",
          creator: "",
        },
      ],
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const hits = await searchCoverPhotos("Avoriaz", fetchImpl);
  assert.equal(hits.length, 2);
  assert.match(calls[0] || "", /aspect_ratio=wide/);
  assert.match(calls[0] || "", /page_size=20/);
  assert.match(calls[0] || "", /q=Avoriaz/);
  assert.equal(coverSearchUrl("Nice", false).includes("aspect_ratio"), false);
});
