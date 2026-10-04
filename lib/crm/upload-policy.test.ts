import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUpload,
  isAllowedUploadType,
  MAX_UPLOAD_BYTES,
  UPLOAD_EMPTY_ERROR,
  UPLOAD_SIZE_ERROR,
  UPLOAD_TYPE_ERROR,
  UPLOAD_TYPE_ERRORS,
  uploadIssue,
  UploadPolicyError,
} from "./upload-policy";

test("pièces d’identité : PDF, JPEG, PNG, WebP et HEIC seulement", () => {
  assert.equal(isAllowedUploadType("application/pdf", "confirmation.pdf"), true);
  assert.equal(isAllowedUploadType("image/jpeg", "passeport.jpg"), true);
  assert.equal(isAllowedUploadType("image/jpg", "passeport.jpg"), true);
  assert.equal(isAllowedUploadType("image/png", "scan.png"), true);
  assert.equal(isAllowedUploadType("image/webp", "scan.webp"), true);
  assert.equal(isAllowedUploadType("image/heic", "IMG_0001.HEIC"), true);
  assert.equal(isAllowedUploadType("image/heif", "IMG_0001.heif"), true);
  assert.equal(isAllowedUploadType("application/pdf; charset=binary", "a.pdf"), true);
  assert.equal(isAllowedUploadType("message/rfc822", "mail.eml", "identity"), false);
  assert.equal(isAllowedUploadType("text/plain", "notes.txt", "identity"), false);
  assert.equal(isAllowedUploadType("", "mail.eml", "identity"), false);
});

test("pièces d’un dossier : en plus, e-mail, Word, Excel, texte, calendrier", () => {
  assert.equal(isAllowedUploadType("application/pdf", "confirmation.pdf", "dossier"), true);
  assert.equal(isAllowedUploadType("image/jpeg", "photo.jpg", "dossier"), true);
  assert.equal(isAllowedUploadType("message/rfc822", "mail.eml", "dossier"), true);
  assert.equal(
    isAllowedUploadType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "lettre.docx", "dossier"),
    true
  );
  assert.equal(
    isAllowedUploadType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "budget.xlsx", "dossier"),
    true
  );
  assert.equal(isAllowedUploadType("text/plain", "notes.txt", "dossier"), true);
  assert.equal(isAllowedUploadType("text/calendar", "vol.ics", "dossier"), true);
  // Type générique : l’extension décide, dans la liste du dossier seulement.
  assert.equal(isAllowedUploadType("application/octet-stream", "mail.eml", "dossier"), true);
  assert.equal(isAllowedUploadType("", "budget.xlsx", "dossier"), true);
  assert.equal(isAllowedUploadType("application/octet-stream", "archive.zip", "dossier"), false);
  assert.equal(isAllowedUploadType("application/octet-stream", "programme.exe", "dossier"), false);
  // Type connu hors liste : refusé même avec une extension rassurante.
  assert.equal(isAllowedUploadType("text/html", "page.txt", "dossier"), false);
  assert.equal(isAllowedUploadType("application/zip", "archive.zip", "dossier"), false);
  assert.equal(isAllowedUploadType("application/msword", "lettre.doc", "dossier"), false);
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

test("25 Mo maximum, pas de fichier vide, message selon la politique", () => {
  assert.equal(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
  assert.equal(uploadIssue({ size: 0, type: "application/pdf", name: "a.pdf" }), UPLOAD_EMPTY_ERROR);
  assert.equal(uploadIssue({ size: MAX_UPLOAD_BYTES + 1, type: "application/pdf", name: "a.pdf" }), UPLOAD_SIZE_ERROR);
  assert.equal(uploadIssue({ size: MAX_UPLOAD_BYTES, type: "application/pdf", name: "a.pdf" }), null);
  assert.equal(uploadIssue({ size: 10, type: "text/plain", name: "a.txt" }), UPLOAD_TYPE_ERROR);
  assert.equal(uploadIssue({ size: 10, type: "text/plain", name: "a.txt" }, "dossier"), null);
  assert.equal(uploadIssue({ size: 10, type: "application/zip", name: "a.zip" }, "dossier"), UPLOAD_TYPE_ERRORS.dossier);
  assert.throws(
    () => assertUpload({ size: 10, type: "text/plain", name: "a.txt" }),
    (err: unknown) => err instanceof UploadPolicyError && err.status === 400 && err.message === UPLOAD_TYPE_ERROR
  );
  assert.doesNotThrow(() => assertUpload({ size: 10, type: "text/plain", name: "a.txt" }, "dossier"));
  assert.doesNotThrow(() => assertUpload({ size: 10, type: "image/png", name: "a.png" }));
});
