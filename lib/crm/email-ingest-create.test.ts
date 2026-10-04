import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IMPORT_AUTO_NOTE, IMPORT_CREATED_BOOKING_NOTES } from "./email-detach";
import {
  AUTO_CREATE_HOLDS,
  autoCreatePlan,
  clientEmailForAutoCreate,
  isSupplierCustomerEmail,
  runEmailAutoCreate,
  type AutoCreateHandlers,
} from "./email-ingest-create";
import { decideEmailIngestAction } from "./email-match";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";

function stay(patch: Partial<BookingExtract> = {}): BookingExtract {
  return {
    ...emptyBookingExtract(),
    document_status: "confirmed",
    destination: "Lisbonne",
    start_date: "2026-11-02",
    end_date: "2026-11-05",
    customer_first_name: "Léa",
    customer_last_name: "Bernard",
    customer_email: "lea.bernard@example.com",
    items: [
      {
        kind: "hotel",
        title: "Memmo Alfama",
        supplier: null,
        confirmation_ref: "LE-100",
        start_at: "2026-11-02",
        end_at: "2026-11-05",
        amount: null,
        details: {},
      },
    ],
    ...patch,
  };
}

function handlers(overrides: Partial<AutoCreateHandlers> = {}): AutoCreateHandlers & {
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    findCustomerByEmail: async () => null,
    createCustomer: async (input) => {
      calls.push(`customer:${input.email}`);
      return "c-new";
    },
    persist: async (customerId) => {
      calls.push(`persist:${customerId}`);
      return { id: "b-new" };
    },
    markCreated: async (bookingId, customerId) => {
      calls.push(`mark:${bookingId}:${customerId}`);
    },
    hold: async (message) => {
      calls.push(`hold:${message}`);
    },
    fail: async (message) => {
      calls.push(`fail:${message}`);
    },
    ...overrides,
  };
}

describe("clientEmailForAutoCreate", () => {
  it("refuse l’agence, le fournisseur et l’expéditeur du mail", () => {
    assert.equal(clientEmailForAutoCreate("contact@travelba.fr", null), null);
    assert.equal(isSupplierCustomerEmail("bookings@littleemperors.com"), true);
    assert.equal(clientEmailForAutoCreate("bookings@littleemperors.com", null), null);
    assert.equal(clientEmailForAutoCreate("guest@expedia.com", "other@expedia.com"), null);
    assert.equal(
      clientEmailForAutoCreate("lea.bernard@example.com", "lea.bernard@example.com"),
      null
    );
    assert.equal(
      clientEmailForAutoCreate("lea.bernard@example.com", "bookings@littleemperors.com"),
      "lea.bernard@example.com"
    );
  });
});

describe("autoCreatePlan", () => {
  it("crée la fiche puis le dossier quand aucun client n’est reconnu", () => {
    const extract = stay();
    const decision = decideEmailIngestAction({
      extract,
      suggestedCustomerId: null,
      suggestedBookingId: null,
      candidates: [],
    });
    assert.deepEqual(
      autoCreatePlan({ extract, decision, fromEmail: "bookings@littleemperors.com" }),
      {
        plan: {
          kind: "create_customer",
          firstName: "Léa",
          lastName: "Bernard",
          email: "lea.bernard@example.com",
        },
        hold: null,
        message: null,
      }
    );
  });

  it("crée le dossier sur un client déjà reconnu", () => {
    const extract = stay({ customer_email: "" });
    const decision = decideEmailIngestAction({
      extract,
      suggestedCustomerId: "c1",
      suggestedBookingId: null,
      candidates: [],
    });
    assert.equal(decision.kind, "create");
    assert.deepEqual(autoCreatePlan({ extract, decision }).plan, {
      kind: "create",
      customerId: "c1",
    });
  });

  it("ne crée rien sur un devis, une annulation, un voyage déjà reconnu ou un extrait mince", () => {
    const quote = stay({ document_status: "quote" });
    const quoteDecision = decideEmailIngestAction({
      extract: quote,
      suggestedCustomerId: "c1",
      suggestedBookingId: null,
      candidates: [],
    });
    assert.equal(autoCreatePlan({ extract: quote, decision: quoteDecision }).hold, "quote");

    const cancelled = stay({ document_status: "cancelled" });
    const cancelDecision = decideEmailIngestAction({
      extract: cancelled,
      suggestedCustomerId: null,
      suggestedBookingId: null,
      candidates: [],
    });
    assert.equal(autoCreatePlan({ extract: cancelled, decision: cancelDecision }).hold, "cancellation");

    const known = stay();
    const apply = decideEmailIngestAction({
      extract: known,
      suggestedCustomerId: "c1",
      suggestedBookingId: "b1",
      candidates: [
        { customer_id: "c1", booking_id: "b1", label: "TB-1", reason: "Référence", score: 100 },
      ],
    });
    assert.equal(autoCreatePlan({ extract: known, decision: apply }).hold, "apply");

    const thin = stay({ items: [], start_date: "", end_date: "" });
    const thinDecision = decideEmailIngestAction({
      extract: thin,
      suggestedCustomerId: "c1",
      suggestedBookingId: null,
      candidates: [],
    });
    assert.equal(autoCreatePlan({ extract: thin, decision: thinDecision }).message, AUTO_CREATE_HOLDS.thin);
  });

  it("laisse la fiche en attente sans e-mail client", () => {
    const extract = stay({ customer_email: "contact@travelba.fr" });
    const decision = decideEmailIngestAction({
      extract,
      suggestedCustomerId: null,
      suggestedBookingId: null,
      candidates: [],
    });
    const outcome = autoCreatePlan({ extract, decision, fromEmail: "bookings@littleemperors.com" });
    assert.equal(outcome.hold, "missing_email");
    assert.equal(outcome.plan, null);
  });
});

describe("runEmailAutoCreate", () => {
  it("crée le compte puis le dossier, sans invitation", async () => {
    const used = handlers();
    const result = await runEmailAutoCreate(
      {
        status: "parsed",
        from_email: "bookings@littleemperors.com",
        extract: stay(),
        suggested_customer_id: null,
        suggested_booking_id: null,
        candidates: [],
      },
      used
    );
    assert.equal(result.created, true);
    assert.deepEqual(used.calls, [
      "customer:lea.bernard@example.com",
      "persist:c-new",
      "mark:b-new:c-new",
    ]);
  });

  it("réutilise la fiche qui a déjà cet e-mail", async () => {
    const used = handlers({
      findCustomerByEmail: async () => "c-existing",
      createCustomer: async () => {
        throw new Error("createCustomer ne doit pas être appelé");
      },
    });
    const result = await runEmailAutoCreate(
      {
        status: "parsed",
        from_email: "bookings@littleemperors.com",
        extract: stay(),
      },
      used
    );
    assert.deepEqual(result, { created: true, bookingId: "b-new", hold: null });
    assert.deepEqual(used.calls, ["persist:c-existing", "mark:b-new:c-existing"]);
  });

  it("ne crée pas un second dossier si le voyage est déjà reconnu", async () => {
    const used = handlers();
    const result = await runEmailAutoCreate(
      {
        status: "matched",
        from_email: "bookings@littleemperors.com",
        extract: stay(),
        suggested_customer_id: "c1",
        suggested_booking_id: "b1",
        candidates: [
          { customer_id: "c1", booking_id: "b1", label: "TB-1", reason: "Référence", score: 100 },
        ],
      },
      used
    );
    assert.equal(result.created, false);
    assert.equal(result.hold, "apply");
    assert.deepEqual(used.calls, []);
  });

  it("ignore un mail déjà traité", async () => {
    const used = handlers();
    const result = await runEmailAutoCreate(
      {
        status: "attached",
        created_booking_id: "b-done",
        extract: stay(),
      },
      used
    );
    assert.deepEqual(result, { created: false, bookingId: "b-done", hold: null });
    assert.deepEqual(used.calls, []);
  });

  it("note l’échec sans marquer le dossier créé", async () => {
    const used = handlers({
      persist: async () => {
        throw new Error("Création du dossier impossible.");
      },
    });
    const result = await runEmailAutoCreate(
      {
        status: "matched",
        from_email: "bookings@littleemperors.com",
        extract: stay({ customer_email: "" }),
        suggested_customer_id: "c1",
        suggested_booking_id: null,
        candidates: [],
      },
      used
    );
    assert.equal(result.created, false);
    assert.deepEqual(used.calls, ["fail:Création du dossier impossible."]);
  });
});

describe("note de dossier automatique", () => {
  it("reste détachable comme les autres dossiers créés par import", () => {
    assert.equal(IMPORT_CREATED_BOOKING_NOTES.includes(IMPORT_AUTO_NOTE), true);
  });
});
