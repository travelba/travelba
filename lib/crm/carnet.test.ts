import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CrmBookingItem } from "./types";
import {
  carnetVisible,
  coverQuery,
  groupByDay,
  hotelStayLabel,
  itemClock,
  whatsappModifyHref,
} from "./carnet";
import { canPublishCarnet } from "./bookings";
import { bookingCoverUrl } from "./covers";
import { sanitizeExtractedPrices } from "./ingest-types";

function item(partial: Partial<CrmBookingItem>): CrmBookingItem {
  return {
    id: "i",
    booking_id: "b",
    kind: "flight",
    title: "Vol",
    supplier: null,
    confirmation_ref: null,
    start_at: null,
    end_at: null,
    amount: null,
    sort_order: 0,
    details: {},
    visible_to_client: true,
    source_document_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("carnet", () => {
  it("écrit 3 nuits sans répéter les jours", () => {
    const label = hotelStayLabel(
      item({
        kind: "hotel",
        start_at: "2026-08-12",
        end_at: "2026-08-15",
      })
    );
    assert.match(label, /3 nuits/);
  });

  it("saute les jours sans prestation", () => {
    const groups = groupByDay([
      item({ start_at: "2026-08-12T10:00:00Z", title: "Aller" }),
      item({ start_at: "2026-08-20T18:00:00Z", title: "Retour" }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0][0], "2026-08-12");
  });

  it("cache un séjour sans carte visible", () => {
    assert.equal(
      carnetVisible({ visible_to_client: true }, [
        item({ visible_to_client: false, kind: "hotel" }),
      ]),
      false
    );
    assert.equal(
      carnetVisible({ visible_to_client: true }, [
        item({ visible_to_client: true, kind: "hotel" }),
      ]),
      true
    );
  });

  it("prend la première ville pour la couverture", () => {
    assert.equal(coverQuery("Marrakech · Essaouira", "Voyage"), "Marrakech");
  });

  it("sert une couverture Unsplash légère", () => {
    const url = bookingCoverUrl(
      { destination: "Marrakech", title: "Voyage", cover_image_path: null },
      800
    );
    assert.match(url, /w=800/);
    assert.match(url, /h=600/);
    assert.match(url, /q=70/);
  });

  it("respecte l’ordre agent dans un même jour", () => {
    const groups = groupByDay([
      item({ id: "b", start_at: "2026-08-12T18:00:00", title: "Soir", sort_order: 0 }),
      item({ id: "a", start_at: "2026-08-12T08:00:00", title: "Matin", sort_order: 1 }),
    ]);
    assert.equal(groups[0][1][0].title, "Soir");
    assert.equal(groups[0][1][1].title, "Matin");
  });

  it("prépare le WhatsApp de modification", () => {
    const href = whatsappModifyHref("33756841315", "TBA-1042", "Marrakech");
    assert.match(href, /wa\.me\/33756841315/);
    assert.match(href, /TBA-1042/);
  });

  it("affiche l’heure locale imprimée sans conversion", () => {
    assert.equal(itemClock("2026-08-12T08:40:00"), "08h40");
  });

  it("refuse de publier un carnet sans carte métier", () => {
    assert.equal(canPublishCarnet([{ kind: "fee" }]), false);
    assert.equal(canPublishCarnet([{ kind: "hotel" }]), true);
  });

  it("efface les prix extraits pour laisser l’agent saisir le vendu", () => {
    const cleaned = sanitizeExtractedPrices({
      document_status: "confirmed",
      title: "Marrakech",
      destination: "Marrakech",
      start_date: "2026-08-12",
      end_date: "2026-08-15",
      currency: "EUR",
      total_amount: 858.8,
      notes_client: null,
      customer_email: null,
      customer_first_name: null,
      customer_last_name: null,
      items: [
        {
          kind: "hotel",
          title: "Andaz",
          supplier: null,
          confirmation_ref: "97620170",
          start_at: "2026-08-12",
          end_at: "2026-08-15",
          amount: 858.8,
          details: {},
        },
      ],
      travelers: [],
    });
    assert.equal(cleaned.total_amount, null);
    assert.equal(cleaned.items[0].amount, null);
  });
});
