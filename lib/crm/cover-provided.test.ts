import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_COVER_CREDIT,
  PROVIDED_COVER_MAX_BYTES,
  bookingCoverStoragePath,
  classifyProvidedCover,
  coverCreditText,
  materializeProvidedCover,
  providedCoverFailure,
  sniffCoverImage,
} from "./cover-provided";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const BOOKING = "22222222-2222-4222-8222-222222222222";

test("jpeg, png et webp sont reconnus, un gif ne l’est pas", () => {
  assert.equal(sniffCoverImage(PNG), "image/png");
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  assert.equal(sniffCoverImage(jpeg), "image/jpeg");
  const webp = Buffer.alloc(12);
  webp.write("RIFF", 0);
  webp.write("WEBP", 8);
  assert.equal(sniffCoverImage(webp), "image/webp");
  assert.equal(sniffCoverImage(Buffer.from("GIF89a")), null);
});

function coverError(value: string) {
  const result = classifyProvidedCover(value);
  return "error" in result ? result.error : "";
}

test("une image en base64 ou en URL https se dépose, le catalogue reste le catalogue", () => {
  assert.deepEqual(classifyProvidedCover("catalogue"), { kind: "catalog" });
  assert.deepEqual(classifyProvidedCover("Montpellier"), { kind: "catalog" });
  const file = classifyProvidedCover(PNG.toString("base64"));
  assert.equal("kind" in file && file.kind, "image");
  if (!("kind" in file) || file.kind !== "image" || file.source !== "file") throw new Error("fichier attendu");
  assert.equal(file.mime, "image/png");
  const data = classifyProvidedCover(`data:image/png;base64,${PNG.toString("base64")}`);
  assert.equal("kind" in data && data.kind, "image");
  const url = classifyProvidedCover("https://images.example.com/cover.jpg");
  assert.deepEqual(url, { kind: "image", source: "url", url: "https://images.example.com/cover.jpg" });
  assert.match(coverError("http://images.example.com/cover.jpg"), /HTTPS/);
  assert.match(coverError("https://127.0.0.1/cover.jpg"), /refusée/);
  assert.match(coverError(`data:image/gif;base64,${PNG.toString("base64")}`), /JPEG/);
  const heavy = Buffer.alloc(PROVIDED_COVER_MAX_BYTES + 1);
  heavy[0] = 0xff;
  heavy[1] = 0xd8;
  heavy[2] = 0xff;
  assert.equal(coverError(heavy.toString("base64")), "Photo trop lourde (5 Mo maximum).");
});

test("le crédit par défaut est Image générée par IA", () => {
  assert.deepEqual(coverCreditText(undefined), { credit: DEFAULT_COVER_CREDIT });
  assert.deepEqual(coverCreditText("  "), { credit: DEFAULT_COVER_CREDIT });
  assert.deepEqual(coverCreditText("Photo : Ada"), { credit: "Photo : Ada" });
  assert.equal("error" in coverCreditText("x".repeat(121)), true);
});

test("l’image est déposée en webp sur le chemin des couvertures", async () => {
  const uploaded: { path: string; type: string; bytes: Buffer }[] = [];
  const stored = await materializeProvidedCover({
    bookingId: BOOKING,
    image: { source: "file", bytes: PNG, mime: "image/png" },
    upload: async (path, bytes, type) => {
      uploaded.push({ path, type, bytes });
    },
  });
  assert.equal(stored.path, bookingCoverStoragePath(BOOKING));
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0]?.type, "image/webp");
  assert.equal(sniffCoverImage(uploaded[0]?.bytes || Buffer.alloc(0)), "image/webp");
  const fromUrl = await materializeProvidedCover({
    bookingId: BOOKING,
    image: { source: "url", url: "https://images.example.com/cover.png" },
    download: async () => PNG,
    upload: async () => undefined,
  });
  assert.equal(fromUrl.path, `bookings/${BOOKING}/cover.webp`);
  await assert.rejects(
    () =>
      materializeProvidedCover({
        bookingId: BOOKING,
        image: { source: "url", url: "https://images.example.com/big.jpg" },
        download: async () => {
          const bytes = Buffer.alloc(PROVIDED_COVER_MAX_BYTES + 1);
          bytes[0] = 0xff;
          bytes[1] = 0xd8;
          bytes[2] = 0xff;
          return bytes;
        },
      }),
    (err: unknown) => providedCoverFailure(err) === "Photo trop lourde (5 Mo maximum)."
  );
  await assert.rejects(
    () =>
      materializeProvidedCover({
        bookingId: BOOKING,
        image: { source: "url", url: "https://images.example.com/note.txt" },
        download: async () => Buffer.from("pas une image"),
      }),
    (err: unknown) => providedCoverFailure(err) === "Formats acceptés : JPEG, PNG ou WebP."
  );
});
