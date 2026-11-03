import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { mb3mLineSignature } from "./mb3m-account";
import { Mb3mError } from "./mb3m";
import {
  buildMb3mInvoiceContext,
  mb3mInvoiceBlocker,
  mb3mInvoiceLine,
  runMb3mInvoice,
  storeMb3mPdf,
  type Mb3mInvoiceContext,
  type Mb3mInvoiceDeps,
  type Mb3mStoredPiece,
} from "./mb3m-invoice";
import { mb3mInvoiceChip, mb3mPreparationView } from "./mb3m-prep";

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

describe("mb3mInvoiceLine", () => {
  it("envoie vente − marge en net : MB3M facture Net + Marge, la pièce fait le prix vendu", () => {
    const hotel = mb3mInvoiceLine({ transactionId: "tx-1", label: "Hôtel", amount: 9900, activityId: 7, margin: 990, note: "Fournisseur : RIAD" });
    assert.equal(hotel.netPriceUnit, 8910);
    assert.equal(hotel.netPriceTotal, 8910);
    assert.equal(hotel.marginUnit, 990);
    // Marge pure : MB3M refuse un net à 0 (-504). Un centime de net, la marge complète, la pièce fait le montant.
    const fee = mb3mInvoiceLine({ transactionId: "tx-2", label: "Frais d’agence 10 %", amount: 2279.24, activityId: 22, margin: 2279.24 });
    assert.equal(fee.netPriceUnit, 0.01);
    assert.equal(fee.netPriceTotal, 0.01);
    assert.equal(fee.marginUnit, 2279.23);
    const over = mb3mInvoiceLine({ transactionId: "tx-5", label: "Taxi", amount: 235, activityId: 22, margin: 300 });
    assert.equal(over.netPriceUnit, 0.01);
    assert.equal(over.marginUnit, 234.99);
    const cent = mb3mInvoiceLine({ transactionId: "tx-6", label: "Arrondi", amount: 0.01, activityId: 22, margin: 0.01 });
    assert.equal(cent.netPriceUnit, 0.01);
    assert.equal(cent.marginUnit, 0);
    const cents = mb3mInvoiceLine({ transactionId: "tx-3", label: "DJ", amount: 401.28, activityId: 22, margin: 0.1 });
    assert.equal(cents.netPriceUnit, 401.18);
    const hotelZero = mb3mInvoiceLine({ transactionId: "tx-7", label: "Hôtel", amount: 400, activityId: 7, margin: 0 });
    assert.equal(hotelZero.netPriceUnit, 400);
    assert.equal(hotelZero.marginUnit, 0);
  });

  it("vol, train et low cost : net et marge réels, activité 22, le TTC reste celui du CRM", () => {
    const sold = (line: { netPriceUnit: number; marginUnit?: number | null }) =>
      Math.round((line.netPriceUnit + (line.marginUnit || 0)) * 100) / 100;
    for (const activityId of [2, 5, 27, 22]) {
      const priced = mb3mInvoiceLine({
        transactionId: "tx-flight",
        label: "Air France",
        amount: 1198.44,
        activityId,
        margin: 1000.44,
      });
      assert.equal(priced.activityId, 22);
      assert.equal(priced.netPriceUnit, 198);
      assert.equal(priced.netPriceTotal, 198);
      assert.equal(priced.marginUnit, 1000.44);
      assert.equal(sold(priced), 1198.44);
      const zero = mb3mInvoiceLine({
        transactionId: "tx-zero",
        label: "Train",
        amount: 362,
        activityId,
        margin: 0,
      });
      assert.equal(zero.activityId, 22);
      assert.equal(zero.netPriceUnit, 362);
      assert.equal(zero.marginUnit, 0);
      assert.equal(sold(zero), 362);
    }
    const pure = mb3mInvoiceLine({
      transactionId: "tx-pure",
      label: "Vol sans coût",
      amount: 842.4,
      activityId: 2,
      margin: 842.4,
    });
    assert.equal(pure.netPriceUnit, 0.01);
    assert.equal(pure.marginUnit, 842.39);
    assert.equal(sold(pure), 842.4);
  });
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
    attemptStatus: null,
    attemptError: null,
    attemptStartedAt: null,
    attemptStartedBy: null,
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
      "L’adresse du client manque sur sa fiche (rue, code postal, ville) : c’est elle qui sert à la facture."
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
    assert.equal(mb3mInvoiceBlocker(company), "L’adresse de facturation de la société est incomplète (rue, code postal, ville).");
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
    let payments = 0;
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
      recordPayments: async (input) => {
        payments += 1;
        assert.equal(input.invoiceNumber, "4531");
        assert.equal(input.folderId, "22-0000099");
        if (payments === 1) throw new Error("coupure");
        return [{ date: "2026-10-30", montant: 10, numero_mb3m: "1", statut: "envoye" }];
      },
    };
    await assert.rejects(() => runMb3mInvoice(context(), deps), (error: unknown) => {
      assert.ok(error instanceof Mb3mError);
      assert.equal(error.message, "coupure");
      return true;
    });
    const second = await runMb3mInvoice(context({ amount: 20, visibleToClient: true }), deps);
    assert.equal(second.reglements[0]?.numero_mb3m, "1");
    assert.equal(payments, 2);
    assert.equal(second.created, false);
    assert.equal(second.replaced, false);
    assert.equal(second.number, "4531");
    assert.equal(invoices, 1);
    assert.equal(renders, 0);
  });

  it("crée la nouvelle pro forma avant d’annuler l’ancienne ; un refus MB3M laisse l’ancienne en place", async () => {
    const calls: string[] = [];
    const open = blankPiece({
      customerUid: "customer-uid",
      folderId: "22-0000099",
      folderUid: "folder-uid",
      pieceNumber: "4531",
      amount: 1050,
      signature: "ancienne",
      transactionIds: ["tx-1"],
    });
    let saved: Parameters<Mb3mInvoiceDeps["save"]>[1] | null = null;
    const deps = (addInvoice: Mb3mInvoiceDeps["addInvoice"]): Mb3mInvoiceDeps => ({
      now: () => Date.now(),
      claim: async () => ({ piece: { ...open }, created: false }),
      save: async (_id, patch) => {
        calls.push("save");
        saved = patch;
      },
      remove: async () => undefined,
      savePerson: async () => ({ uid: "customer-uid", partnerId: "11111111222243" }),
      saveCompany: async () => {
        throw new Error("fiche société");
      },
      saveFolder: async () => ({ id: "22-0000099", uid: "folder-uid" }),
      addInvoice,
      agencyUid: async () => null,
      findPiece: async () => "open",
      cancelInvoice: async (_folder, number) => {
        calls.push(`cancel ${number}`);
      },
      renderPiece: async () => ({ bytes: Buffer.from("%PDF-1.4") }),
      putPdf: async () => "doc-1",
    });
    const result = await runMb3mInvoice(
      context(),
      deps(async () => {
        calls.push("add");
        return { number: "4532", uid: "piece-uid" };
      })
    );
    assert.equal(result.replaced, true);
    assert.equal(result.number, "4532");
    assert.deepEqual(calls, ["add", "cancel 4531", "save"]);
    assert.equal((saved as Parameters<Mb3mInvoiceDeps["save"]>[1] | null)?.pieceNumber, "4532");

    calls.length = 0;
    await assert.rejects(
      () =>
        runMb3mInvoice(
          context(),
          deps(async () => {
            calls.push("add");
            throw new Mb3mError("Une erreur s'est produite durant l'enregistrement de la facture.", -504);
          })
        ),
      (error: unknown) => error instanceof Mb3mError && error.resultCode === -504
    );
    assert.deepEqual(calls, ["add", "save"]);

    calls.length = 0;
    const failing = deps(async () => {
      calls.push("add");
      return { number: "4533", uid: "piece-uid-2" };
    });
    failing.cancelInvoice = async (_folder, number) => {
      calls.push(`cancel ${number}`);
      if (number === "4531") throw new Error("refus");
    };
    await assert.rejects(
      () => runMb3mInvoice(context(), failing),
      (error: unknown) => error instanceof Mb3mError && /4531/.test(error.message)
    );
    assert.deepEqual(calls, ["add", "cancel 4531", "cancel 4533", "save"]);
  });

  it("reprend la pro forma 2157 sans nouvelle pièce ni annulation", async () => {
    const lines = context().lines;
    const open = blankPiece({
      customerUid: "customer-uid",
      folderId: "01-0002007",
      folderUid: "b127ebaa-8fcd-4399-99c2-202611021224",
      pieceNumber: "2157",
      amount: 561.19,
      signature: mb3mLineSignature(lines),
      transactionIds: lines.map((line) => line.transactionId),
    });
    let added = 0;
    let cancelled = 0;
    const result = await runMb3mInvoice(context(), {
      now: () => Date.now(),
      claim: async () => ({ piece: { ...open }, created: false, owned: true }),
      save: async () => undefined,
      remove: async () => undefined,
      savePerson: async () => ({ uid: "customer-uid", partnerId: "11111111222243" }),
      saveCompany: async () => {
        throw new Error("fiche société");
      },
      saveFolder: async () => ({ id: "01-0002007", uid: open.folderUid || "" }),
      addInvoice: async () => {
        added += 1;
        return { number: "2158", uid: "new" };
      },
      findPiece: async () => "open",
      cancelInvoice: async () => {
        cancelled += 1;
      },
      renderPiece: async () => ({ bytes: Buffer.from("%PDF-1.4") }),
      putPdf: async () => "doc-1",
    });
    assert.equal(result.number, "2157");
    assert.equal(result.created, false);
    assert.equal(result.replaced, false);
    assert.equal(added, 0);
    assert.equal(cancelled, 0);
  });

  it("verrouille une préparation en cours, puis reprend quand elle est périmée ou en échec", async () => {
    const started = Date.parse("2026-11-02T13:05:00.000Z");
    const running = blankPiece({
      customerUid: "customer-uid",
      folderId: "22-0000099",
      folderUid: "folder-uid",
      attemptStatus: "preparing",
      attemptStartedAt: new Date(started).toISOString(),
      attemptStartedBy: "Camille",
    });
    let invoices = 0;
    const base = (now: number, piece: Mb3mStoredPiece): Mb3mInvoiceDeps => ({
      now: () => now,
      actorName: "Camille",
      claim: async () => ({ piece: { ...piece }, created: false }),
      save: async () => undefined,
      remove: async () => undefined,
      savePerson: async () => {
        throw new Error("fiche en double");
      },
      saveCompany: async () => {
        throw new Error("fiche société");
      },
      saveFolder: async (input) => ({ id: input.id || "22-NEW", uid: "folder-uid" }),
      addInvoice: async () => {
        invoices += 1;
        return { number: "4533", uid: "piece-uid" };
      },
      findPiece: async () => "missing",
      cancelInvoice: async () => undefined,
      renderPiece: async () => ({ bytes: Buffer.from("%PDF-1.4") }),
      putPdf: async () => "doc-1",
    });
    await assert.rejects(
      () => runMb3mInvoice(context(), base(started + 60_000, running)),
      (error: unknown) =>
        error instanceof Mb3mError &&
        error.message === "Préparation en cours (démarrée à 14h05 par Camille), réessaie dans 2 min"
    );
    assert.equal(invoices, 0);

    const stale = await runMb3mInvoice(context(), base(started + 4 * 60_000, running));
    assert.equal(stale.number, "4533");
    assert.equal(invoices, 1);

    const failed = blankPiece({
      customerUid: "customer-uid",
      folderId: "22-0000099",
      folderUid: "folder-uid",
      attemptStatus: "failed",
      attemptError: "Code interne -22 : commission",
      updatedAt: new Date(started).toISOString(),
    });
    const again = await runMb3mInvoice(context(), base(started + 30_000, failed));
    assert.equal(again.number, "4533");
    assert.equal(invoices, 2);
  });

  it("écrit l’erreur MB3M sur la ligne et reprend la même fiche et le même dossier", async () => {
    let stored = blankPiece({
      customerUid: "customer-uid",
      folderId: "22-0000099",
      folderUid: "folder-uid",
    });
    let persons = 0;
    const folders: Array<string | undefined> = [];
    let fail = true;
    const deps: Mb3mInvoiceDeps = {
      now: () => Date.parse("2026-11-02T13:10:00.000Z"),
      actorName: "Camille",
      claim: async () => ({ piece: { ...stored }, created: false }),
      save: async (_id, patch) => {
        stored = {
          ...stored,
          customerUid: patch.customerUid === undefined ? stored.customerUid : patch.customerUid,
          folderId: patch.folderId === undefined ? stored.folderId : patch.folderId,
          folderUid: patch.folderUid === undefined ? stored.folderUid : patch.folderUid,
          pieceNumber: patch.pieceNumber === undefined ? stored.pieceNumber : patch.pieceNumber,
          attemptStatus: patch.attemptStatus === undefined ? stored.attemptStatus : patch.attemptStatus,
          attemptError: patch.attemptError === undefined ? stored.attemptError : patch.attemptError,
          attemptStartedAt: patch.attemptStartedAt === undefined ? stored.attemptStartedAt : patch.attemptStartedAt,
          attemptStartedBy: patch.attemptStartedBy === undefined ? stored.attemptStartedBy : patch.attemptStartedBy,
        };
      },
      remove: async () => undefined,
      savePerson: async () => {
        persons += 1;
        return { uid: "autre-fiche", partnerId: "11111111222243" };
      },
      saveCompany: async () => {
        throw new Error("fiche société");
      },
      agencyUid: async () => "agency-uid",
      saveFolder: async (input) => {
        folders.push(input.id);
        return { id: input.id || "22-NEW", uid: "folder-uid" };
      },
      addInvoice: async () => {
        if (fail) {
          throw new Mb3mError(
            "Une erreur s'est produite durant l'enregistrement de la facture — Code interne -22 : Impossible de sauvegarder la pièce car une prestation de billetterie n'a pas de commission renseignée.",
            -504
          );
        }
        return { number: "4540", uid: "piece-uid" };
      },
      findPiece: async () => "missing",
      cancelInvoice: async () => undefined,
      renderPiece: async () => ({ bytes: Buffer.from("%PDF-1.4") }),
      putPdf: async () => "doc-1",
    };
    await assert.rejects(
      () => runMb3mInvoice(context(), deps),
      (error: unknown) => error instanceof Mb3mError && error.resultCode === -504
    );
    assert.equal(persons, 0);
    assert.deepEqual(folders, ["22-0000099"]);
    assert.equal(stored.customerUid, "customer-uid");
    assert.equal(stored.folderId, "22-0000099");
    assert.equal(stored.pieceNumber, null);
    assert.equal(stored.attemptStatus, "failed");
    assert.match(stored.attemptError || "", /billetterie/);
    assert.equal(stored.attemptStartedBy, "Camille");

    fail = false;
    const resumed = await runMb3mInvoice(context(), deps);
    assert.equal(resumed.number, "4540");
    assert.equal(persons, 0);
    assert.deepEqual(folders, ["22-0000099", "22-0000099"]);
    assert.equal(stored.attemptStatus, null);
    assert.equal(stored.customerUid, "customer-uid");
  });

  it("pastille : en cours, échouée, ou à préparer", () => {
    const started = Date.parse("2026-11-02T13:05:00.000Z");
    const now = started + 60_000;
    const running = mb3mPreparationView(
      {
        pieceNumber: null,
        attemptStatus: "preparing",
        attemptError: null,
        attemptStartedAt: new Date(started).toISOString(),
        attemptStartedBy: "Camille",
      },
      now
    );
    assert.equal(running.state, "running");
    assert.equal(running.resume, false);
    assert.equal(running.message, "Préparation en cours (démarrée à 14h05 par Camille), réessaie dans 2 min");
    const stale = mb3mPreparationView(
      {
        pieceNumber: null,
        attemptStatus: "preparing",
        attemptError: null,
        attemptStartedAt: new Date(started).toISOString(),
        attemptStartedBy: "Camille",
      },
      started + 4 * 60_000
    );
    assert.equal(stale.state, "failed");
    assert.equal(stale.resume, true);
    assert.match(stale.message || "", /interrompue/);
    const failed = mb3mPreparationView(
      {
        pieceNumber: null,
        attemptStatus: "failed",
        attemptError: "Code interne -22 : commission",
        attemptStartedAt: new Date(started).toISOString(),
        attemptStartedBy: "Camille",
      },
      now
    );
    assert.equal(failed.state, "failed");
    assert.equal(failed.message, "Code interne -22 : commission");
    const numbered = mb3mPreparationView(
      {
        pieceNumber: "2157",
        attemptStatus: "failed",
        attemptError: "La facture Amadeus n° 2005 n’a pas pu être rangée dans le dossier.",
        attemptStartedAt: new Date(started).toISOString(),
        attemptStartedBy: "mcp",
      },
      now
    );
    assert.equal(numbered.state, "failed");
    assert.match(numbered.message || "", /2005/);
    assert.equal(
      mb3mPreparationView(
        {
          pieceNumber: "2157",
          attemptStatus: null,
          attemptError: null,
          attemptStartedAt: null,
          attemptStartedBy: null,
        },
        now
      ).state,
      null
    );
    const legacy = mb3mPreparationView(
      {
        pieceNumber: null,
        attemptStatus: null,
        attemptError: null,
        attemptStartedAt: null,
        attemptStartedBy: null,
      },
      now
    );
    assert.equal(legacy.state, "failed");
    assert.equal(legacy.resume, true);
    assert.equal(
      mb3mInvoiceChip({ marginStale: false, printed: false, number: null, preparation: "running" }).label,
      "Préparation en cours"
    );
    assert.equal(
      mb3mInvoiceChip({ marginStale: false, printed: false, number: null, preparation: "failed" }).label,
      "Préparation échouée"
    );
    assert.equal(
      mb3mInvoiceChip({ marginStale: false, printed: false, number: null, preparation: null }).label,
      "À préparer"
    );
  });
});
