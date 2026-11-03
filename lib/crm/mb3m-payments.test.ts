import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatMoney } from "./money";
import { mb3mReglementNote } from "./mb3m-prep";
import {
  MB3M_PAYMENT_LOOKUP_HOLD,
  applyMb3mPaymentPlans,
  mb3mIsPaymentGap,
  mb3mPaymentGapMessage,
  mb3mWalletCreditRows,
  planMb3mGdsMatchings,
  planMb3mPayments,
  withoutPaymentGap,
  type Mb3mCredit,
  type Mb3mPlannedPayment,
} from "./mb3m-payments";

const BOOKING = "3fd284ef-30b6-4185-9903-dfb62c8779db";
const CREDIT_ID = "0173733f-95a6-4115-8e49-e81cb3e875c5";

function credit(patch: Partial<Mb3mCredit> = {}): Mb3mCredit {
  return {
    id: CREDIT_ID,
    bookingId: null,
    customerId: "e05d2e16-ccd8-47e1-bb2c-538cce26a633",
    billingCompanyId: null,
    amount: 2639.96,
    date: "2026-10-30",
    source: "revolut",
    label: "Virement Revolut",
    ...patch,
  };
}

function plan(
  input: Pick<Parameters<typeof planMb3mPayments>[0], "bookingId" | "invoiceNumber" | "invoiceAmount" | "credits"> &
    Partial<Omit<Parameters<typeof planMb3mPayments>[0], "bookingId" | "invoiceNumber" | "invoiceAmount" | "credits">>
) {
  return planMb3mPayments({ remote: [], remoteReady: true, links: [], otherOpenBookings: 0, ...input });
}

describe("plan des règlements MB3M", () => {
  it("prend un crédit sans dossier quand le séjour est le seul", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 500,
      credits: [credit({ amount: 500 })],
    });
    assert.equal(row?.matched, 500);
    assert.equal(row?.attributeBooking, true);
    assert.equal(row?.existingNumber, null);
    assert.equal(row?.bank, "REVOLUT");
    assert.equal(row?.reference, `CRM ${CREDIT_ID}`);
  });

  it("lettre le minimum et ne pose le dossier que si le crédit tient", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 2274.96,
      credits: [credit()],
    });
    assert.equal(row?.matched, 2274.96);
    assert.equal(row?.attributeBooking, false);
  });

  it("laisse un crédit ambigu quand un autre séjour est ouvert", () => {
    const rows = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 2274.96,
      credits: [credit()],
      otherOpenBookings: 1,
    });
    assert.equal(rows.length, 0);
  });

  it("lettre le reste du règlement 2149 même si un autre séjour est ouvert", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "2156",
      invoiceAmount: 561.19,
      credits: [credit({ amount: 5330.29, date: "2026-10-15" })],
      otherOpenBookings: 1,
      remote: [
        {
          number: "2149",
          reference: "OZB",
          amount: 5330.29,
          date: "2026-10-15",
          invoiceNumber: "2148",
          unmatched: 561.19,
        },
      ],
    });
    assert.equal(row?.existingNumber, "2149");
    assert.equal(row?.matched, 561.19);
    assert.equal(row?.alreadyMatched, false);
    assert.equal(row?.attributeBooking, false);
  });

  it("prend le crédit déjà posé sur ce séjour", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 100,
      credits: [credit({ amount: 100, bookingId: BOOKING })],
      otherOpenBookings: 2,
    });
    assert.equal(row?.matched, 100);
    assert.equal(row?.attributeBooking, false);
  });

  it("ignore un crédit déjà lettré et ne réduit le reste qu’avec cette facture", () => {
    const rows = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 2274.96,
      credits: [credit(), credit({ id: "autre", amount: 100, date: "2026-10-31" })],
      links: [
        { transactionId: CREDIT_ID, paymentNumber: "2153", invoiceNumber: "2152", matchedAmount: 0 },
        { transactionId: "ailleurs", paymentNumber: "2148", invoiceNumber: "1000", matchedAmount: 2274.96 },
      ],
    });
    assert.deepEqual(rows.map((row) => row.credit.id), ["autre"]);
    assert.equal(rows[0]?.matched, 100);
  });

  it("reconnaît un règlement déjà saisi, par référence ou par jour et montant", () => {
    const byReference = plan({
      bookingId: BOOKING,
      invoiceNumber: "3000",
      invoiceAmount: 100,
      credits: [credit({ amount: 100 })],
      remote: [{ number: "2153", reference: `CRM ${CREDIT_ID}`, amount: 100, date: "2026-10-30", invoiceNumber: null, unmatched: 100 }],
    });
    assert.equal(byReference[0]?.existingNumber, "2153");
    assert.equal(byReference[0]?.alreadyMatched, false);
    const byAmount = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 2274.96,
      credits: [credit()],
      remote: [{ number: "2153", reference: "Saisi à la main", amount: 2639.96, date: "2026-10-30", invoiceNumber: "2152", unmatched: 0 }],
    });
    assert.equal(byAmount[0]?.existingNumber, "2153");
    assert.equal(byAmount[0]?.alreadyMatched, true);
    assert.equal(byAmount[0]?.matched, 2274.96);
  });

  it("lettre le reste d’un règlement déjà pointé sur une autre facture", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "2157",
      invoiceAmount: 561.19,
      credits: [credit({ amount: 5330.29, date: "2026-10-15" })],
      otherOpenBookings: 1,
      links: [{ transactionId: CREDIT_ID, paymentNumber: "2149", invoiceNumber: "2148", matchedAmount: 4769.1 }],
      remote: [
        {
          number: "2149",
          reference: "OZB",
          amount: 5330.29,
          date: "2026-10-15",
          invoiceNumber: "2148",
          unmatched: 561.19,
        },
      ],
    });
    assert.equal(row?.existingNumber, "2149");
    assert.equal(row?.matched, 561.19);
    assert.equal(row?.alreadyMatched, false);
  });

  it("dit qu’aucun règlement n’a été trouvé au lieu d’une liste vide", () => {
    const message = mb3mPaymentGapMessage("2157", 561.19);
    assert.match(message, /2157/);
    assert.match(message, /561,19/);
    assert.equal(mb3mIsPaymentGap(message), true);
    assert.equal(mb3mIsPaymentGap("Autre erreur"), false);
    assert.equal(withoutPaymentGap(`Déplacement impossible. ${message}`), "Déplacement impossible.");
  });

  it("lettre seulement le reste d’un règlement saisi à la main, sans le recréer", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "3000",
      invoiceAmount: 2000,
      credits: [credit({ amount: 5330.29, date: "2026-09-12" })],
      remote: [
        {
          number: "2149",
          reference: "OZB",
          amount: 5330.29,
          date: "2026-09-12",
          invoiceNumber: "2148",
          unmatched: 561.19,
        },
      ],
    });
    assert.equal(row?.existingNumber, "2149");
    assert.equal(row?.matched, 561.19);
    assert.equal(row?.alreadyMatched, false);
    assert.equal(row?.attributeBooking, false);
  });

  it("ne relettre pas un règlement déjà posé sur une autre facture", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "3000",
      invoiceAmount: 100,
      credits: [credit({ amount: 100 })],
      remote: [{ number: "2148", reference: "OZB", amount: 100, date: "2026-10-30", invoiceNumber: "2140", unmatched: 0 }],
    });
    assert.equal(row?.matched, 0);
    assert.equal(row?.lockedInvoice, "2140");
    assert.equal(row?.alreadyMatched, true);
  });

  it("n’envoie rien si la lecture des règlements échoue", () => {
    const [row] = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 100,
      credits: [credit({ amount: 100 })],
      remoteReady: false,
    });
    assert.equal(row?.hold, MB3M_PAYMENT_LOOKUP_HOLD);
    const retry = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 100,
      credits: [credit({ amount: 100 })],
      remoteReady: false,
      links: [{ transactionId: CREDIT_ID, paymentNumber: "2154", invoiceNumber: null, matchedAmount: 0 }],
    });
    assert.equal(retry[0]?.hold, null);
    assert.equal(retry[0]?.existingNumber, "2154");
  });

  it("garde un crédit sans société sur un séjour société", () => {
    const rows = mb3mWalletCreditRows("f9e5b60d-8731-40fb-bb62-d8bdb6dfc658", [
      {
        id: CREDIT_ID,
        booking_id: null,
        customer_id: "e05d2e16-ccd8-47e1-bb2c-538cce26a633",
        billing_company_id: null,
        amount: 2639.96,
        occurred_on: "2026-10-30",
        source: "revolut",
        label: "Virement",
        status: "posted",
        direction: "credit",
        currency: "EUR",
      },
      {
        id: "autre-societe",
        booking_id: null,
        customer_id: "e05d2e16-ccd8-47e1-bb2c-538cce26a633",
        billing_company_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        amount: 10,
        occurred_on: "2026-10-30",
        source: "revolut",
        label: "Autre",
        status: "posted",
        direction: "credit",
        currency: "EUR",
      },
    ]);
    assert.deepEqual(rows.map((row) => row.id), [CREDIT_ID]);
  });
});

describe("lettrage Amadeus après la facture CRM", () => {
  it("lettre d’abord la facture CRM, puis le reste sur la facture GDS", () => {
    const credits = [credit({ amount: 300 })];
    const primary = plan({
      bookingId: BOOKING,
      invoiceNumber: "2152",
      invoiceAmount: 100,
      credits,
    });
    const extra = planMb3mGdsMatchings({
      bookingId: BOOKING,
      crmInvoiceNumber: "2152",
      credits,
      primary,
      links: [],
      gdsInvoices: [
        { number: "3001", amount: 250 },
        { number: "3002", amount: 80 },
      ],
      otherOpenBookings: 0,
    });
    assert.equal(primary[0]?.matched, 100);
    assert.equal(primary[0]?.targetInvoice, null);
    assert.deepEqual(
      extra.map((row) => [row.targetInvoice, row.matched, row.existingNumber]),
      [
        ["3001", 200, null],
      ]
    );
  });
});

describe("envoi des règlements", () => {
  function planned(patch: Partial<Mb3mPlannedPayment> = {}): Mb3mPlannedPayment {
    return {
      credit: credit({ amount: 100 }),
      matched: 100,
      attributeBooking: true,
      existingNumber: null,
      alreadyMatched: false,
      lockedInvoice: null,
      hold: null,
      targetInvoice: null,
      bank: "REVOLUT",
      mode: "Virement",
      reference: `CRM ${CREDIT_ID}`,
      ...patch,
    };
  }

  it("crée le règlement, le lettre, puis pose le dossier", async () => {
    const calls: string[] = [];
    const rows = await applyMb3mPaymentPlans(
      { folderId: "01-0002007", invoiceNumber: "2152", plans: [planned()] },
      {
        savePayment: async (row) => {
          calls.push(`save:${row.credit.amount}`);
          return { number: "2154" };
        },
        writeMatching: async (row, number) => {
          calls.push(`match:${number}:${row.matched}`);
          return { id: "m-1" };
        },
        remember: async (_row, number, matchingId, settled) => {
          calls.push(`remember:${number}:${matchingId}:${settled}`);
        },
        attributeBooking: async (id) => {
          calls.push(`booking:${id}`);
        },
      }
    );
    assert.deepEqual(calls, [
      "save:100",
      "remember:2154::false",
      "match:2154:100",
      "remember:2154:m-1:true",
      `booking:${CREDIT_ID}`,
    ]);
    assert.equal(rows[0]?.statut, "envoye");
    assert.equal(rows[0]?.numero_mb3m, "2154");
  });

  it("ne rappelle pas SavePayment ni WriteMatching pour un règlement déjà lettré", async () => {
    let saved = 0;
    let matched = 0;
    const rows = await applyMb3mPaymentPlans(
      {
        folderId: "01-0002007",
        invoiceNumber: "2152",
        plans: [planned({ existingNumber: "2153", alreadyMatched: true, attributeBooking: false })],
      },
      {
        savePayment: async () => {
          saved += 1;
          return { number: "x" };
        },
        writeMatching: async () => {
          matched += 1;
          return { id: "x" };
        },
        remember: async () => undefined,
        attributeBooking: async () => undefined,
      }
    );
    assert.equal(saved, 0);
    assert.equal(matched, 0);
    assert.equal(rows[0]?.statut, "deja_dans_mb3m");
    assert.equal(rows[0]?.numero_mb3m, "2153");
  });

  it("lettre le reste d’un règlement déjà saisi sans le recréer", async () => {
    const calls: string[] = [];
    const rows = await applyMb3mPaymentPlans(
      {
        folderId: "01-0002007",
        invoiceNumber: "3000",
        plans: [planned({ matched: 561.19, existingNumber: "2149", attributeBooking: false, credit: credit({ amount: 5330.29, date: "2026-09-12" }) })],
      },
      {
        savePayment: async () => {
          calls.push("save");
          return { number: "x" };
        },
        writeMatching: async (row, number) => {
          calls.push(`match:${number}:${row.matched}`);
          return { id: "m-2149" };
        },
        remember: async () => undefined,
        attributeBooking: async () => {
          calls.push("booking");
        },
      }
    );
    assert.deepEqual(calls, ["match:2149:561.19"]);
    assert.equal(rows[0]?.statut, "deja_dans_mb3m");
    assert.equal(rows[0]?.montant, 561.19);
    assert.equal(rows[0]?.numero_mb3m, "2149");
  });

  it("garde l’erreur d’un règlement sans retirer les autres", async () => {
    const rows = await applyMb3mPaymentPlans(
      {
        folderId: "01-0002007",
        invoiceNumber: "2152",
        plans: [planned({ hold: MB3M_PAYMENT_LOOKUP_HOLD }), planned({ credit: credit({ id: "ok", amount: 40 }), matched: 40 })],
      },
      {
        savePayment: async () => ({ number: "1" }),
        writeMatching: async () => ({ id: "m" }),
        remember: async () => undefined,
        attributeBooking: async () => undefined,
      }
    );
    assert.equal(rows[0]?.statut, "erreur");
    assert.match(rows[0]?.erreur || "", /n’ont pas pu être lus/);
    assert.equal(rows[1]?.statut, "envoye");
  });
});

describe("phrase des règlements", () => {
  it("nomme le numéro MB3M", () => {
    const note = mb3mReglementNote([
      { montant: 2639.96, numero_mb3m: "2153", statut: "deja_dans_mb3m" },
      { montant: 10, numero_mb3m: null, statut: "erreur", erreur: "Refus." },
    ]);
    assert.match(note, /déjà dans MB3M \(n° 2153\)/);
    assert.ok(note.includes(formatMoney(2639.96)));
    assert.match(note, /Refus/);
  });
});
