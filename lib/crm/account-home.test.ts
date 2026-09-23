import assert from "node:assert/strict";
import test from "node:test";
import type { CrmBookingItem } from "./types";
import {
  homeBalanceDetail,
  homeDateLabel,
  homePassportRow,
  homeTimingLabel,
  homeTripHighlights,
} from "./account-home";
import { isoDateInDays } from "./money";

function item(partial: Partial<CrmBookingItem> & Pick<CrmBookingItem, "kind" | "title">): CrmBookingItem {
  return {
    id: partial.kind,
    booking_id: "b",
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

test("l’accueil annonce un séjour déjà commencé", () => {
  assert.equal(
    homeTimingLabel({
      start_date: isoDateInDays(-2),
      end_date: isoDateInDays(5),
      status: "confirmed",
    }),
    "En cours"
  );
  assert.equal(
    homeTimingLabel({
      start_date: isoDateInDays(0),
      end_date: isoDateInDays(4),
      status: "confirmed",
    }),
    "Aujourd’hui"
  );
  assert.match(
    homeTimingLabel({
      start_date: isoDateInDays(12),
      end_date: isoDateInDays(18),
      status: "confirmed",
    }) || "",
    /^J - /
  );
  assert.equal(
    homeTimingLabel({
      start_date: isoDateInDays(-20),
      end_date: isoDateInDays(-2),
      status: "completed",
    }),
    null
  );
});

test("les dates du séjour comptent les jours inclus", () => {
  assert.match(homeDateLabel({ start_date: "2026-12-12", end_date: "2026-12-14" }), /\(3 jours\)$/);
  assert.equal(homeDateLabel({ start_date: null, end_date: null }), "Dates à confirmer");
});

test("le résumé ne montre que le vol et l’hôtel visibles", () => {
  const rows = homeTripHighlights([
    item({
      kind: "flight",
      title: "Masqué",
      visible_to_client: false,
      details: { from: "CDG", to: "GVA" },
    }),
    item({
      kind: "flight",
      title: "Vol",
      sort_order: 1,
      details: { from: "CDG", to: "GVA", city_from: "Paris", city_to: "Genève" },
    }),
    item({
      kind: "hotel",
      title: "Hôtel des Dromonts",
      sort_order: 2,
      start_at: "2026-12-12",
      end_at: "2026-12-14",
      details: { hotel_name: "Hôtel des Dromonts", city: "Avoriaz" },
    }),
    item({ kind: "fee", title: "Frais", sort_order: 3 }),
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.title, "CDG → GVA");
  assert.equal(rows[0]?.detail, "Paris → Genève");
  assert.equal(rows[1]?.title, "Hôtel des Dromonts");
  assert.match(rows[1]?.detail || "", /Avoriaz/);
  assert.match(rows[1]?.detail || "", /2 nuits/);
  assert.doesNotMatch(rows[1]?.detail || "", /00h00/);
});

test("l’hôtel sans date ne fabrique pas une plage vide", () => {
  const rows = homeTripHighlights([
    item({
      kind: "hotel",
      title: "Avoriaz",
      details: { city: "Avoriaz" },
    }),
  ]);
  assert.equal(rows[0]?.title, "Avoriaz");
  assert.equal(rows[0]?.detail, "");
});

test("les pièces manquantes sont signalées", () => {
  assert.equal(homePassportRow("/x", 1, 3).attention, true);
  assert.match(homePassportRow("/x", 1, 3).title, /2 voyageurs/);
  assert.equal(homePassportRow("/x", 2, 2).attention, undefined);
  assert.equal(homePassportRow("/x", 0, 0).title, "Voyageurs à compléter");
});

test("l’encours dit le signe réel", () => {
  assert.equal(homeBalanceDetail([{ currency: "EUR", value: -10 }]), "Reste à régler");
  assert.equal(homeBalanceDetail([{ currency: "EUR", value: 40 }]), "Avoir sur le compte");
  assert.equal(homeBalanceDetail([{ currency: "EUR", value: 0 }]), "Compte à jour");
});
