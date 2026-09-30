import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_DETACH_MARGIN_MS,
  IMPORT_DOCUMENTS_NOTE,
  attachedEmailLabel,
  planEmailDetach,
  type EmailDetachInput,
} from "./email-detach";

const ATTACHED = "2026-09-30T12:00:00.000Z";
const DURING = new Date(Date.parse(ATTACHED) - 30_000).toISOString();
const BEFORE = new Date(Date.parse(ATTACHED) - EMAIL_DETACH_MARGIN_MS - 60_000).toISOString();

function input(patch: Partial<EmailDetachInput> = {}): EmailDetachInput {
  return {
    emailId: "mail-1",
    bookingId: "book-1",
    attachedAt: ATTACHED,
    suggestedCustomerId: "cust-1",
    extractItems: [
      {
        kind: "hotel",
        title: "Andaz Papagayo",
        confirmation_ref: "97620170",
        start_at: "2026-11-02",
        details: { hotel_name: "Andaz Papagayo" },
      },
    ],
    extractTravelers: [{ first_name: "Inès", last_name: "Martin" }],
    attachmentNames: ["confirmation.pdf"],
    items: [
      {
        id: "item-1",
        kind: "hotel",
        title: "Andaz Papagayo",
        confirmation_ref: "97620170",
        start_at: "2026-11-02",
        created_at: DURING,
        source_document_id: "doc-1",
        details: { hotel_name: "Andaz Papagayo" },
      },
    ],
    documents: [
      {
        id: "doc-1",
        file_name: "confirmation.pdf",
        storage_path: "bookings/book-1/1-confirmation.pdf",
        booking_item_id: "item-1",
        created_at: DURING,
      },
    ],
    travelers: [
      { id: "trav-1", first_name: "Inès", last_name: "Martin", created_at: DURING },
    ],
    arrivals: [{ booking_item_id: "item-1", status: "pending" }],
    booking: {
      status: "confirmed",
      visible_to_client: false,
      notes_internal: null,
    },
    ...patch,
  };
}

describe("planEmailDetach", () => {
  it("retire l’hôtel, la pièce et le voyageur créés avec le mail", () => {
    const plan = planEmailDetach(input());
    assert.equal(plan.blocked, false);
    assert.deepEqual(plan.itemIds, ["item-1"]);
    assert.deepEqual(plan.documentIds, ["doc-1"]);
    assert.deepEqual(plan.storagePaths, ["bookings/book-1/1-confirmation.pdf"]);
    assert.deepEqual(plan.travelerIds, ["trav-1"]);
    assert.equal(plan.nextStatus, "matched");
    assert.equal(plan.deleteBooking, false);
    assert.deepEqual(plan.keptItems, []);
  });

  it("laisse une carte déjà présente et remet le mail sans client suggéré", () => {
    const plan = planEmailDetach(
      input({
        suggestedCustomerId: null,
        items: [
          {
            id: "item-old",
            kind: "hotel",
            title: "Andaz",
            confirmation_ref: "97620170",
            start_at: "2026-11-02",
            created_at: BEFORE,
            details: {},
          },
        ],
        documents: [],
        travelers: [
          { id: "trav-old", first_name: "Inès", last_name: "Martin", created_at: BEFORE },
        ],
      })
    );
    assert.deepEqual(plan.itemIds, []);
    assert.deepEqual(plan.travelerIds, []);
    assert.equal(plan.keptItems[0]?.title, "Andaz");
    assert.equal(plan.nextStatus, "parsed");
    assert.equal(plan.deleteBooking, false);
  });

  it("refuse si l’arrivée n’est plus en attente", () => {
    const plan = planEmailDetach(
      input({
        arrivals: [{ booking_item_id: "item-1", status: "paid" }],
      })
    );
    assert.equal(plan.blocked, true);
    assert.match(plan.message || "", /Rien n’a été retiré/);
    assert.deepEqual(plan.itemIds, []);
    assert.equal(plan.deleteBooking, false);
  });

  it("supprime le brouillon créé par le mail quand il ne reste rien", () => {
    const plan = planEmailDetach(
      input({
        booking: {
          status: "draft",
          visible_to_client: false,
          notes_internal: IMPORT_DOCUMENTS_NOTE,
        },
      })
    );
    assert.equal(plan.deleteBooking, true);
  });

  it("garde un dossier confirmé, visible, ou qui a d’autres cartes", () => {
    const confirmed = planEmailDetach(
      input({
        booking: {
          status: "confirmed",
          visible_to_client: false,
          notes_internal: IMPORT_DOCUMENTS_NOTE,
        },
      })
    );
    const visible = planEmailDetach(
      input({
        booking: {
          status: "draft",
          visible_to_client: true,
          notes_internal: IMPORT_DOCUMENTS_NOTE,
        },
      })
    );
    const otherCard = planEmailDetach(
      input({
        items: [
          {
            id: "item-1",
            kind: "hotel",
            title: "Andaz Papagayo",
            confirmation_ref: "97620170",
            created_at: DURING,
            details: {},
          },
          {
            id: "item-flight",
            kind: "flight",
            title: "AF 123",
            confirmation_ref: "ABC123",
            start_at: "2026-11-02T10:00:00Z",
            created_at: BEFORE,
            details: { flight_number: "AF123" },
          },
        ],
        booking: {
          status: "draft",
          visible_to_client: false,
          notes_internal: IMPORT_DOCUMENTS_NOTE,
        },
      })
    );
    assert.equal(confirmed.deleteBooking, false);
    assert.equal(visible.deleteBooking, false);
    assert.equal(otherCard.deleteBooking, false);
    assert.deepEqual(otherCard.itemIds, ["item-1"]);
  });

  it("retire une carte tamponnée même hors de la marge, pas celle d’un autre mail", () => {
    const plan = planEmailDetach(
      input({
        items: [
          {
            id: "item-stamped",
            kind: "hotel",
            title: "Andaz Papagayo",
            confirmation_ref: "97620170",
            created_at: BEFORE,
            details: { email_ingest_id: "mail-1" },
          },
          {
            id: "item-other",
            kind: "activity",
            title: "Spa",
            confirmation_ref: "SPA1",
            start_at: "2026-11-03",
            created_at: DURING,
            details: { email_ingest_id: "mail-2" },
          },
        ],
        extractItems: [
          {
            kind: "hotel",
            title: "Andaz Papagayo",
            confirmation_ref: "97620170",
          },
          {
            kind: "activity",
            title: "Spa",
            confirmation_ref: "SPA1",
            start_at: "2026-11-03",
          },
        ],
      })
    );
    assert.deepEqual(plan.itemIds, ["item-stamped"]);
    assert.equal(plan.keptItems[0]?.id, "item-other");
  });

  it("ne supprime pas un original email-ingest ni une pièce d’une autre carte", () => {
    const plan = planEmailDetach(
      input({
        documents: [
          {
            id: "doc-origin",
            file_name: "confirmation.pdf",
            storage_path: "email-ingest/mail-1/confirmation.pdf",
            created_at: DURING,
          },
          {
            id: "doc-other",
            file_name: "confirmation.pdf",
            storage_path: "bookings/book-1/other.pdf",
            booking_item_id: "item-flight",
            created_at: DURING,
          },
          {
            id: "doc-copy",
            file_name: "Confirmation.PDF",
            storage_path: "bookings/book-1/copy.pdf",
            created_at: DURING,
          },
        ],
        items: [
          {
            id: "item-1",
            kind: "hotel",
            title: "Andaz Papagayo",
            confirmation_ref: "97620170",
            created_at: DURING,
            details: {},
          },
          {
            id: "item-flight",
            kind: "flight",
            title: "AF 123",
            confirmation_ref: "ABC123",
            start_at: "2026-11-02T10:00:00Z",
            created_at: BEFORE,
            details: { flight_number: "AF123" },
          },
        ],
      })
    );
    assert.deepEqual(plan.documentIds, ["doc-copy"]);
    assert.deepEqual(plan.storagePaths, ["bookings/book-1/copy.pdf"]);
  });

  it("ne supprime pas le brouillon s’il reste un règlement client", () => {
    const plan = planEmailDetach(
      input({
        hasPostedCredit: true,
        booking: {
          status: "draft",
          visible_to_client: false,
          notes_internal: IMPORT_DOCUMENTS_NOTE,
        },
      })
    );
    assert.equal(plan.deleteBooking, false);
    assert.deepEqual(plan.itemIds, ["item-1"]);
  });
});

describe("attachedEmailLabel", () => {
  it("préfère le nom de l’hôtel", () => {
    assert.equal(
      attachedEmailLabel({
        subject: "Your booking",
        extract: { items: [{ kind: "hotel", title: "Andaz Papagayo" }] },
      }),
      "Andaz Papagayo"
    );
    assert.equal(attachedEmailLabel({ subject: "Your booking" }), "Your booking");
  });
});
