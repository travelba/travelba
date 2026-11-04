import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  columnsForFace,
  dossierFace,
  dossierFaceFromWord,
  dossierFaceLabel,
  hotelCardBookingStatus,
} from "./dossier-status";

test("trois états : un confirmé caché reste Non visible", () => {
  assert.equal(dossierFace({ status: "draft", visible_to_client: false }), "non_visible");
  assert.equal(dossierFace({ status: "quoted", visible_to_client: false }), "non_visible");
  assert.equal(dossierFace({ status: "draft", visible_to_client: true }), "visible");
  assert.equal(dossierFace({ status: "confirmed", visible_to_client: false }), "non_visible");
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

test("la carte hôtel suit Visible, un confirmé caché n’est pas annulé", () => {
  assert.equal(hotelCardBookingStatus({ status: "confirmed", visible_to_client: false }), "confirmed");
  assert.notEqual(hotelCardBookingStatus({ status: "confirmed", visible_to_client: false }), "cancelled");
  assert.equal(hotelCardBookingStatus({ status: "draft", visible_to_client: true }), "confirmed");
  assert.equal(hotelCardBookingStatus({ status: "draft", visible_to_client: false }), "draft");
  assert.equal(hotelCardBookingStatus({ status: "cancelled", visible_to_client: false }), "cancelled");
});

test("la migration laisse les confirmés cachés en Non visible, sans livre ni carte", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261104140000_dossier_trois_statuts.sql", import.meta.url), "utf8");
  assert.match(sql, /status = 'confirmed'[\s\S]*coalesce\(visible_to_client, false\) = false/);
  assert.match(sql, /set status = 'draft',\s*visible_to_client = false/);
  assert.match(sql, /disable trigger trg_crm_booking_debit/);
  assert.match(sql, /enable trigger trg_crm_booking_debit/);
  assert.doesNotMatch(sql, /crm_transactions|crm_pliant|crm_hotel_arrivals|whatsapp|notify/i);
  const hidden = sql.slice(sql.indexOf("Confirmé mais caché"), sql.indexOf("Brouillon ou devis"));
  assert.match(hidden, /status = 'draft'/);
  assert.doesNotMatch(hidden, /visible_to_client = true/);
});
