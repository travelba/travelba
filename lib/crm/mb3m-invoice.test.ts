import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Mb3mError } from "./mb3m";
import {
  buildMb3mInvoiceContext,
  mb3mInvoiceBlocker,
  runMb3mInvoice,
  storeMb3mPdf,
  type Mb3mInvoiceContext,
  type Mb3mInvoiceDeps,
  type Mb3mStoredPiece,
} from "./mb3m-invoice";

const previous = {
  user: process.env.MB3M_API_USER,
  password: process.env.MB3M_API_PASSWORD,
  activity: process.env.MB3M_ACTIVITY_ID,
  allow: process.env.MB3M_SYNC_CUSTOMER_IDS,
  vercel: process.env.VERCEL_ENV,
};

afterEach(() => {
  restore("MB3M_API_USER", previous.user);
  restore("MB3M_API_PASSWORD", previous.password);
  restore("MB3M_ACTIVITY_ID", previous.activity);
  restore("MB3M_SYNC_CUSTOMER_IDS", previous.allow);
  restore("VERCEL_ENV", previous.vercel);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function arm() {
  delete process.env.VERCEL_ENV;
  delete process.env.MB3M_SYNC_CUSTOMER_IDS;
  process.env.MB3M_API_USER = "agent@partner";
  process.env.MB3M_API_PASSWORD = "secret-value";
  process.env.MB3M_ACTIVITY_ID = "3";
}

const bookingId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const payerId = "11111111-2222-4333-8444-555555555555";

function payer(overrides: Record<string, string | null> = {}) {
  return {
    id: payerId,
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.invalid",
    billing_email: null,
    billing_address_line: null,
    billing_postal_code: null,
    billing_city: null,
    billing_country: null,
    address_line: "1 rue du Test",
    postal_code: "75001",
    city: "Paris",
    country: "France",
    ...overrides,
  };
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: bookingId,
    reference: "TBA-42",
    title: "Semaine à Avoriaz",
    currency: "EUR",
    destination: "Avoriaz",
    start_date: "2026-12-01",
    end_date: "2026-12-08",
    status: "confirmed" as const,
    agency_commission: false,
    visible_to_client: false,
    payer_kind: "personal" as const,
    billing_company_id: null as string | null,
    ...overrides,
  };
}

function context(overrides: Partial<Mb3mInvoiceContext> = {}): Mb3mInvoiceContext {
  return {
    bookingId,
    reference: "TBA-42",
    title: "Semaine à Avoriaz",
    currency: "EUR",
    amount: 1050,
    dateStart: "2026-12-01",
    dateEnd: "2026-12-08",
    destination: "Avoriaz",
    destinationIso: null,
    payerKind: "personal",
    person: {
      id: payerId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.invalid",
      address: {
        name: "Ada Lovelace",
        line1: "1 rue du Test",
        postalCode: "75001",
        city: "Paris",
        countryCode: "FR",
      },
    },
    company: null,
    travelers: [{ firstName: "Ada", lastName: "Lovelace" }],
    visibleToClient: false,
    configured: true,
    lines: [{ transactionId: "tx-1", label: "Hôtel", amount: 1050, activityId: 3 }],
    hadExpenses: true,
    ...overrides,
  };
}

function blankPiece(patch: Partial<Mb3mStoredPiece> = {}): Mb3mStoredPiece {
  return {
    id: "piece-1",
    bookingId,
    customerUid: null,
    folderId: null,
    folderUid: null,
    pieceNumber: null,
    pieceUid: null,
    amount: null,
    documentId: null,
    updatedAt: new Date().toISOString(),
    printedAt: null,
    signature: null,
    transactionIds: [],
    lines: [],
    ...patch,
  };
}

describe("facture MB3M", () => {
  it("prépare une ligne par dépense déjà au grand livre", () => {
    arm();
    const items = [
      { id: "hotel-1", kind: "hotel", amount: 1000, lifecycle: "active" },
      { id: "fee-1", kind: "expense", amount: 50, lifecycle: "active" },
      { kind: "hotel", amount: 9000, lifecycle: "cancelled" },
    ];
    const ctx = buildMb3mInvoiceContext({
      booking: booking({ agency_commission: true, destination: "France" }),
      items,
      travelers: [{ first_name: "Ada", last_name: "Lovelace" }],
      payer: payer(),
      companies: [],
      charges: [
        {
          id: "hotel-debit",
          direction: "debit",
          status: "posted",
          currency: "EUR",
          amount: 1000,
          label: "Hôtel · Avoriaz",
          external_id: "booking:b:item:hotel-1",
          booking_id: bookingId,
        },
        {
          id: "fee-debit",
          direction: "debit",
          status: "posted",
          currency: "EUR",
          amount: 50,
          label: "Dépense · Extra",
          external_id: "booking:b:expense:fee-1",
          booking_id: bookingId,
        },
      ],
    });
    assert.equal(ctx.amount, 1050);
    assert.deepEqual(
      ctx.lines.map((line) => [line.transactionId, line.amount, line.activityId]),
      [
        ["fee-debit", 50, 3],
        ["hotel-debit", 1000, 3],
      ]
    );
    assert.equal(ctx.currency, "EUR");
    assert.equal(ctx.destinationIso, "FR");
    assert.equal(ctx.destination, "France");
    assert.equal(mb3mInvoiceBlocker(ctx), null);
  });

  it("n’invente pas un pays à partir d’une station et reprend l’adresse du domicile", () => {
    arm();
    const ctx = buildMb3mInvoiceContext({
      booking: booking(),
      items: [{ kind: "hotel", amount: 800, lifecycle: "active" }],
      travelers: [{ first_name: "Ada", last_name: "" }],
      payer: payer(),
      companies: [],
    });
    assert.equal(ctx.destinationIso, null);
    assert.equal(ctx.destination, "Avoriaz");
    assert.equal(ctx.person?.address?.line1, "1 rue du Test");
    assert.equal(ctx.travelers.length, 0);
    assert.equal(ctx.amount, 0);
    assert.equal(ctx.lines.length, 0);
  });

  it("préfère l’adresse de facturation et reste éteint sans prix, sans adresse ou sans accès", async () => {
    arm();
    const billed = buildMb3mInvoiceContext({
      booking: booking(),
      items: [{ kind: "hotel", amount: 100, lifecycle: "active" }],
      travelers: [],
      payer: payer({
        billing_address_line: "9 avenue du Compte",
        billing_postal_code: "69001",
        billing_city: "Lyon",
        billing_country: "France",
      }),
      companies: [],
    });
    assert.equal(billed.person?.address?.city, "Lyon");
    assert.equal(
      mb3mInvoiceBlocker(context({ lines: [], hadExpenses: false })),
      "Aucune dépense de ce séjour n’est au grand livre."
    );
    assert.equal(
      mb3mInvoiceBlocker(context({ person: { ...context().person!, address: null } })),
      "L’adresse de facturation est incomplète."
    );
    assert.equal(mb3mInvoiceBlocker(context({ configured: false })), "L’accès MB3M n’est pas configuré.");
    assert.equal(
      mb3mInvoiceBlocker(context({ lines: [{ transactionId: "tx-1", label: "Hôtel", amount: 10, activityId: null }] })),
      "L’activité MB3M n’est pas configurée."
    );
    assert.equal(mb3mInvoiceBlocker(context({ currency: "USD" })), "Le séjour n’est pas en euros.");
    const company = buildMb3mInvoiceContext({
      booking: booking({ payer_kind: "company", billing_company_id: "co-1" }),
      items: [{ kind: "hotel", amount: 100, lifecycle: "active" }],
      travelers: [],
      payer: payer(),
      companies: [
        {
          id: "co-1",
          sort_order: 1,
          company_name: "Travelba",
          billing_email: "compta@example.invalid",
          billing_address_line: null,
          billing_postal_code: null,
          billing_city: null,
          billing_country: null,
        },
      ],
    });
    assert.equal(mb3mInvoiceBlocker(company), "L’adresse de facturation est incomplète.");
    assert.equal(company.company?.name, "Travelba");
  });

  it("dépose le PDF et ne le montre que si le séjour est déjà visible", async () => {
    const inserted: { visibleToClient: boolean }[] = [];
    const hidden = await storeMb3mPdf({
      bookingId,
      documentId: null,
      fileName: "Facture MB3M n° 4531.pdf",
      bytes: Buffer.from("%PDF-1.4"),
      visibleToClient: false,
      loadDocument: async () => null,
      upload: async () => undefined,
      insertDocument: async (row) => {
        inserted.push(row);
        return "doc-hidden";
      },
    });
    const shown = await storeMb3mPdf({
      bookingId,
      documentId: null,
      fileName: "Facture MB3M n° 4531.pdf",
      bytes: Buffer.from("%PDF-1.4"),
      visibleToClient: true,
      loadDocument: async () => null,
      upload: async () => undefined,
      insertDocument: async (row) => {
        inserted.push(row);
        return "doc-shown";
      },
    });
    let reused = false;
    const again = await storeMb3mPdf({
      bookingId,
      documentId: "doc-shown",
      fileName: "Facture MB3M n° 4531.pdf",
      bytes: Buffer.from("%PDF-1.4"),
      visibleToClient: false,
      loadDocument: async () => ({ storagePath: "bookings/x/facture.pdf" }),
      upload: async (path, _bytes, upsert) => {
        reused = path === "bookings/x/facture.pdf" && upsert;
      },
      insertDocument: async () => {
        throw new Error("seconde pièce");
      },
    });
    assert.equal(hidden, "doc-hidden");
    assert.equal(shown, "doc-shown");
    assert.equal(inserted[0]?.visibleToClient, false);
    assert.equal(inserted[1]?.visibleToClient, true);
    assert.equal(again, "doc-shown");
    assert.equal(reused, true);
  });

  it("prépare un pro forma et ne le réémet pas", async () => {
    let stored = blankPiece();
    let invoices = 0;
    let renders = 0;
    const deps: Mb3mInvoiceDeps = {
      now: () => Date.now(),
      claim: async () => ({ piece: { ...stored }, created: stored.pieceNumber == null && stored.customerUid == null }),
      save: async (_id, patch) => {
        stored = {
          ...stored,
          customerUid: patch.customerUid === undefined ? stored.customerUid : patch.customerUid,
          folderId: patch.folderId === undefined ? stored.folderId : patch.folderId,
          folderUid: patch.folderUid === undefined ? stored.folderUid : patch.folderUid,
          pieceNumber: patch.pieceNumber === undefined ? stored.pieceNumber : patch.pieceNumber,
          pieceUid: patch.pieceUid === undefined ? stored.pieceUid : patch.pieceUid,
          documentId: patch.documentId === undefined ? stored.documentId : patch.documentId,
          amount: patch.amount === undefined ? stored.amount : patch.amount,
          printedAt: patch.printedAt === undefined ? stored.printedAt : patch.printedAt,
          signature: patch.signature === undefined ? stored.signature : patch.signature,
          transactionIds: patch.transactionIds === undefined ? stored.transactionIds : patch.transactionIds,
        };
      },
      remove: async () => {
        stored = blankPiece();
      },
      savePerson: async (draft) => {
        assert.equal(draft.firstName, "Ada");
        assert.equal(draft.name, "Lovelace");
        assert.equal("passport" in draft, false);
        return { uid: "customer-uid", partnerId: "11111111222243" };
      },
      saveCompany: async () => {
        throw new Error("fiche société");
      },
      saveFolder: async (input) => {
        assert.equal(input.folderType, "Prestation");
        assert.equal(input.destinationIso, undefined);
        assert.equal(input.destination, "Avoriaz");
        return { id: "22-0000099", uid: "folder-uid" };
      },
      addInvoice: async (input) => {
        invoices += 1;
        assert.equal(input.lines[0]?.netPriceTotal, 1050);
        assert.equal(input.lines[0]?.activityId, 3);
        assert.deepEqual(input.travelers, [{ firstName: "Ada", name: "Lovelace" }]);
        return { number: invoices === 1 ? "4531" : "4532", uid: "piece-uid" };
      },
      findPiece: async () => (stored.printedAt ? "printed" : stored.pieceNumber ? "open" : "missing"),
      cancelInvoice: async () => undefined,
      renderPiece: async (number) => {
        renders += 1;
        assert.equal(number, "4531");
        return { bytes: Buffer.from("%PDF-1.4") };
      },
      putPdf: async (input) => {
        assert.equal(input.bytes.subarray(0, 4).toString("utf8"), "%PDF");
        return "doc-1";
      },
    };
    const first = await runMb3mInvoice(context(), deps);
    const second = await runMb3mInvoice(context({ amount: 20, visibleToClient: true }), deps);
    assert.deepEqual(Object.keys(first).sort(), ["created", "documentId", "number", "printed", "replaced", "visibleToClient"]);
    assert.equal(first.created, true);
    assert.equal(first.printed, false);
    assert.equal(first.documentId, null);
    assert.equal(first.number, "4531");
    assert.equal(second.created, false);
    assert.equal(second.replaced, false);
    assert.equal(second.number, "4531");
    assert.equal(invoices, 1);
    assert.equal(renders, 0);
    stored = blankPiece({ updatedAt: new Date().toISOString(), customerUid: "customer-uid" });
    await assert.rejects(
      () => runMb3mInvoice(context(), deps),
      (error: unknown) => error instanceof Mb3mError && /déjà en cours/.test(error.message)
    );
  });
});
