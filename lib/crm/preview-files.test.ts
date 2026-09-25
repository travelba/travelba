import assert from "node:assert/strict";
import test from "node:test";
import { fileDownloadHref, fileHref, fileInlineHref } from "./file-href";
import { attachmentPreviews, passportPreviewsForStay } from "./preview-files";
import type { CrmBookingDocument, CrmBookingItem, CrmBookingTraveler, CrmTravelDocument } from "./types";

function traveler(partial: Partial<CrmBookingTraveler>): CrmBookingTraveler {
  return {
    id: "t1",
    booking_id: "b1",
    companion_id: null,
    is_account_holder: true,
    first_name: "Ada",
    last_name: "Martin",
    created_at: "",
    ...partial,
  };
}

function passport(partial: Partial<CrmTravelDocument>): CrmTravelDocument {
  return {
    id: "d1",
    customer_id: "c1",
    companion_id: null,
    booking_id: null,
    traveler_id: null,
    doc_type: "passport",
    number: "XX00YY11",
    issuing_country: "FR",
    issued_on: null,
    expires_on: "2030-01-01",
    first_name: "Ada",
    last_name: "Martin",
    birth_date: null,
    nationality: "FR",
    sex: null,
    place_of_birth: null,
    authority: null,
    personal_number: null,
    storage_path: "customers/c1/passport.jpg",
    file_name: "passeport.jpg",
    mime_type: "image/jpeg",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

test("les aperçus passent par une URL courte", () => {
  assert.equal(fileHref("bookings/b1/a.pdf"), "/api/files?path=bookings%2Fb1%2Fa.pdf");
  assert.match(fileDownloadHref("bookings/b1/a.pdf", "billet.pdf"), /^\/api\/files\?/);
  assert.match(fileDownloadHref("bookings/b1/a.pdf", "billet.pdf"), /download=1/);
  assert.equal(fileHref("bookings/b1/a.pdf").includes("token"), false);
  assert.match(fileInlineHref("bookings/b1/a.pdf"), /inline=1/);
  assert.equal(fileInlineHref("bookings/b1/a.pdf").includes("supabase"), false);
});

test("un passeport sans fichier n’apparaît pas, et le partage ignore le numéro", () => {
  const holder = traveler({});
  const guest = traveler({
    id: "t2",
    is_account_holder: false,
    companion_id: "comp",
    first_name: "Léo",
    last_name: "Martin",
  });
  const files = passportPreviewsForStay(
    [holder, guest],
    [
      passport({}),
      passport({
        id: "empty",
        first_name: "Léo",
        last_name: "Martin",
        companion_id: "comp",
        storage_path: null,
        number: "SECRET99",
      }),
    ],
    { first_name: "Ada", last_name: "Martin" },
    "TB-1"
  );
  assert.equal(files.length, 1);
  assert.equal(files[0]?.label, "Ada Martin");
  assert.equal(files[0]?.path, "customers/c1/passport.jpg");
  assert.equal(files[0]?.shareText.includes("XX00"), false);
  assert.equal(files[0]?.shareText.includes("SECRET"), false);
  assert.match(files[0]?.shareText || "", /dossier TB-1/);
});

test("les pièces jointes reprennent le libellé du dossier", () => {
  const item = {
    id: "i1",
    kind: "hotel",
    source_document_id: "doc1",
  } as CrmBookingItem;
  const doc = {
    id: "doc1",
    booking_id: "b1",
    kind: "pdf",
    file_name: "confirmation.pdf",
    mime_type: "application/pdf",
    storage_path: "bookings/b1/confirmation.pdf",
    visible_to_client: true,
    created_at: "",
  } as CrmBookingDocument;
  const [file] = attachmentPreviews([doc], [item], "TB-1");
  assert.match(file?.label || "", /confirmation\.pdf/);
  assert.equal(file?.shareText.includes("confirmation.pdf"), false);
  assert.equal(file?.path.startsWith("bookings/"), true);
});
