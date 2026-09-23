import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";
import {
  cancellationApplyPlan,
  decideEmailIngestAction,
  destinationsOverlap,
  executeEmailIngestDecision,
  extractReferences,
  lastNamesClose,
  mergeBookingSuggestions,
  referenceTokens,
  suggestBookingByReference,
  suggestBookingByTripSignals,
  suggestCustomerFromExtract,
  usableCustomerEmail,
} from "./email-match";
import { detectCancellationDocument, isCancellationExtract } from "./ingest-types";

type Cust = {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string | null;
  email: string;
};

const customers: Cust[] = [
  { id: "c1", first_name: "Jean", last_name: "Martin", company_name: null, email: "jean.martin@example.com" },
  { id: "c2", first_name: "Marie", last_name: "Dupont", company_name: null, email: "marie@example.com" },
  { id: "c3", first_name: "Paul", last_name: "Dupont", company_name: null, email: "paul@example.com" },
];

function extractWith(patch: Partial<BookingExtract>): BookingExtract {
  return { ...emptyBookingExtract(), ...patch };
}

describe("suggestCustomerFromExtract", () => {
  it("rapproche par e-mail exact", () => {
    const res = suggestCustomerFromExtract(
      customers,
      extractWith({ customer_email: "JEAN.MARTIN@example.com" })
    );
    assert.equal(res.autoCustomerId, "c1");
  });

  it("rapproche par nom + prénom uniques", () => {
    const res = suggestCustomerFromExtract(
      customers,
      extractWith({ customer_first_name: "Jean", customer_last_name: "Martin" })
    );
    assert.equal(res.autoCustomerId, "c1");
  });

  it("ne rapproche pas automatiquement un nom de famille ambigu", () => {
    const res = suggestCustomerFromExtract(
      customers,
      extractWith({ customer_last_name: "Dupont" })
    );
    assert.equal(res.autoCustomerId, null);
    const ids = res.candidates.map((c) => c.customer_id).sort();
    assert.deepEqual(ids, ["c2", "c3"]);
  });

  it("renvoie null sans indice d'identification", () => {
    const res = suggestCustomerFromExtract(customers, extractWith({}));
    assert.equal(res.autoCustomerId, null);
    assert.equal(res.candidates.length, 0);
  });
});

describe("referenceTokens / extractReferences", () => {
  it("découpe et normalise les références composites", () => {
    assert.deepEqual(referenceTokens("97620170;97620172"), ["97620170", "97620172"]);
    assert.deepEqual(referenceTokens("ab"), []); // trop court
  });

  it("collecte les références des items", () => {
    const extract = extractWith({
      items: [
        {
          kind: "hotel",
          title: "Hôtel",
          supplier: null,
          confirmation_ref: "TB-2026-0017",
          start_at: null,
          end_at: null,
          amount: null,
          details: {},
        },
      ],
    });
    const refs = extractReferences(extract);
    assert.ok(refs.has("tb20260017"));
  });
});

describe("suggestBookingByReference", () => {
  const bookings = [
    { id: "b1", reference: "TB-2026-0017", title: "Marrakech", destination: "Marrakech" },
    { id: "b2", reference: "TB-2026-0099", title: "Rome", destination: "Rome" },
  ];

  it("rapproche par référence dossier", () => {
    const extract = extractWith({
      items: [
        {
          kind: "hotel",
          title: "Hôtel",
          supplier: null,
          confirmation_ref: "TB-2026-0017",
          start_at: null,
          end_at: null,
          amount: null,
          details: {},
        },
      ],
    });
    const res = suggestBookingByReference(extract, bookings, new Map());
    assert.equal(res.autoBookingId, "b1");
    assert.equal(res.candidates[0].reason, "Référence dossier");
  });

  it("rapproche par confirmation_ref fournisseur d'un item existant", () => {
    const extract = extractWith({
      items: [
        {
          kind: "hotel",
          title: "Hôtel",
          supplier: null,
          confirmation_ref: "97620170",
          start_at: null,
          end_at: null,
          amount: null,
          details: {},
        },
      ],
    });
    const itemsByBooking = new Map([
      ["b2", [{ confirmation_ref: "97620170" }]],
    ]);
    const res = suggestBookingByReference(extract, bookings, itemsByBooking);
    assert.equal(res.autoBookingId, "b2");
    assert.equal(res.candidates[0].reason, "Référence fournisseur");
  });

  it("ne suggère rien sans référence connue", () => {
    const extract = extractWith({
      items: [
        {
          kind: "hotel",
          title: "Hôtel",
          supplier: null,
          confirmation_ref: "ZZZZZZ",
          start_at: null,
          end_at: null,
          amount: null,
          details: {},
        },
      ],
    });
    const res = suggestBookingByReference(extract, bookings, new Map());
    assert.equal(res.autoBookingId, null);
    assert.equal(res.candidates.length, 0);
  });
});

function hotelItem(patch: {
  title?: string;
  confirmation_ref?: string;
  start_at?: string;
  end_at?: string;
  city?: string;
}) {
  return {
    kind: "hotel" as const,
    title: patch.title || "Hôtel",
    supplier: null,
    confirmation_ref: patch.confirmation_ref ?? null,
    start_at: patch.start_at ?? null,
    end_at: patch.end_at ?? null,
    amount: null,
    details: patch.city ? { city: patch.city } : {},
  };
}

describe("lastNamesClose / destinationsOverlap", () => {
  it("rapproche Albilla et Albilila (une lettre)", () => {
    assert.equal(lastNamesClose("Albilla", "Albilila"), true);
    assert.equal(lastNamesClose("Martin", "Dupont"), false);
  });

  it("normalise destination ville / hôtel / accents", () => {
    assert.equal(destinationsOverlap("Tel Aviv", "tel aviv"), true);
    assert.equal(destinationsOverlap("Dan Tel Aviv Hotel", "Tel Aviv"), true);
    assert.equal(destinationsOverlap("Tel Aviv", "Avoriaz"), false);
  });
});

describe("suggestCustomerFromExtract — nom approchant", () => {
  const household = [
    ...customers,
    {
      id: "c-alb",
      first_name: "Simon, Iony",
      last_name: "Albilila",
      company_name: null,
      email: "client.alb@example.com",
    },
  ];

  it("rapproche Albilla / Albilila quand le prénom s’aligne", () => {
    const res = suggestCustomerFromExtract(
      household,
      extractWith({
        customer_first_name: "Simon",
        customer_last_name: "Albilla",
        travelers: [
          { first_name: "Simon", last_name: "Albilla" },
          { first_name: "Lisa", last_name: "Garnek" },
        ],
      })
    );
    assert.equal(res.autoCustomerId, "c-alb");
    assert.match(res.candidates[0].reason, /approchant|prénom/i);
  });
});

describe("suggestBookingByTripSignals", () => {
  const people = [
    {
      id: "c-alb",
      first_name: "Simon, Iony",
      last_name: "Albilila",
      company_name: null,
      email: "client.alb@example.com",
    },
  ];
  const telAviv = {
    id: "b-tlv",
    customer_id: "c-alb",
    reference: "TB-2026-0033",
    title: "Tel Aviv",
    destination: "Tel Aviv",
    start_date: "2026-12-14",
    end_date: "2026-12-23",
    status: "confirmed",
  };
  const avoriaz = {
    id: "b-avo",
    customer_id: "c-alb",
    reference: "TB-2026-0028",
    title: "Avoriaz",
    destination: "Avoriaz",
    start_date: "2027-03-20",
    end_date: "2027-03-27",
    status: "confirmed",
  };

  const telAvivExtract = extractWith({
    customer_first_name: "Simon",
    customer_last_name: "Albilla",
    destination: "Tel Aviv",
    start_date: "2026-12-14",
    end_date: "2026-12-23",
    travelers: [
      { first_name: "Simon", last_name: "Albilla" },
      { first_name: "Lisa", last_name: "Garnek" },
    ],
    items: [
      hotelItem({
        title: "Dan Tel Aviv Hotel",
        confirmation_ref: "38181SH005103",
        start_at: "2026-12-14",
        end_at: "2026-12-23",
        city: "Tel Aviv",
      }),
    ],
  });

  it("dates + destination + nom flou → voyage unique", () => {
    const res = suggestBookingByTripSignals(telAvivExtract, [telAviv, avoriaz], people);
    assert.equal(res.autoBookingId, "b-tlv");
    assert.equal(res.candidates.length, 1);
    assert.equal(res.candidates[0].reason, "Nom, destination et dates");
  });

  it("deux voyages au même score → pas d’auto", () => {
    const twin = {
      ...telAviv,
      id: "b-tlv-2",
      reference: "TB-2026-0090",
    };
    const res = suggestBookingByTripSignals(telAvivExtract, [telAviv, twin], people);
    assert.equal(res.autoBookingId, null);
    assert.equal(res.candidates.length, 2);
    assert.equal(res.candidates[0].score, res.candidates[1].score);
  });
});

describe("mergeBookingSuggestions + decideEmailIngestAction", () => {
  it("la référence dossier l’emporte sur les signaux de séjour", () => {
    const extract = extractWith({
      items: [hotelItem({ confirmation_ref: "TB-2026-0017" })],
    });
    const bookings = [
      {
        id: "b1",
        customer_id: "c1",
        reference: "TB-2026-0017",
        title: "Marrakech",
        destination: "Marrakech",
        start_date: "2026-08-01",
        end_date: "2026-08-08",
      },
    ];
    const merged = mergeBookingSuggestions(
      suggestBookingByReference(extract, bookings, new Map()),
      suggestBookingByTripSignals(extract, bookings, customers)
    );
    assert.equal(merged.autoBookingId, "b1");
    assert.equal(merged.candidates[0].reason, "Référence dossier");
  });

  it("voyage unique fort → apply", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({ destination: "Tel Aviv", start_date: "2026-12-14" }),
      suggestedCustomerId: "c-alb",
      suggestedBookingId: "b-tlv",
      candidates: [
        {
          customer_id: "c-alb",
          booking_id: "b-tlv",
          label: "TB-2026-0033 — Tel Aviv",
          reason: "Nom, destination et dates",
          score: 88,
        },
      ],
    });
    assert.deepEqual(decision, {
      kind: "apply",
      bookingId: "b-tlv",
      customerId: "c-alb",
    });
  });

  it("deux voyages forts égaux → review", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({ destination: "Tel Aviv" }),
      suggestedCustomerId: "c-alb",
      suggestedBookingId: null,
      candidates: [
        {
          customer_id: "c-alb",
          booking_id: "b1",
          label: "A",
          reason: "Nom, destination et dates",
          score: 88,
        },
        {
          customer_id: "c-alb",
          booking_id: "b2",
          label: "B",
          reason: "Nom, destination et dates",
          score: 88,
        },
      ],
    });
    assert.equal(decision.kind, "review");
  });

  it("client unique sans voyage → create", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({
        customer_first_name: "Jean",
        customer_last_name: "Martin",
        destination: "Rome",
        start_date: "2026-06-01",
      }),
      suggestedCustomerId: "c1",
      suggestedBookingId: null,
      candidates: [
        {
          customer_id: "c1",
          booking_id: null,
          label: "Jean Martin",
          reason: "Nom et prénom",
          score: 92,
        },
      ],
    });
    assert.deepEqual(decision, { kind: "create", customerId: "c1" });
  });

  it("aucun client → create_customer", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({
        customer_first_name: "Léa",
        customer_last_name: "Bernard",
        destination: "Lisbonne",
        customer_email: "lea.bernard@example.com",
      }),
      suggestedCustomerId: null,
      suggestedBookingId: null,
      candidates: [],
    });
    assert.deepEqual(decision, {
      kind: "create_customer",
      firstName: "Léa",
      lastName: "Bernard",
      email: "lea.bernard@example.com",
    });
  });

  it("ignore l’e-mail partagé de l’agence", () => {
    assert.equal(usableCustomerEmail("contact@travelba.fr"), null);
    const decision = decideEmailIngestAction({
      extract: extractWith({
        customer_first_name: "Léa",
        customer_last_name: "Bernard",
        destination: "Lisbonne",
        customer_email: "contact@travelba.fr",
      }),
      suggestedCustomerId: null,
      suggestedBookingId: null,
      candidates: [],
    });
    assert.equal(decision.kind, "create_customer");
    if (decision.kind === "create_customer") assert.equal(decision.email, null);
  });

  it("annulation + voyage unique → apply (pas de create)", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({
        document_status: "cancelled",
        destination: "Tel Aviv",
        start_date: "2026-12-14",
        customer_first_name: "Simon",
        customer_last_name: "Albilla",
      }),
      suggestedCustomerId: "c-alb",
      suggestedBookingId: "b-tlv",
      candidates: [
        {
          customer_id: "c-alb",
          booking_id: "b-tlv",
          label: "TB-2026-0033 — Tel Aviv",
          reason: "Nom, destination et dates",
          score: 88,
        },
      ],
    });
    assert.deepEqual(decision, {
      kind: "apply",
      bookingId: "b-tlv",
      customerId: "c-alb",
    });
  });

  it("annulation sans voyage → review (pas de create)", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({
        document_status: "cancelled",
        customer_first_name: "Léa",
        customer_last_name: "Bernard",
        destination: "Lisbonne",
        customer_email: "lea.bernard@example.com",
      }),
      suggestedCustomerId: "c-new",
      suggestedBookingId: null,
      candidates: [
        {
          customer_id: "c-new",
          booking_id: null,
          label: "Léa Bernard",
          reason: "Nom et prénom",
          score: 92,
        },
      ],
    });
    assert.equal(decision.kind, "review");
  });

  it("document d’identité → review", () => {
    const decision = decideEmailIngestAction({
      extract: extractWith({
        document_status: "identity",
        customer_first_name: "Jean",
        customer_last_name: "Martin",
      }),
      suggestedCustomerId: "c1",
      suggestedBookingId: null,
      candidates: [],
    });
    assert.equal(decision.kind, "review");
  });
});

describe("executeEmailIngestDecision", () => {
  it("applique un voyage existant", async () => {
    const calls: string[] = [];
    const result = await executeEmailIngestDecision(
      { kind: "apply", bookingId: "b-tlv", customerId: "c-alb" },
      {
        apply: async (bookingId, customerId) => {
          calls.push(`apply:${bookingId}:${customerId}`);
        },
        persist: async () => {
          throw new Error("persist ne doit pas être appelé");
        },
        createCustomer: async () => {
          throw new Error("createCustomer ne doit pas être appelé");
        },
      }
    );
    assert.deepEqual(result, { bookingId: "b-tlv", customerId: "c-alb" });
    assert.deepEqual(calls, ["apply:b-tlv:c-alb"]);
  });

  it("crée un dossier pour un client déjà connu", async () => {
    const result = await executeEmailIngestDecision(
      { kind: "create", customerId: "c1" },
      {
        apply: async () => {
          throw new Error("apply ne doit pas être appelé");
        },
        persist: async (customerId) => ({ id: `new-${customerId}` }),
        createCustomer: async () => {
          throw new Error("createCustomer ne doit pas être appelé");
        },
      }
    );
    assert.deepEqual(result, { bookingId: "new-c1", customerId: "c1" });
  });

  it("crée le client puis le dossier (persist mocké)", async () => {
    const created: string[] = [];
    const result = await executeEmailIngestDecision(
      {
        kind: "create_customer",
        firstName: "Léa",
        lastName: "Bernard",
        email: "lea.bernard@example.com",
      },
      {
        apply: async () => {
          throw new Error("apply ne doit pas être appelé");
        },
        persist: async (customerId) => {
          created.push(`persist:${customerId}`);
          return { id: "b-new" };
        },
        createCustomer: async (input) => {
          created.push(`customer:${input.firstName}:${input.lastName}:${input.email}`);
          return "c-new";
        },
      }
    );
    assert.deepEqual(result, { bookingId: "b-new", customerId: "c-new" });
    assert.deepEqual(created, [
      "customer:Léa:Bernard:lea.bernard@example.com",
      "persist:c-new",
    ]);
  });

  it("review → aucun persist", async () => {
    const result = await executeEmailIngestDecision(
      { kind: "review" },
      {
        apply: async () => {
          throw new Error("apply");
        },
        persist: async () => {
          throw new Error("persist");
        },
        createCustomer: async () => {
          throw new Error("create");
        },
      }
    );
    assert.equal(result, null);
  });
});

describe("annulation extract", () => {
  it("détecte un mail d’annulation, pas une politique", () => {
    assert.equal(detectCancellationDocument("Booking cancelled for Dan Tel Aviv Hotel"), true);
    assert.equal(detectCancellationDocument("Your reservation has been cancelled."), true);
    assert.equal(detectCancellationDocument("Annulation confirmée — réservation 38181"), true);
    assert.equal(
      detectCancellationDocument("Free cancellation before 23:59 on 8 August 2026"),
      false
    );
    assert.equal(
      detectCancellationDocument("Cancellation Policy : Reservation must be cancelled 48 hours prior"),
      false
    );
    assert.equal(isCancellationExtract(extractWith({ document_status: "cancelled" })), true);
    assert.equal(isCancellationExtract(extractWith({ document_status: "confirmed" })), false);
  });

  it("plan : hôtel unique → annule le dossier ; vols restants → masque l’hôtel seulement", () => {
    const hotelOnly = cancellationApplyPlan(
      extractWith({
        document_status: "cancelled",
        items: [hotelItem({ confirmation_ref: "38181SH005103", title: "Dan Tel Aviv Hotel" })],
      }),
      [
        {
          id: "i-hotel",
          kind: "hotel",
          confirmation_ref: "38181SH005103",
          title: "Dan Tel Aviv Hotel",
          start_at: "2026-12-14",
        },
      ]
    );
    assert.deepEqual(hotelOnly.itemIds, ["i-hotel"]);
    assert.equal(hotelOnly.cancelBooking, true);

    const withFlights = cancellationApplyPlan(
      extractWith({
        document_status: "cancelled",
        items: [hotelItem({ confirmation_ref: "38181SH005103", title: "Dan Tel Aviv Hotel" })],
      }),
      [
        { id: "i-hotel", kind: "hotel", confirmation_ref: "38181SH005103", title: "Dan Tel Aviv" },
        { id: "i-fly", kind: "flight", confirmation_ref: "T8TNGL", title: "Paris → Tel Aviv" },
      ]
    );
    assert.deepEqual(withFlights.itemIds, ["i-hotel"]);
    assert.equal(withFlights.cancelBooking, false);

    const stayLevel = cancellationApplyPlan(extractWith({ document_status: "cancelled" }), [
      { id: "i-hotel", kind: "hotel", confirmation_ref: "ABC", title: "Hôtel" },
    ]);
    assert.deepEqual(stayLevel.itemIds, []);
    assert.equal(stayLevel.cancelBooking, true);
  });
});
