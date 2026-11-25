import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";
import {
  cancellationApplyPlan,
  confirmationLookupTokens,
  confirmationRefsAlign,
  clientIsMailTraveler,
  decideEmailIngestAction,
  destinationsOverlap,
  executeEmailIngestDecision,
  extractReferences,
  isSupplierReference,
  lastNamesClose,
  mergeBookingSuggestions,
  referenceTokens,
  suggestBookingByDestination,
  suggestBookingByHotelStay,
  suggestBookingByReference,
  suggestBookingByTraveler,
  suggestBookingByTripSignals,
  suggestCustomerFromExtract,
  soleCompatibleDestinationId,
  usableCustomerEmail,
} from "./email-match";
import { detectCancellationDocument, detectRemovedPassengers, isCancellationExtract, parseRefundAmount } from "./ingest-types";

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

  it("rapproche un prénom et un nom inversés", () => {
    const res = suggestCustomerFromExtract(
      [{ id: "y", first_name: "Yannick", last_name: "Benamara", company_name: null, email: "yannick@example.com" }],
      extractWith({ customer_first_name: "Benamara", customer_last_name: "Yannick" })
    );
    assert.equal(res.autoCustomerId, "y");
    assert.equal(res.candidates[0]?.reason, "Prénom et nom inversés");
    assert.ok((res.candidates[0]?.score || 0) >= 85);
  });

  it("renvoie null sans indice d'identification", () => {
    const res = suggestCustomerFromExtract(customers, extractWith({}));
    assert.equal(res.autoCustomerId, null);
    assert.equal(res.candidates.length, 0);
  });

  it("garde 92 pour un prénom exact même si le nom de famille est partagé", () => {
    const res = suggestCustomerFromExtract(
      customers,
      extractWith({ customer_first_name: "Marie", customer_last_name: "Dupont" })
    );
    const marie = res.candidates.find((row) => row.customer_id === "c2");
    const paul = res.candidates.find((row) => row.customer_id === "c3");
    assert.equal(res.autoCustomerId, "c2");
    assert.equal(marie?.score, 92);
    assert.equal(marie?.reason, "Nom et prénom");
    assert.equal(paul?.score, 60);
  });

  it("un homonyme complet ne choisit personne", () => {
    const twins = [
      { id: "a", first_name: "Amin", last_name: "Khiari", company_name: null, email: "a@example.com" },
      { id: "b", first_name: "Amin", last_name: "Khiari", company_name: null, email: "b@example.com" },
    ];
    const res = suggestCustomerFromExtract(
      twins,
      extractWith({ travelers: [{ first_name: "Amin", last_name: "Khiari" }] })
    );
    assert.equal(res.autoCustomerId, null);
    assert.deepEqual(
      res.candidates.map((row) => row.score).sort(),
      [85, 85]
    );
  });

  it("un accompagnant exact pointe vers la fiche du titulaire", () => {
    const holder = {
      id: "c-raphael",
      first_name: "Raphaël",
      last_name: "Fettaya",
      company_name: null,
      email: "raphael@example.com",
    };
    const swapped = suggestCustomerFromExtract(
      [holder],
      extractWith({ travelers: [{ first_name: "BECACHE", last_name: "NOEMIE" }] }),
      [{ id: "comp-noe", customer_id: "c-raphael", first_name: "Noémie", last_name: "Becache" }]
    );
    assert.equal(swapped.autoCustomerId, "c-raphael");
    assert.equal(swapped.candidates[0]?.score, 92);
    assert.equal(swapped.candidates[0]?.reason, "Accompagnant de Raphaël Fettaya");
    const straight = suggestCustomerFromExtract(
      [holder],
      extractWith({ travelers: [{ first_name: "Noémie", last_name: "Becache" }] }),
      [{ id: "comp-noe", customer_id: "c-raphael", first_name: "Becache", last_name: "Noémie", usage_name: null }]
    );
    assert.equal(straight.autoCustomerId, "c-raphael");
    assert.equal(straight.candidates[0]?.score, 92);
  });

  it("un titulaire et l’accompagnant identique d’une autre fiche ne créent rien", () => {
    const holders = [
      { id: "c-raphael", first_name: "Raphaël", last_name: "Fettaya", company_name: null, email: "r@example.com" },
      { id: "c-autre", first_name: "Paul", last_name: "Martin", company_name: null, email: "p@example.com" },
    ];
    const res = suggestCustomerFromExtract(
      holders,
      extractWith({ travelers: [{ first_name: "Raphaël", last_name: "Fettaya" }] }),
      [{ id: "comp", customer_id: "c-autre", first_name: "Raphaël", last_name: "Fettaya" }]
    );
    assert.equal(res.autoCustomerId, null);
    assert.ok(res.candidates.every((row) => row.score < 92));
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

  it("lit le PNR compagnie et le rapproche d’une carte ou d’un mail déjà déposé", () => {
    const extract = extractWith({
      items: [
        {
          kind: "flight",
          title: "Hurghada → Le Caire",
          supplier: null,
          confirmation_ref: "WFPMHG",
          start_at: "2026-11-02T09:10:00",
          end_at: null,
          amount: null,
          details: { pnr: "KDQ68JS", flight_number: "U2 4692" },
        },
      ],
    });
    const refs = extractReferences(extract);
    assert.ok(refs.has("kdq68js"));
    assert.ok(refs.has("wfpmhg"));
    const bookings = [
      { id: "b-jeanne", customer_id: "c1", reference: "TB-2026-0152", title: "Égypte", destination: "Hurghada", status: "confirmed" },
    ];
    const byCard = suggestBookingByReference(
      extract,
      bookings,
      new Map([["b-jeanne", [{ confirmation_ref: "OTHER", details: { pnr: "KDQ68JS" } }]]])
    );
    assert.equal(byCard.autoBookingId, "b-jeanne");
    assert.equal(byCard.candidates[0]?.reason, "Référence fournisseur");
    const byMail = suggestBookingByReference(extract, bookings, new Map(), new Map([["b-jeanne", ["KDQ68JS"]]]));
    assert.equal(byMail.autoBookingId, "b-jeanne");
    assert.equal(byMail.candidates[0]?.score, 90);
  });

  it("une phrase « Réservation pour » n’est pas une référence et n’emprunte pas le client", () => {
    assert.deepEqual(referenceTokens("Réservation pour LEO PERIOL"), []);
    assert.equal(isSupplierReference("reservation"), false);
    assert.equal(isSupplierReference("pour"), false);
    assert.equal(isSupplierReference("ABC123"), false);
    assert.equal(isSupplierReference("WFPMHG"), true);
    assert.equal(isSupplierReference("KDQ68JS"), true);
    const expedia = extractWith({
      travelers: [
        { first_name: "Leo", last_name: "Periol" },
        { first_name: "Guillian", last_name: "Dupin" },
      ],
      items: [
        {
          kind: "hotel",
          title: "Ocean Park",
          supplier: "Expedia TAAP",
          confirmation_ref: null,
          start_at: "2026-11-24",
          end_at: "2026-11-26",
          amount: null,
          details: {
            rooms: [
              { confirmation_ref: "Réservation pour LEO PERIOL" },
              { confirmation_ref: "Réservation pour GUILLIAN DUPIN" },
            ],
          },
        },
      ],
    });
    assert.equal(extractReferences(expedia).size, 0);
    const bookings = [
      {
        id: "b-jeanne",
        customer_id: "c-jeanne",
        reference: "TB-2026-0152",
        title: "Casablanca",
        destination: "Casablanca",
        status: "confirmed",
      },
    ];
    const attached = new Map([["b-jeanne", ["reservation", "pour", "Réservation pour Manuel Jeanne"]]]);
    const res = suggestBookingByReference(expedia, bookings, new Map(), attached);
    assert.equal(res.autoBookingId, null);
    assert.equal(res.candidates.length, 0);
    assert.equal(
      clientIsMailTraveler({ first_name: "Manuel", last_name: "Jeanne", email: "manuel@example.com" }, expedia),
      false
    );
    assert.equal(clientIsMailTraveler({ first_name: "Leo", last_name: "Periol", email: null }, expedia), true);
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

  it("ne propose pas le dossier d’une autre chambre du même hôtel", () => {
    const extract = extractWith({
      items: [
        {
          kind: "hotel",
          title: "Le Negresco",
          supplier: "Little Emperors",
          confirmation_ref: "6755SH018675",
          start_at: "2026-11-18",
          end_at: "2026-11-20",
          amount: null,
          details: { city: "Nice", hotel_name: "Le Negresco" },
        },
      ],
    });
    const res = suggestBookingByReference(
      extract,
      bookings,
      new Map([["b1", [{ confirmation_ref: "6755SH018666" }]]])
    );
    assert.equal(res.autoBookingId, null);
    assert.equal(res.candidates.length, 0);
    assert.equal(confirmationRefsAlign("6755SH018675", "6755SH018666"), false);
    assert.deepEqual(confirmationLookupTokens("6755SH018675"), ["6755sh018675"]);
    assert.equal(confirmationLookupTokens("6755SH018675").includes("6755"), false);
  });

  it("prend 64570 et 64570SH046795 pour la même confirmation", () => {
    const extract = extractWith({
      items: [
        {
          kind: "hotel",
          title: "Hôtel",
          supplier: "Little Emperors",
          confirmation_ref: "64570SH046795",
          start_at: null,
          end_at: null,
          amount: null,
          details: {},
        },
      ],
    });
    const res = suggestBookingByReference(
      extract,
      bookings,
      new Map([["b1", [{ confirmation_ref: "64570" }]]])
    );
    assert.equal(res.autoBookingId, "b1");
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
    assert.equal(destinationsOverlap("Roma", "Rome"), true);
    assert.equal(destinationsOverlap("Milano", "Milan"), true);
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

describe("suggestBookingByTraveler", () => {
  const dossier = {
    id: "b-voyage",
    customer_id: "c-holder",
    reference: "TB-2026-0152",
    title: "Égypte",
    destination: "Hurghada",
    start_date: "2026-11-01",
    end_date: "2026-11-08",
    status: "confirmed",
  };
  const ticket = extractWith({
    start_date: "2026-11-02",
    end_date: "2026-11-02",
    travelers: [{ first_name: "Inès", last_name: "Morel" }],
    items: [
      {
        kind: "flight",
        title: "Hurghada → Le Caire",
        supplier: null,
        confirmation_ref: "KDQ68JS",
        start_at: "2026-11-02T09:10:00",
        end_at: null,
        amount: null,
        details: { flight_number: "U2 4692", pnr: "KDQ68JS" },
      },
    ],
  });

  it("trouve le dossier par le voyageur, pas par le titulaire", () => {
    const res = suggestBookingByTraveler(
      ticket,
      [dossier],
      [{ booking_id: "b-voyage", first_name: "Inès, Louise", last_name: "Morel" }],
      [],
      [{ id: "c-holder", first_name: "Paul", last_name: "Titulaire", company_name: null, email: "paul@example.com" }]
    );
    assert.equal(res.autoBookingId, "b-voyage");
    assert.equal(res.candidates.length, 1);
    assert.equal(res.candidates[0]?.score, 88);
    assert.equal(res.candidates[0]?.reason, "Voyageur et dates");
  });

  it("accepte le prénom et le nom inversés, et deux dossiers restent proposés", () => {
    const swapped = suggestBookingByTraveler(
      extractWith({
        start_date: "2026-11-02",
        end_date: "2026-11-02",
        travelers: [{ first_name: "Morel", last_name: "Inès" }],
      }),
      [dossier],
      [{ booking_id: "b-voyage", first_name: "Inès", last_name: "Morel" }]
    );
    assert.equal(swapped.autoBookingId, "b-voyage");
    const other = { ...dossier, id: "b-autre", reference: "TB-2026-0153" };
    const both = suggestBookingByTraveler(
      ticket,
      [dossier, other],
      [
        { booking_id: "b-voyage", first_name: "Inès", last_name: "Morel" },
        { booking_id: "b-autre", first_name: "Inès", last_name: "Morel" },
      ]
    );
    assert.equal(both.autoBookingId, null);
    assert.equal(both.candidates.length, 2);
  });

  it("rattache un vol douze jours après le séjour du même client", () => {
    const later = extractWith({
      start_date: "2026-11-20",
      end_date: "2026-11-20",
      travelers: [{ first_name: "Inès", last_name: "Morel" }],
      items: [
        {
          kind: "flight",
          title: "Athènes → Nice",
          supplier: null,
          confirmation_ref: "YFFRS8",
          start_at: "2026-11-20T09:10:00",
          end_at: null,
          amount: null,
          details: { flight_number: "A3 640", pnr: "YFFRS8" },
        },
      ],
    });
    const res = suggestBookingByTraveler(
      later,
      [dossier],
      [{ booking_id: "b-voyage", first_name: "Inès", last_name: "Morel" }],
      [],
      [{ id: "c-holder", first_name: "Paul", last_name: "Titulaire", company_name: null, email: "paul@example.com" }]
    );
    assert.equal(res.candidates[0]?.reason, "Même séjour");
    assert.equal(res.autoBookingId, "b-voyage");
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
    assert.equal(usableCustomerEmail("crm@travelba.fr"), null);
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

  it("hôtel sans prix document se rattache quand même au voyage unique", () => {
    const base = {
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
    };
    const missing = decideEmailIngestAction({
      ...base,
      extract: extractWith({
        destination: "Tel Aviv",
        start_date: "2026-12-14",
        items: [
          {
            kind: "hotel",
            title: "Dan",
            supplier: null,
            confirmation_ref: null,
            start_at: "2026-12-14",
            end_at: null,
            amount: 400,
            details: {},
          },
        ],
      }),
    });
    assert.deepEqual(missing, { kind: "apply", bookingId: "b-tlv", customerId: "c-alb" });
    const ready = decideEmailIngestAction({
      ...base,
      extract: extractWith({
        destination: "Tel Aviv",
        start_date: "2026-12-14",
        items: [
          {
            kind: "hotel",
            title: "Dan",
            supplier: null,
            confirmation_ref: null,
            start_at: "2026-12-14",
            end_at: null,
            amount: null,
            details: { document_amount: 858.8, document_currency: "USD" },
          },
          {
            kind: "visa",
            title: "ETA",
            supplier: null,
            confirmation_ref: null,
            start_at: null,
            end_at: null,
            amount: null,
            details: {},
          },
        ],
      }),
    });
    assert.deepEqual(ready, { kind: "apply", bookingId: "b-tlv", customerId: "c-alb" });
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

describe("suggestBookingByDestination", () => {
  const people = [
    {
      id: "c1",
      first_name: "Léa",
      last_name: "Bernard",
      company_name: null,
      email: "lea.bernard@example.com",
    },
  ];
  const openRome = {
    id: "b-rome",
    customer_id: "c1",
    reference: "TB-1",
    title: "Rome",
    destination: "Rome",
    start_date: "2026-04-01",
    end_date: "2026-04-05",
    status: "confirmed",
  };
  const cancelledRome = { ...openRome, id: "b-old", reference: "TB-0", status: "cancelled" };
  const lisbon = {
    ...openRome,
    id: "b-lis",
    reference: "TB-2",
    title: "Lisbonne",
    destination: "Lisbonne",
  };

  it("propose le dossier annulé de la même ville, sans le choisir seul s’il y en a deux", () => {
    const extract = extractWith({
      document_status: "confirmed",
      destination: "Roma",
      customer_first_name: "Léa",
      customer_last_name: "Bernard",
      start_date: "2026-06-01",
      end_date: "2026-06-04",
    });
    const one = suggestBookingByDestination(extract, [cancelledRome], people);
    assert.equal(one.autoBookingId, null);
    assert.equal(one.candidates.length, 1);
    assert.equal(one.candidates[0].booking_id, "b-old");
    assert.equal(one.candidates[0].start_date, "2026-04-01");
    assert.match(one.candidates[0].reason, /annulé/);

    const two = suggestBookingByDestination(extract, [openRome, cancelledRome], people);
    assert.equal(two.candidates.length, 2);
    assert.equal(two.autoBookingId, null);
  });

  it("ignore une autre ville", () => {
    const extract = extractWith({
      document_status: "confirmed",
      destination: "Rome",
      customer_first_name: "Léa",
      customer_last_name: "Bernard",
    });
    const res = suggestBookingByDestination(extract, [lisbon], people);
    assert.deepEqual(res.candidates, []);
  });

  it("ne propose le dossier de la même ville que si les dates se croisent ou sont proches", () => {
    const extract = extractWith({
      document_status: "confirmed",
      destination: "Rome",
      start_date: "2026-12-16",
      end_date: "2026-12-21",
      customer_first_name: "Léa",
      customer_last_name: "Bernard",
    });
    const far = suggestBookingByDestination(extract, [openRome], people);
    assert.equal(far.candidates.length, 1);
    assert.equal(
      soleCompatibleDestinationId("human", 0, far.candidates, extract),
      null
    );
    const nearStay = {
      ...openRome,
      start_date: "2026-12-10",
      end_date: "2026-12-18",
    };
    const near = suggestBookingByDestination(extract, [nearStay], people);
    assert.equal(soleCompatibleDestinationId("human", 0, near.candidates, extract), "b-rome");
    assert.equal(soleCompatibleDestinationId("human", 1, near.candidates, extract), null);
    assert.equal(soleCompatibleDestinationId("reference", 0, near.candidates, extract), null);
  });

  it("le second billet du même PNR retrouve le dossier déjà créé", () => {
    const first = extractWith({
      travelers: [{ first_name: "Raphaël", last_name: "Fettaya" }],
      items: [
        {
          kind: "flight",
          title: "Tel Aviv → Addis-Abeba",
          supplier: "Ethiopian",
          confirmation_ref: "LQ7M2P",
          start_at: "2026-12-16T22:00:00",
          end_at: null,
          amount: null,
          details: { pnr: "LQ7M2P", flight_number: "ET 800" },
        },
      ],
    });
    const bookings = [
      {
        id: "b-lagos",
        customer_id: "c-raphael",
        reference: "TB-2026-0400",
        title: "Lagos",
        destination: "Lagos",
        status: "draft",
      },
    ];
    const second = extractWith({
      travelers: [{ first_name: "Noémie", last_name: "Becache" }],
      items: first.items,
    });
    const res = suggestBookingByReference(
      second,
      bookings,
      new Map([["b-lagos", [{ confirmation_ref: "LQ7M2P", details: { pnr: "LQ7M2P" } }]]])
    );
    assert.equal(res.autoBookingId, "b-lagos");
    assert.equal(res.candidates[0]?.reason, "Référence fournisseur");
    assert.equal(res.candidates[0]?.score, 90);
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
    assert.equal(
      detectCancellationDocument(
        "easyJet référence de réservation: KDQ68JS\nVous pouvez annuler votre réservation.\nPolitique d'annulation\nAnnulation gratuite jusqu'au 1er mars."
      ),
      false
    );
    assert.equal(detectCancellationDocument("cancelled for passenger Christophe Lavigne"), false);
    assert.deepEqual(detectRemovedPassengers("cancelled for passenger Christophe Lavigne"), [
      { first_name: "Christophe", last_name: "Lavigne" },
    ]);
    assert.equal(parseRefundAmount("Remboursement 141,53 €"), 141.53);
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
    assert.equal(stayLevel.cancelBooking, false);
    assert.equal(stayLevel.needsCardChoice, true);

    const alreadyReplaced = cancellationApplyPlan(
      extractWith({
        document_status: "cancelled",
        items: [hotelItem({ confirmation_ref: "38181SH005103", title: "Hôtel" })],
      }),
      [
        {
          id: "old",
          kind: "hotel",
          confirmation_ref: "38181SH005103",
          title: "Hôtel",
          lifecycle: "superseded",
        },
        { id: "next", kind: "hotel", confirmation_ref: "97620199", title: "Nouvel hôtel" },
      ]
    );
    assert.equal(alreadyReplaced.cancelBooking, false);
    assert.equal(alreadyReplaced.needsCardChoice, false);
    assert.deepEqual(alreadyReplaced.itemIds, []);
  });
});

describe("suggestBookingByHotelStay", () => {
  const nobu = {
    id: "b1",
    reference: "TB-1",
    title: "Londres",
    destination: "Londres",
    customer_id: "c1",
    status: "draft" as const,
    start_date: "2026-11-02",
    end_date: "2026-11-05",
  };
  const card = {
    booking_id: "b1",
    kind: "hotel",
    title: "Nobu Hotel London Portman Square",
    confirmation_ref: "HTL99881",
    start_at: "2026-11-02",
    end_at: "2026-11-05",
    details: { hotel_name: "Nobu Hotel London Portman Square", le_hotel_id: 9626 },
  };
  const mail = extractWith({
    document_status: "confirmed",
    destination: "Londres",
    start_date: "2026-11-02",
    end_date: "2026-11-05",
    customer_first_name: "Jean",
    customer_last_name: "Martin",
    items: [
      {
        kind: "hotel",
        title: "Nobu Hotel London Portman Square",
        supplier: "Little Emperors",
        confirmation_ref: "LECONF88",
        start_at: "2026-11-02",
        end_at: "2026-11-05",
        amount: null,
        details: { hotel_name: "Nobu Hotel London Portman Square", le_hotel_id: 9626 },
      },
    ],
  });

  it("ne relie pas le dossier quand le numéro diffère, même hôtel, mêmes dates et même voyageur", () => {
    const suggestion = suggestBookingByHotelStay(mail, [nobu], [card], customers);
    assert.equal(suggestion.autoBookingId, null);
    assert.equal(suggestion.candidates.length, 0);
  });

  it("laisse en relecture deux dossiers du même séjour", () => {
    const other = { ...nobu, id: "b2", reference: "TB-2" };
    const sameNumber = extractWith({
      ...mail,
      items: [{ ...mail.items[0], confirmation_ref: "HTL99881" }],
    });
    const suggestion = suggestBookingByHotelStay(
      sameNumber,
      [nobu, other],
      [card, { ...card, booking_id: "b2" }],
      customers
    );
    assert.equal(suggestion.autoBookingId, null);
    assert.equal(suggestion.candidates.length, 2);
    const decision = decideEmailIngestAction({
      extract: mail,
      suggestedCustomerId: "c1",
      suggestedBookingId: null,
      candidates: suggestion.candidates.map((row) => ({
        customer_id: row.customer_id || "",
        booking_id: row.booking_id,
        label: row.label,
        reason: row.reason,
        score: row.score,
      })),
    });
    assert.equal(decision.kind, "review");
  });

  it("ignore un autre hôtel, d’autres dates ou un autre voyageur", () => {
    const otherHotel = extractWith({
      ...mail,
      items: [
        {
          ...mail.items[0],
          title: "Autre hôtel",
          details: { hotel_name: "Autre hôtel", le_hotel_id: 4 },
        },
      ],
    });
    assert.equal(suggestBookingByHotelStay(otherHotel, [nobu], [card], customers).candidates.length, 0);
    const otherDates = extractWith({
      ...mail,
      items: [{ ...mail.items[0], start_at: "2026-12-01", end_at: "2026-12-04" }],
    });
    assert.equal(suggestBookingByHotelStay(otherDates, [nobu], [card], customers).candidates.length, 0);
    const otherPerson = extractWith({
      ...mail,
      customer_first_name: "Marie",
      customer_last_name: "Dupont",
    });
    assert.equal(suggestBookingByHotelStay(otherPerson, [nobu], [card], customers).candidates.length, 0);
    const lastOnly = extractWith({ ...mail, customer_first_name: "", customer_last_name: "Martin" });
    assert.equal(suggestBookingByHotelStay(lastOnly, [nobu], [card], customers).candidates.length, 0);
  });

  it("reconnaît le voyageur sur la carte ou le nom d’usage", () => {
    const same = extractWith({
      ...mail,
      items: [{ ...mail.items[0], confirmation_ref: "HTL99881" }],
    });
    const guestCard = {
      ...card,
      details: { ...card.details, guests: "Jean Martin" },
    };
    const marieBooking = { ...nobu, customer_id: "c2" };
    assert.equal(
      suggestBookingByHotelStay(same, [marieBooking], [guestCard], customers).autoBookingId,
      "b1"
    );
    const usage = suggestBookingByHotelStay(
      same,
      [nobu],
      [card],
      [{ id: "c1", first_name: "Jean", last_name: "Dupont", usage_name: "Martin", company_name: null, email: "" }]
    );
    assert.equal(usage.autoBookingId, "b1");
  });
});
