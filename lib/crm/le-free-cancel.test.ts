import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClientLeCancelMail, runClientLeCancel } from "./le-client-cancel";
import {
  CLIENT_CANCEL_ADVISOR,
  CLIENT_CANCEL_CARD_LAG,
  CLIENT_CANCEL_NOT_SENT,
  CLIENT_CANCEL_REFUSED,
  clientCancelQuestion,
  clientCancelTrace,
  clientHotelCancelOffers,
  decideClientLeCancel,
  freeLeCancellation,
  leDeadlineInstant,
  leDeadlineLabel,
  type LeCancelRow,
} from "./le-free-cancel";
import type { LeBooking } from "./little-emperors";
import type { CrmBookingItem } from "./types";

const FREE_POLICY = [
  "Free cancellation until 1 October 2026, 12:00. After this time, a one night penalty applies.",
];

function hotel(patch: Partial<CrmBookingItem> = {}): CrmBookingItem {
  return {
    id: "item-1",
    booking_id: "book-1",
    kind: "hotel",
    title: "Nobu Hotel London",
    supplier: "Little Emperors",
    confirmation_ref: "LECONF88",
    start_at: "2026-11-01",
    end_at: "2026-11-04",
    amount: null,
    include_in_ledger: false,
    sort_order: 0,
    details: { hotel_name: "Nobu Hotel London", le_hotel_id: 9626, city: "Londres" },
    visible_to_client: true,
    source_document_id: null,
    lifecycle: "active",
    created_at: "",
    updated_at: "",
    ...patch,
  };
}

function row(patch: Partial<LeCancelRow> = {}): LeCancelRow {
  return {
    id: "le-row",
    le_booking_id: 88,
    confirmation_number: "LECONF88",
    hotel_id: 9626,
    hotel_name: "Nobu Hotel London",
    check_in: "2026-11-01",
    check_out: "2026-11-04",
    state: "confirmed",
    is_cancellable: true,
    cancellation_deadline: "2026-10-01 12:00:00",
    cancellation_policies: FREE_POLICY,
    status: "linked",
    ...patch,
  };
}

function fresh(patch: Partial<LeBooking> = {}): LeBooking {
  return {
    id: 88,
    hotel_id: 9626,
    hotel_name: "Nobu Hotel London",
    city: "London",
    address: null,
    website: null,
    check_in: "2026-11-01",
    check_out: "2026-11-04",
    state: "confirmed",
    confirmation_number: "LECONF88",
    total_cost: null,
    currency: "EUR",
    is_cancellable: true,
    cancellation_deadline: "2026-10-01 12:00:00",
    guest_names: [],
    cancellation_policies: FREE_POLICY,
    room_types: [],
    benefits: [],
    ...patch,
  };
}

const before = new Date("2026-09-30T21:00:00.000Z");
const atLimit = new Date("2026-09-30T22:00:00.000Z");

describe("annulation gratuite Little Emperors", () => {
  it("accepte une politique sans frais encore ouverte", () => {
    const verdict = freeLeCancellation(row(), before);
    assert.equal(verdict.ok, true);
    if (verdict.ok) assert.equal(verdict.untilLabel, "1 octobre 2026, 12:00");
  });

  it("ferme la fenêtre à l’instant de la limite, lue au fuseau le plus en avance", () => {
    assert.equal(leDeadlineInstant("2026-10-01 12:00:00")?.toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(freeLeCancellation(row(), atLimit).ok, false);
    assert.equal(freeLeCancellation(row(), new Date("2026-10-01T11:00:00.000Z")).ok, false);
  });

  it("respecte un fuseau déjà écrit", () => {
    const zoned = { ...row(), cancellation_deadline: "2026-10-01T12:00:00Z" };
    assert.equal(freeLeCancellation(zoned, new Date("2026-10-01T11:00:00.000Z")).ok, true);
    assert.equal(freeLeCancellation(zoned, new Date("2026-10-01T12:00:00.000Z")).ok, false);
    assert.equal(leDeadlineLabel("2026-10-01T12:00:00+02:00"), "1 octobre 2026, 12:00");
  });

  it("refuse si Little Emperors ne dit pas la réservation annulable", () => {
    assert.equal(freeLeCancellation(row({ is_cancellable: false }), before).ok, false);
    assert.equal(freeLeCancellation(row({ is_cancellable: null }), before).ok, false);
  });

  it("refuse une limite absente, illisible ou déjà passée", () => {
    assert.equal(freeLeCancellation(row({ cancellation_deadline: null }), before).ok, false);
    assert.equal(freeLeCancellation(row({ cancellation_deadline: "bientôt" }), before).ok, false);
    assert.equal(freeLeCancellation(row({ cancellation_deadline: "2026-02-31 12:00:00" }), before).ok, false);
    assert.equal(freeLeCancellation(row(), new Date("2026-10-02T00:00:00.000Z")).ok, false);
  });

  it("refuse une politique vide, non remboursable, ou payante sans fenêtre gratuite", () => {
    assert.equal(freeLeCancellation(row({ cancellation_policies: [] }), before).ok, false);
    assert.equal(freeLeCancellation(row({ cancellation_policies: ["Non-refundable rate"] }), before).ok, false);
    assert.equal(freeLeCancellation(row({ cancellation_policies: ["Cancellation fee: one night"] }), before).ok, false);
    assert.equal(
      freeLeCancellation(
        row({ cancellation_policies: ["Free cancellation. A fee of one night applies."] }),
        before
      ).ok,
      false
    );
  });

  it("accepte le français sans frais, et la nuit facturée seulement après la limite", () => {
    assert.equal(
      freeLeCancellation(
        row({
          cancellation_policies: ["Annulation gratuite jusqu’au 1 octobre. Après cette date, une nuit sera facturée."],
        }),
        before
      ).ok,
      true
    );
    assert.equal(
      freeLeCancellation(row({ cancellation_policies: ["Annulation sans frais."] }), before).ok,
      true
    );
  });

  it("refuse une réservation déjà annulée", () => {
    assert.equal(freeLeCancellation(row({ state: "cancelled" }), before).ok, false);
  });

  it("montre le bouton au titulaire seulement quand c’est gratuit", () => {
    const [offer] = clientHotelCancelOffers([hotel()], [row()], before);
    assert.equal(offer.mode, "free");
    if (offer.mode !== "free") return;
    assert.equal(offer.itemId, "item-1");
    assert.equal(offer.hotelName, "Nobu Hotel London");
    assert.equal(offer.untilLabel, "1 octobre 2026, 12:00");
    assert.match(clientCancelQuestion(offer), /Annulation gratuite jusqu’au 1 octobre 2026, 12:00/);
    assert.equal("leBookingId" in offer, false);
  });

  it("demande le conseiller quand la fenêtre est fermée", () => {
    const [offer] = clientHotelCancelOffers([hotel()], [row()], atLimit);
    assert.deepEqual(offer, { itemId: "item-1", mode: "advisor" });
    assert.equal(CLIENT_CANCEL_ADVISOR, "Contactez votre conseiller.");
  });

  it("ne choisit pas entre deux chambres du même hôtel", () => {
    const other = hotel({
      id: "item-2",
      confirmation_ref: "OTHER99",
      details: { hotel_name: "Nobu Hotel London", le_hotel_id: 9626 },
    });
    const second = row({
      id: "le-2",
      le_booking_id: 89,
      confirmation_number: "OTHER99",
    });
    const offers = clientHotelCancelOffers([hotel(), other], [row(), second], before);
    assert.deepEqual(
      offers.map((offer) => offer.mode),
      ["advisor", "advisor"]
    );
  });

  it("laisse un hôtel qui n’est pas Little Emperors sans message", () => {
    const plain = hotel({
      supplier: "Expedia",
      confirmation_ref: "73569007921656",
      details: { hotel_name: "Verdelago Resort" },
    });
    assert.deepEqual(clientHotelCancelOffers([plain], [row()], before), []);
  });

  it("demande le conseiller pour une carte Little Emperors sans ligne fiable", () => {
    const offers = clientHotelCancelOffers([hotel()], [], before);
    assert.deepEqual(offers, [{ itemId: "item-1", mode: "advisor" }]);
  });

  it("relit la réservation fraîche avant d’autoriser le DELETE", () => {
    const opened = decideClientLeCancel({
      item: hotel(),
      hotels: [hotel()],
      rows: [row()],
      fresh: [fresh()],
      now: before,
    });
    assert.equal(opened.ok, true);
    if (opened.ok) assert.equal(opened.leBookingId, 88);

    const closed = decideClientLeCancel({
      item: hotel(),
      hotels: [hotel()],
      rows: [row()],
      fresh: [fresh({ is_cancellable: false })],
      now: before,
    });
    assert.equal(closed.ok, false);

    const missing = decideClientLeCancel({
      item: hotel(),
      hotels: [hotel()],
      rows: [row()],
      fresh: [],
      now: before,
    });
    assert.equal(missing.ok, false);
  });

  it("refuse si la relecture ne correspond plus à la carte", () => {
    const drifted = decideClientLeCancel({
      item: hotel(),
      hotels: [hotel()],
      rows: [row()],
      fresh: [fresh({ hotel_id: 1, confirmation_number: "AUTRE", hotel_name: "Autre hôtel", check_in: "2026-12-01", check_out: "2026-12-02" })],
      now: before,
    });
    assert.equal(drifted.ok, false);
  });
});

describe("annulation client, après la relecture", () => {
  const item = hotel();

  function harness(patch: Partial<Parameters<typeof runClientLeCancel>[1]> = {}) {
    const calls: string[] = [];
    const deps: Parameters<typeof runClientLeCancel>[1] = {
      now: before,
      loadRows: async () => [row()],
      listBookings: async () => [fresh()],
      deleteBooking: async (id) => {
        calls.push(`delete:${id}`);
      },
      cancelCard: async () => {
        calls.push("card");
      },
      appendTrace: async (note) => {
        calls.push(`trace:${note}`);
      },
      markCancelled: async (rowId, lastError) => {
        calls.push(`le:${rowId}:${lastError || "ok"}`);
      },
      notifyAgency: async () => {
        calls.push("mail");
      },
      ...patch,
    };
    return { calls, deps };
  }

  it("n’appelle pas DELETE si ce n’est plus gratuit", async () => {
    const { calls, deps } = harness({
      listBookings: async () => [fresh({ is_cancellable: false })],
    });
    const result = await runClientLeCancel({ item, hotels: [item] }, deps);
    assert.equal(result.ok, false);
    assert.equal(result.sent, false);
    if (!result.ok) assert.equal(result.message, CLIENT_CANCEL_REFUSED);
    assert.deepEqual(calls, []);
  });

  it("annule la carte seulement après le DELETE", async () => {
    const { calls, deps } = harness();
    const result = await runClientLeCancel({ item, hotels: [item] }, deps);
    assert.deepEqual(result, { ok: true, sent: true });
    assert.equal(calls[0], "delete:88");
    assert.equal(calls[1], "card");
    assert.match(calls[2], /^trace:Annulation gratuite par le client : Nobu Hotel London/);
    assert.equal(calls[3], "le:le-row:ok");
    assert.equal(calls[4], "mail");
  });

  it("ne touche pas au dossier si Little Emperors refuse", async () => {
    const { calls, deps } = harness({
      deleteBooking: async () => {
        throw new Error("upstream");
      },
    });
    const result = await runClientLeCancel({ item, hotels: [item] }, deps);
    assert.equal(result.sent, false);
    if (!result.ok) assert.equal(result.message, CLIENT_CANCEL_NOT_SENT);
    assert.deepEqual(calls, []);
  });

  it("prévient si l’hôtel a annulé mais la carte est restée", async () => {
    const { calls, deps } = harness({
      cancelCard: async () => {
        throw new Error("db");
      },
    });
    const result = await runClientLeCancel({ item, hotels: [item] }, deps);
    assert.equal(result.ok, false);
    assert.equal(result.sent, true);
    if (!result.ok) assert.equal(result.message, CLIENT_CANCEL_CARD_LAG);
    assert.equal(calls[0], "delete:88");
    assert.match(calls[2], /n’a pas été mise à jour/);
    assert.equal(calls[3], "mail");
  });

  it("écrit une alerte sans montant de frais", () => {
    const mail = buildClientLeCancelMail({
      to: "contact@travelba.fr",
      reference: "TB-2026-0100",
      bookingId: "4fabc2da-368c-4087-9733-dfe4e6f1da85",
      holderName: "Client",
      hotelName: "Nobu Hotel London",
      stayLabel: "3 nuits",
      untilLabel: "1 octobre 2026, 12:00",
      cardUpdated: true,
    });
    assert.ok(mail);
    assert.match(mail!.subject, /Annulation gratuite/);
    assert.match(mail!.text, /Nobu Hotel London/);
    assert.match(mail!.text, /sans frais/);
    assert.match(mail!.text, /Jusqu’au : 1 octobre 2026, 12:00/);
    assert.doesNotMatch(mail!.text, /\d+\s*€|EUR\s*\d+|frais de/i);
    assert.match(clientCancelTrace("Nobu Hotel London", "3 nuits", "1 octobre 2026, 12:00"), /jusqu’au 1 octobre 2026, 12:00/);
  });
});
