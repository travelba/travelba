import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  filterAutomaticCards,
  filterAutomaticExtract,
  matchesRemovedCard,
  reservationMarkedCancelled,
  sharesCancelledConfirmation,
  type AutoCard,
} from "./auto-card-guard";
import type { BookingExtract } from "./ingest-types";

type ExtractItem = BookingExtract["items"][number];

function hotel(patch: Partial<ExtractItem> = {}): ExtractItem {
  return {
    kind: "hotel",
    title: "Ocean Park",
    confirmation_ref: "64570SH046795",
    start_at: "2026-11-20",
    end_at: "2026-11-23",
    supplier: "Little Emperors",
    details: { hotel_name: "Ocean Park" },
    ...patch,
  };
}

function flight(patch: Partial<ExtractItem> = {}): ExtractItem {
  return {
    kind: "flight",
    title: "Nice → Dubaï",
    confirmation_ref: "KDP4AS",
    start_at: "2026-11-20T10:00:00",
    supplier: "Emirates",
    details: { flight_number: "EK 78", pnr: "KDP4AS" },
    ...patch,
  };
}

function card(item: ExtractItem, extra: Partial<AutoCard> = {}): AutoCard {
  return { ...item, details: (item.details || {}) as Record<string, unknown>, ...extra };
}

function extract(items: BookingExtract["items"], status: BookingExtract["document_status"] = "confirmed"): BookingExtract {
  return { document_status: status, title: "Séjour", currency: "EUR", items, travelers: [] };
}

describe("rattachement automatique", () => {
  it("ne recrée pas une carte que l’agence a retirée de ce dossier", () => {
    const removed = card(flight());
    assert.equal(matchesRemovedCard(card(flight()), removed), true);
    assert.equal(
      matchesRemovedCard(card(flight({ start_at: "2026-12-01T10:00:00", details: { flight_number: "EK 78" } })), removed),
      false
    );
    const filtered = filterAutomaticExtract(extract([flight(), hotel()]), {
      removed: [removed],
      cancelled: [],
    });
    assert.deepEqual(
      (filtered.extract.items || []).map((item) => item.kind),
      ["hotel"]
    );
    assert.deepEqual(filtered.skipped, [{ title: "Nice → Dubaï", reason: "retiree" }]);
  });

  it("n’ajoute pas en carte active une réservation annulée ailleurs ou marquée annulée", () => {
    assert.equal(reservationMarkedCancelled(card(hotel(), { lifecycle: "cancelled" })), true);
    assert.equal(
      reservationMarkedCancelled(card(hotel(), { details: { state: "canceled", hotel_name: "Ocean Park" } })),
      true
    );
    assert.equal(
      reservationMarkedCancelled(card(hotel(), { details: { hotel_name: "Ocean Park", cancellation_policy: "free cancellation" } })),
      false
    );
    assert.equal(
      sharesCancelledConfirmation(card(hotel()), {
        confirmation_ref: "64570SH046795",
        booking_status: "cancelled",
        lifecycle: "active",
      }),
      true
    );
    assert.equal(
      sharesCancelledConfirmation(card(hotel()), {
        confirmation_ref: "64570SH046795",
        booking_status: "draft",
        lifecycle: "active",
      }),
      false
    );
    const filtered = filterAutomaticExtract(extract([hotel(), flight()]), {
      removed: [],
      cancelled: [{ confirmation_ref: "64570SH046795", booking_status: "cancelled", lifecycle: "active" }],
    });
    assert.deepEqual(
      (filtered.extract.items || []).map((item) => item.title),
      ["Nice → Dubaï"]
    );
    assert.equal(filtered.skipped[0]?.reason, "annulee");
    const marked = filterAutomaticCards([card(hotel(), { lifecycle: "cancelled" })], { removed: [], cancelled: [] });
    assert.equal(marked.kept.length, 0);
    assert.equal(marked.skipped[0]?.reason, "marquee");
    const whole = filterAutomaticExtract(extract([hotel()], "cancelled"), { removed: [], cancelled: [] });
    assert.equal(whole.extract.items?.length, 0);
  });

  it("le rattachement automatique filtre les cartes et ne touche pas à la visibilité", () => {
    const stay = readFileSync(new URL("./email-stay-open-run.ts", import.meta.url), "utf8");
    const flights = readFileSync(new URL("./email-flight-deposit-run.ts", import.meta.url), "utf8");
    const ingest = readFileSync(new URL("./ingest-booking.ts", import.meta.url), "utf8");
    assert.match(stay, /guardAutomaticExtract/);
    assert.match(stay, /freezeClientVisibility: true/);
    assert.match(stay, /reopenIfCancelled: false/);
    assert.match(flights, /guardAutomaticExtract/);
    assert.match(flights, /freezeClientVisibility: opts\?\.automatic \? true/);
    assert.match(flights, /reopenIfCancelled: opts\?\.automatic \? false/);
    assert.match(ingest, /freezeClientVisibility/);
    const upsert = ingest.slice(ingest.indexOf("async function upsertItemsAndTravelers"), ingest.indexOf("export async function applyExtractToBooking"));
    assert.match(upsert, /freeze \? \(match \? null : false\)/);
  });
});
