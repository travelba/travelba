import assert from "node:assert/strict";
import test from "node:test";
import {
  columnsForFace,
  dossierFace,
  dossierFaceFromWord,
  dossierFaceLabel,
  hotelCardBookingStatus,
} from "./dossier-status";

test("trois états, et un confirmé caché est déjà Visible", () => {
  assert.equal(dossierFace({ status: "draft", visible_to_client: false }), "non_visible");
  assert.equal(dossierFace({ status: "quoted", visible_to_client: false }), "non_visible");
  assert.equal(dossierFace({ status: "draft", visible_to_client: true }), "visible");
  assert.equal(dossierFace({ status: "confirmed", visible_to_client: false }), "visible");
  assert.equal(dossierFace({ status: "confirmed", visible_to_client: true }), "visible");
  assert.equal(dossierFace({ status: "cancelled", visible_to_client: true }), "annule");
  assert.equal(dossierFaceLabel({ status: "draft" }), "Non visible");
  assert.equal(dossierFaceLabel({ status: "confirmed", visible_to_client: true }), "Visible");
  assert.equal(dossierFaceLabel({ status: "cancelled" }), "Annulé");
});

test("les colonnes d’un état ne divergent pas", () => {
  assert.deepEqual(columnsForFace("non_visible"), { status: "draft", visible_to_client: false });
  assert.deepEqual(columnsForFace("visible"), { status: "confirmed", visible_to_client: true });
  assert.deepEqual(columnsForFace("annule"), { status: "cancelled", visible_to_client: false });
  for (const face of ["non_visible", "visible", "annule"] as const) {
    assert.equal(dossierFace(columnsForFace(face)), face);
  }
});

test("les anciens mots restent acceptés", () => {
  assert.equal(dossierFaceFromWord("non_visible"), "non_visible");
  assert.equal(dossierFaceFromWord("Non visible"), "non_visible");
  assert.equal(dossierFaceFromWord("brouillon"), "non_visible");
  assert.equal(dossierFaceFromWord("devis"), "non_visible");
  assert.equal(dossierFaceFromWord("quoted"), "non_visible");
  assert.equal(dossierFaceFromWord("visible"), "visible");
  assert.equal(dossierFaceFromWord("Confirmée"), "visible");
  assert.equal(dossierFaceFromWord("confirme"), "visible");
  assert.equal(dossierFaceFromWord("annule"), "annule");
  assert.equal(dossierFaceFromWord("annulée"), "annule");
  assert.equal(dossierFaceFromWord("cancelled"), "annule");
  assert.equal(dossierFaceFromWord("en voyage"), null);
});

test("la carte hôtel suit Visible", () => {
  assert.equal(hotelCardBookingStatus({ status: "confirmed", visible_to_client: false }), "confirmed");
  assert.equal(hotelCardBookingStatus({ status: "draft", visible_to_client: true }), "confirmed");
  assert.equal(hotelCardBookingStatus({ status: "draft", visible_to_client: false }), "draft");
  assert.equal(hotelCardBookingStatus({ status: "cancelled", visible_to_client: false }), "cancelled");
});
