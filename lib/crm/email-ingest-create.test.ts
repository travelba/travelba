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
import { SAME_DESTINATION_CANCELLED_REASON, SAME_DESTINATION_REASON, decideEmailIngestAction } from "./email-match";
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

  it("ne crée pas un deuxième dossier vers la même destination, même annulée", () => {
    const extract = stay({ destination: "Rome", start_date: "2026-08-01", end_date: "2026-08-04" });
    const decision = decideEmailIngestAction({
      extract,
      suggestedCustomerId: "c1",
      suggestedBookingId: "b-old",
      candidates: [
        {
          customer_id: "c1",
          booking_id: "b-old",
          label: "TB-0 — Rome",
          reason: SAME_DESTINATION_CANCELLED_REASON,
          score: 78,
        },
      ],
    });
    const outcome = autoCreatePlan({ extract, decision, candidates: decision.kind === "apply" ? [
      {
        customer_id: "c1",
        booking_id: "b-old",
        label: "TB-0 — Rome",
        reason: SAME_DESTINATION_CANCELLED_REASON,
        score: 78,
      },
    ] : [] });
    assert.equal(outcome.plan, null);
    assert.equal(outcome.hold, "same_stay");
    assert.equal(outcome.message, AUTO_CREATE_HOLDS.same_stay);

    const otherCity = autoCreatePlan({
      extract: stay({ destination: "Lisbonne" }),
      decision: decideEmailIngestAction({
        extract: stay({ destination: "Lisbonne", customer_email: "" }),
        suggestedCustomerId: "c1",
        suggestedBookingId: null,
        candidates: [],
      }),
    });
    assert.equal(otherCity.plan && otherCity.plan.kind, "create");
    assert.equal(SAME_DESTINATION_REASON.length > 0, true);
  });

  it("met à jour seul le séjour de Marie quand le rapprochement est unique", () => {
    const hotel = {
      id: "h1",
      kind: "hotel",
      title: "Hôtel de Russie",
      confirmation_ref: "97620170",
      start_at: "2026-06-12",
      end_at: "2026-06-15",
      amount: 2400,
      include_in_ledger: true,
      lifecycle: "active",
    };
    const rome = {
      customer_id: "marie",
      booking_id: "b-rome",
      label: "TB-1 — Rome",
      reason: "Référence fournisseur",
      score: 90,
    };
    const sameRef = stay({
      destination: "Rome",
      start_date: "2026-06-13",
      end_date: "2026-06-16",
      customer_first_name: "Marie",
      customer_last_name: "Dupont",
      items: [
        {
          kind: "hotel",
          title: "Hôtel de Russie",
          supplier: null,
          confirmation_ref: "97620170",
          start_at: "2026-06-13",
          end_at: "2026-06-16",
          amount: 1800,
          details: {},
        },
      ],
    });
    const updated = autoCreatePlan({
      extract: sameRef,
      decision: decideEmailIngestAction({
        extract: sameRef,
        suggestedCustomerId: "marie",
        suggestedBookingId: "b-rome",
        candidates: [rome],
      }),
      candidates: [rome],
      items: [hotel],
    });
    assert.deepEqual(updated.plan, {
      kind: "apply_stay",
      bookingId: "b-rome",
      customerId: "marie",
      gesture: "replace",
    });

    const replaced = stay({
      destination: "Rome",
      start_date: "2026-06-20",
      end_date: "2026-06-23",
      items: [
        {
          kind: "hotel",
          title: "Hotel Eden",
          supplier: null,
          confirmation_ref: "97620888",
          start_at: "2026-06-20",
          end_at: "2026-06-23",
          amount: 900,
          details: {},
        },
      ],
    });
    const cancelledStay = {
      ...rome,
      reason: SAME_DESTINATION_CANCELLED_REASON,
      score: 78,
    };
    const reopen = autoCreatePlan({
      extract: replaced,
      decision: decideEmailIngestAction({
        extract: replaced,
        suggestedCustomerId: "marie",
        suggestedBookingId: "b-rome",
        candidates: [cancelledStay],
      }),
      candidates: [cancelledStay],
      items: [{ ...hotel, lifecycle: "cancelled" }],
    });
    assert.deepEqual(reopen.plan, {
      kind: "apply_stay",
      bookingId: "b-rome",
      customerId: "marie",
      gesture: "replace",
    });

    const cancelHotel = stay({
      document_status: "cancelled",
      destination: "Rome",
      items: [
        {
          kind: "hotel",
          title: "Hôtel de Russie",
          supplier: null,
          confirmation_ref: "97620170",
          start_at: "2026-06-12",
          end_at: "2026-06-15",
          amount: null,
          details: {},
        },
      ],
    });
    const cancelled = autoCreatePlan({
      extract: cancelHotel,
      decision: decideEmailIngestAction({
        extract: cancelHotel,
        suggestedCustomerId: "marie",
        suggestedBookingId: "b-rome",
        candidates: [rome],
      }),
      candidates: [rome],
      items: [hotel],
    });
    assert.equal(cancelled.plan && cancelled.plan.kind === "apply_stay" && cancelled.plan.gesture, "cancel");
  });

  it("laisse dans la file une annulation sans référence ou deux séjours Rome", () => {
    const hotel = {
      id: "h1",
      kind: "hotel",
      title: "Hôtel de Russie",
      confirmation_ref: "97620170",
      amount: 2400,
      lifecycle: "active",
    };
    const flight = {
      id: "f1",
      kind: "flight",
      title: "Paris → Rome",
      confirmation_ref: "AF1234",
      start_at: "2026-06-12",
      lifecycle: "active",
    };
    const rome = {
      customer_id: "marie",
      booking_id: "b-rome",
      label: "TB-1 — Rome",
      reason: "Référence fournisseur",
      score: 90,
    };
    const unnamed = stay({
      document_status: "cancelled",
      destination: "Rome",
      items: [
        {
          kind: "hotel",
          title: "Séjour",
          supplier: null,
          confirmation_ref: null,
          start_at: "2026-06-12",
          end_at: "2026-06-15",
          amount: null,
          details: {},
        },
      ],
    });
    const choice = autoCreatePlan({
      extract: unnamed,
      decision: decideEmailIngestAction({
        extract: unnamed,
        suggestedCustomerId: "marie",
        suggestedBookingId: "b-rome",
        candidates: [rome],
      }),
      candidates: [rome],
      items: [hotel, flight],
    });
    assert.equal(choice.plan, null);
    assert.equal(choice.hold, "cancellation");

    const second = stay({ destination: "Rome", start_date: "2026-09-01", end_date: "2026-09-04" });
    const twoStays = [
      {
        customer_id: "marie",
        booking_id: "b-june",
        label: "TB-1 — Rome",
        reason: SAME_DESTINATION_REASON,
        score: 80,
      },
      {
        customer_id: "marie",
        booking_id: "b-sept",
        label: "TB-2 — Rome",
        reason: SAME_DESTINATION_REASON,
        score: 80,
      },
    ];
    const ambiguous = autoCreatePlan({
      extract: second,
      decision: decideEmailIngestAction({
        extract: second,
        suggestedCustomerId: "marie",
        suggestedBookingId: null,
        candidates: twoStays,
      }),
      candidates: twoStays,
      items: [hotel],
    });
    assert.equal(ambiguous.plan, null);
    assert.equal(ambiguous.hold, "same_stay");

    const otherHotel = stay({
      destination: "Rome",
      items: [
        {
          kind: "hotel",
          title: "Hotel Eden",
          supplier: null,
          confirmation_ref: "97620888",
          start_at: "2026-06-20",
          end_at: "2026-06-23",
          amount: 900,
          details: {},
        },
      ],
    });
    const twoHotels = autoCreatePlan({
      extract: otherHotel,
      decision: decideEmailIngestAction({
        extract: otherHotel,
        suggestedCustomerId: "marie",
        suggestedBookingId: "b-rome",
        candidates: [
          {
            customer_id: "marie",
            booking_id: "b-rome",
            label: "TB-1 — Rome",
            reason: SAME_DESTINATION_REASON,
            score: 80,
          },
        ],
      }),
      candidates: [
        {
          customer_id: "marie",
          booking_id: "b-rome",
          label: "TB-1 — Rome",
          reason: SAME_DESTINATION_REASON,
          score: 80,
        },
      ],
      items: [hotel, { ...hotel, id: "h2", title: "Hotel Eden", confirmation_ref: "97620171" }],
    });
    assert.equal(twoHotels.plan, null);
    assert.equal(twoHotels.hold, "same_stay");
  });

  it("crée la fiche sans e-mail quand le nom et le séjour sont là", () => {
    const extract = stay({ customer_email: "contact@travelba.fr" });
    const decision = decideEmailIngestAction({
      extract,
      suggestedCustomerId: null,
      suggestedBookingId: null,
      candidates: [],
    });
    const outcome = autoCreatePlan({ extract, decision, fromEmail: "bookings@littleemperors.com" });
    assert.deepEqual(outcome.plan, {
      kind: "create_customer",
      firstName: "Léa",
      lastName: "Bernard",
      email: null,
    });
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
    assert.deepEqual(result, { created: true, applied: false, bookingId: "b-new", hold: null });
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
    assert.deepEqual(result, { created: false, applied: false, bookingId: "b-done", hold: null });
    assert.deepEqual(used.calls, []);
  });

  it("applique le mail de Marie sur le séjour reconnu, sans créer de dossier", async () => {
    const used = handlers({
      loadItems: async () => [
        {
          id: "h1",
          kind: "hotel",
          title: "Hôtel de Russie",
          confirmation_ref: "97620170",
          start_at: "2026-06-12",
          end_at: "2026-06-15",
          amount: 2400,
          include_in_ledger: true,
        },
      ],
      applyStay: async (input) => {
        used.calls.push(`apply:${input.gesture}:${input.bookingId}`);
      },
      markApplied: async (bookingId, customerId) => {
        used.calls.push(`applied:${bookingId}:${customerId}`);
      },
    });
    const extract = stay({
      destination: "Rome",
      start_date: "2026-06-13",
      end_date: "2026-06-16",
      items: [
        {
          kind: "hotel",
          title: "Hôtel de Russie",
          supplier: null,
          confirmation_ref: "97620170",
          start_at: "2026-06-13",
          end_at: "2026-06-16",
          amount: 1800,
          details: {},
        },
      ],
    });
    const result = await runEmailAutoCreate(
      {
        status: "matched",
        from_email: "bookings@littleemperors.com",
        extract,
        suggested_customer_id: "marie",
        suggested_booking_id: "b-rome",
        candidates: [
          {
            customer_id: "marie",
            booking_id: "b-rome",
            label: "TB-1 — Rome",
            reason: "Référence fournisseur",
            score: 90,
          },
        ],
      },
      used
    );
    assert.deepEqual(result, { created: false, applied: true, bookingId: "b-rome", hold: null });
    assert.deepEqual(used.calls, ["apply:replace:b-rome", "applied:b-rome:marie"]);
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
