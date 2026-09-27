import assert from "node:assert/strict";
import test from "node:test";
import { emptyBookingExtract } from "./ingest-types";
import { mergeFileExtracts } from "./ingest-merge";
import {
  applyEditedExtractTitle,
  dossierTitle,
  emailCardTitle,
  isEmailBodyFile,
  stayTitleForExtract,
} from "./ingest-title";

test("carte e-mail : le titre saisi est enregistré, le sujet ne le remplace pas", () => {
  const shown = emailCardTitle({
    title: "",
    destination: "",
    subject: "Booking confirmation",
  });
  assert.equal(shown, "Booking confirmation");

  const extract = applyEditedExtractTitle(emptyBookingExtract(), "Tel Aviv");
  assert.equal(extract.title, "Tel Aviv");
  assert.equal(dossierTitle(extract), "Tel Aviv");
  assert.equal(
    stayTitleForExtract({
      chosen: extract.title,
      incoming: "Booking confirmation",
      emailSubject: "Booking confirmation",
    }),
    "Tel Aviv"
  );
});

test("relecture : le sujet du mail ne devient pas le titre du séjour", () => {
  assert.equal(isEmailBodyFile("corps-email.txt"), true);
  assert.equal(
    stayTitleForExtract({
      chosen: "",
      incoming: "Votre réservation",
      emailSubject: "Votre réservation",
    }),
    ""
  );

  const merged = mergeFileExtracts([
    {
      name: "corps-email.txt",
      family: "unknown",
      extract: {
        ...emptyBookingExtract(),
        title: "Booking confirmation",
        destination: "Tel Aviv",
        items: [],
      },
    },
    {
      name: "hotel.pdf",
      family: "little_emperors",
      extract: {
        ...emptyBookingExtract(),
        title: "Tel Aviv",
        items: [
          {
            kind: "hotel",
            title: "Dan",
            supplier: null,
            confirmation_ref: null,
            start_at: "2026-08-10",
            end_at: "2026-08-12",
            amount: null,
            details: { hotel_name: "Dan", city: "Tel Aviv" },
          },
        ],
      },
    },
  ]);
  assert.equal(merged.extract.title, "Tel Aviv");
});
