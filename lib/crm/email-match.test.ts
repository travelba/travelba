import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyBookingExtract, type BookingExtract } from "./ingest-types";
import {
  extractReferences,
  referenceTokens,
  suggestBookingByReference,
  suggestCustomerFromExtract,
} from "./email-match";

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
