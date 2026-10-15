import assert from "node:assert/strict";
import test from "node:test";
import { reviewDoubts, reviewStepLabel, storedReviewReason } from "./review-doubt";

test("une carte sans drapeau ne dit rien", () => {
  assert.deepEqual(
    reviewDoubts({
      kind: "hotel",
      title: "Phuket",
      details: { city: "Phuket", needs_review: false },
    }),
    []
  );
});

test("une option dont le nom est la ville dit les deux", () => {
  const july = {
    kind: "hotel",
    title: "Phuket",
    start_at: "2027-07-15",
    end_at: "2027-07-20",
    details: {
      hotel_name: "Phuket",
      city: "Phuket",
      needs_review: true,
      source_file_name: "OPT-Option 153182539 Juillet.pdf",
    },
  };
  assert.equal(reviewStepLabel(july), "Phuket, 15–20 juil");
  assert.deepEqual(reviewDoubts(july), [
    "Le fichier « OPT-Option 153182539 Juillet.pdf » est une option, pas une confirmation.",
    "Le nom lu est la ville (Phuket), pas l’établissement.",
  ]);
});

test("sans nom d’hôtel, la carte qui porte la ville le dit", () => {
  const august = {
    kind: "hotel",
    title: "Phuket",
    start_at: "2027-08-15",
    end_at: "2027-08-20",
    details: {
      city: "Phuket",
      needs_review: true,
      source_file_name: "OPT-Option 154182539 Aout.pdf",
    },
  };
  assert.equal(reviewStepLabel(august), "Phuket, 15–20 août");
  assert.match(reviewDoubts(august).join(" "), /n’a pas été lu/);
  assert.match(reviewDoubts(august).join(" "), /option/i);
});

test("la phrase enregistrée remplace la déduction", () => {
  assert.deepEqual(
    reviewDoubts({
      kind: "hotel",
      title: "Option villa",
      details: {
        needs_review: true,
        review_reason: "Issue d’un devis, pas d’une confirmation.",
        source_file_name: "devis.pdf",
        hotel_name: "Passion",
        city: "Paris",
      },
    }),
    ["Issue d’un devis, pas d’une confirmation."]
  );
  assert.equal(storedReviewReason({ review_reason: "court" }), "");
  assert.equal(storedReviewReason({ review_reason: "Nom d’hôtel illisible" }), "Nom d’hôtel illisible.");
});

test("un drapeau sans indice le dit", () => {
  assert.deepEqual(
    reviewDoubts({ kind: "flight", title: "Rome → Paris", details: { needs_review: true } }),
    ["La lecture est marquée douteuse, sans préciser le champ."]
  );
});
