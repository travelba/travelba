import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUpload,
  isAllowedUploadType,
  MAX_UPLOAD_BYTES,
  UPLOAD_EMPTY_ERROR,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
  uploadIssue,
  UploadPolicyError,
} from "./upload-policy";

test("accepte PDF, JPEG, PNG, WebP et HEIC", () => {
  assert.equal(isAllowedUploadType("application/pdf", "confirmation.pdf"), true);
  assert.equal(isAllowedUploadType("image/jpeg", "passeport.jpg"), true);
  assert.equal(isAllowedUploadType("image/jpg", "passeport.jpg"), true);
  assert.equal(isAllowedUploadType("image/png", "scan.png"), true);
  assert.equal(isAllowedUploadType("image/webp", "scan.webp"), true);
  assert.equal(isAllowedUploadType("image/heic", "IMG_0001.HEIC"), true);
  assert.equal(isAllowedUploadType("image/heif", "IMG_0001.heif"), true);
  assert.equal(isAllowedUploadType("application/pdf; charset=binary", "a.pdf"), true);
});

test("un type générique laisse l’extension décider", () => {
  assert.equal(isAllowedUploadType("", "IMG_0001.HEIC"), true);
  assert.equal(isAllowedUploadType("application/octet-stream", "billet.pdf"), true);
  assert.equal(isAllowedUploadType(null, "scan.JPG"), true);
  assert.equal(isAllowedUploadType("", "script.exe"), false);
  assert.equal(isAllowedUploadType("application/octet-stream", "sans-extension"), false);
});

test("refuse les autres formats, même avec une extension rassurante", () => {
  assert.equal(isAllowedUploadType("text/html", "page.html"), false);
  assert.equal(isAllowedUploadType("application/zip", "archive.zip"), false);
  assert.equal(isAllowedUploadType("image/svg+xml", "logo.svg"), false);
  assert.equal(isAllowedUploadType("text/html", "faux.pdf"), false);
  assert.equal(isAllowedUploadType("application/x-msdownload", "virus.jpg"), false);
});

test("25 Mo maximum, pas de fichier vide", () => {
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
  assert.equal(uploadIssue({ size: 0, type: "application/pdf", name: "a.pdf" }), UPLOAD_EMPTY_ERROR);
  assert.equal(uploadIssue({ size: MAX_UPLOAD_BYTES + 1, type: "application/pdf", name: "a.pdf" }), UPLOAD_SIZE_ERROR);
  assert.equal(uploadIssue({ size: MAX_UPLOAD_BYTES, type: "application/pdf", name: "a.pdf" }), null);
  assert.equal(uploadIssue({ size: 10, type: "text/plain", name: "a.txt" }), UPLOAD_TYPE_ERROR);
  assert.throws(
    () => assertUpload({ size: 10, type: "text/plain", name: "a.txt" }),
    (err: unknown) => err instanceof UploadPolicyError && err.status === 400 && err.message === UPLOAD_TYPE_ERROR
  );
  assert.doesNotThrow(() => assertUpload({ size: 10, type: "image/png", name: "a.png" }));
});
