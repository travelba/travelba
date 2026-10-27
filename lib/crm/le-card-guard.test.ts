import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  automaticCardAudits,
  automaticHotelCardPatch,
  confirmationForStamp,
  hotelCardAutoCancel,
  hotelStampChanged,
  planAutomaticHotelCancel,
} from "./le-card-guard";

const booked = { confirmation: "96901589", state: "booked" };
const cancelled = { confirmation: "96890091", state: "cancelled" };

describe("références multiples Little Emperors", () => {
  it("laisse la carte active dès qu’une référence est réservée", () => {
    const decision = hotelCardAutoCancel("96901589;96890091", [booked, cancelled]);
    assert.equal(decision.booked, true);
    assert.equal(decision.cancel, false);
    assert.equal(
      automaticHotelCardPatch({ lifecycle: "active", visible_to_client: true }, decision),
      null
    );
  });

  it("n’annule pas une carte dont une référence est inconnue", () => {
    const decision = hotelCardAutoCancel("96901589;96890091", [cancelled]);
    assert.equal(decision.cancel, false);
    assert.equal(decision.booked, false);
  });

  it("annule seulement quand chaque référence est annulée", () => {
    assert.equal(hotelCardAutoCancel("96890091", [cancelled]).cancel, true);
    assert.equal(
      hotelCardAutoCancel("20083SH263827;20083SH263828", [
        { confirmation: "20083SH263827;20083SH263828", state: "cancelled" },
      ]).cancel,
      true
    );
    const patch = automaticHotelCardPatch(
      { lifecycle: "active", visible_to_client: true },
      { cancel: true, booked: false }
    );
    assert.deepEqual(patch, { lifecycle: "cancelled", visible_to_client: false });
    assert.equal(patch && "include_in_ledger" in patch, false);
  });

  it("n’ajoute pas une confirmation annulée à une carte qui a déjà une autre référence", () => {
    assert.equal(confirmationForStamp("96901589", "96890091", true), null);
    assert.equal(confirmationForStamp("96890091", "96890091", true), "96890091");
    assert.equal(confirmationForStamp("96901589", "96901589", false), "96901589");
  });

  it("ne réécrit pas une carte déjà à jour", () => {
    const details = { le_hotel_id: 12, source_family: "little_emperors", hotel_name: "Le Méridien Frankfurt" };
    assert.equal(
      hotelStampChanged(
        { confirmation_ref: "96901589", details },
        { confirmation_ref: "96901589", details: { source_family: "little_emperors", hotel_name: "Le Méridien Frankfurt", le_hotel_id: 12 } }
      ),
      false
    );
    assert.equal(
      hotelStampChanged({ confirmation_ref: "96901589", details }, { confirmation_ref: "96901589;96890091", details }),
      true
    );
  });
});

describe("plan du sync", () => {
  const card = {
    id: "f065b434",
    confirmation_ref: "96901589;96890091",
    lifecycle: "active",
    visible_to_client: true,
  };

  it("ne change ni le statut, ni la visibilité, ni le livre d’une carte réservée", () => {
    const plan = planAutomaticHotelCancel({
      items: [card],
      matchedIds: [card.id],
      known: [booked, cancelled],
      mode: "sync",
    });
    assert.deepEqual(plan.keptBookedIds, [card.id]);
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.useLedgerCancellation, false);
  });

  it("ne réécrit pas une carte déjà annulée et cachée", () => {
    const plan = planAutomaticHotelCancel({
      items: [{ id: "x", confirmation_ref: "96890091", lifecycle: "cancelled", visible_to_client: false }],
      matchedIds: ["x"],
      known: [cancelled],
      mode: "sync",
    });
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.useLedgerCancellation, false);
  });

  it("le sync n’écrit pas le grand livre, même si toutes les références sont annulées", () => {
    const plan = planAutomaticHotelCancel({
      items: [{ ...card, confirmation_ref: "96890091" }],
      matchedIds: [card.id],
      known: [cancelled],
      mode: "sync",
    });
    assert.equal(plan.useLedgerCancellation, false);
    assert.equal(plan.updates[0]?.patch.lifecycle, "cancelled");
    assert.equal(plan.updates[0]?.patch.visible_to_client, false);
    assert.equal("include_in_ledger" in (plan.updates[0]?.patch || {}), false);
  });

  it("le geste agence retire le débit seulement si aucune référence n’est réservée", () => {
    const kept = planAutomaticHotelCancel({
      items: [card],
      matchedIds: [card.id],
      known: [booked, cancelled],
      mode: "agent",
    });
    assert.equal(kept.useLedgerCancellation, false);
    const full = planAutomaticHotelCancel({
      items: [{ ...card, confirmation_ref: "96890091" }],
      matchedIds: [card.id],
      known: [cancelled],
      mode: "agent",
    });
    assert.equal(full.useLedgerCancellation, true);
  });
});

describe("journal automatique", () => {
  it("note la source et les valeurs avant et après", () => {
    const rows = automaticCardAudits({
      bookingId: "dossier",
      customerId: "client",
      itemId: "f065b434",
      source: "little_emperors_sync",
      changes: [
        { field: "lifecycle", oldValue: "active", newValue: "cancelled" },
        { field: "visible_to_client", oldValue: true, newValue: false },
        { field: "lifecycle", oldValue: "cancelled", newValue: "cancelled" },
      ],
    });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.actor_kind, "auto");
    assert.equal(rows[0]?.action, "carte_statut");
    assert.equal(rows[0]?.entity_type, "booking_item");
    assert.equal(rows[0]?.detail.source, "little_emperors_sync");
    assert.equal(rows[0]?.detail.old, "active");
    assert.equal(rows[0]?.detail.new, "cancelled");
    assert.equal(rows[1]?.action, "carte_visibilite");
    assert.equal(rows[1]?.detail.old, true);
    assert.equal(rows[1]?.detail.new, false);
  });
});

describe("le sync ne touche pas aux coûts hôtel", () => {
  it("n’écrit pas crm_trip_costs", () => {
    const source = readFileSync(new URL("./little-emperors-sync.ts", import.meta.url), "utf8");
    assert.equal(source.includes("crm_trip_costs"), false);
    assert.match(source, /planAutomaticHotelCancel/);
  });
});
