import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import { AGENCY_FEE_LABEL } from "./agency-fee-rate";
import { COMMERCIAL_DISCOUNT_LABEL } from "./commercial-discount";
import {
  assertGroupedSelection,
  composeGroupedSections,
  groupedInvoiceClientMarks,
  groupedInvoiceDocument,
  groupedNumberIsLocal,
  nextGroupedNumber,
  payerKey,
  payerRefOf,
  type GroupedBookingRow,
} from "./grouped-invoice";
import { renderGroupedInvoicePdf } from "./grouped-invoice-pdf";
import { asError, GROUPED_INVOICE_MB3M_CALLS, GROUPED_INVOICE_SETUP } from "./grouped-invoice-run";
import { Mb3mError, mb3mSoap } from "./mb3m";
import type { SaleLedgerRow } from "./trip-costs";

const LAGOS = "11111111-1111-4111-8111-111111111111";
const LAGOS_FEE = "22222222-2222-4222-8222-222222222222";
const FRANKFURT = "33333333-3333-4333-8333-333333333333";
const NILOS = "44444444-4444-4444-8444-444444444444";
const CLIENT = "55555555-5555-4555-8555-555555555555";

function booking(id: string, reference: string, patch: Partial<GroupedBookingRow> = {}): GroupedBookingRow {
  return {
    id,
    reference,
    customer_id: CLIENT,
    billing_customer_id: CLIENT,
    payer_kind: "company",
    billing_company_id: NILOS,
    status: "confirmed",
    archived_at: null,
    currency: "EUR",
    agency_commission: false,
    ...patch,
  };
}

function debit(bookingId: string, id: string, label: string, amount: number, external: string | null, kind = "booking"): SaleLedgerRow {
  return {
    id,
    booking_id: bookingId,
    direction: "debit",
    kind,
    status: "posted",
    currency: "EUR",
    amount,
    label,
    external_id: external,
  };
}

test("trois dossiers d’un même payeur : commission gardée, remise négative, totaux", () => {
  const composed = composeGroupedSections([
    {
      bookingId: LAGOS,
      reference: "TB-2026-0211",
      destination: "Lagos",
      dates: "4 mars 2026 — 8 mars 2026",
      travelers: ["Camille Martin"],
      commission: false,
      discountEuros: 0,
      debits: [
        debit(LAGOS, "d1", "Hôtel Lagos", 4000, `booking:${LAGOS}:item:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`),
        debit(LAGOS, "d2", "Vol Lagos", 2000, `booking:${LAGOS}:item:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`),
      ],
      credits: [{ booking_id: LAGOS, direction: "credit", status: "posted", currency: "EUR", amount: 1000, label: "Acompte" }],
    },
    {
      bookingId: LAGOS_FEE,
      reference: "TB-2026-0212",
      destination: "Lagos",
      dates: "4 mars 2026 — 8 mars 2026",
      travelers: ["Camille Martin"],
      commission: true,
      discountEuros: 200,
      debits: [
        debit(LAGOS_FEE, "d3", "Séjour", 3300, null),
        debit(LAGOS_FEE, "d4", "Hôtel Lagos", 3000, `booking:${LAGOS_FEE}:item:cccccccc-cccc-4ccc-8ccc-cccccccccccc`),
        debit(LAGOS_FEE, "d5", AGENCY_FEE_LABEL, 300, `booking:${LAGOS_FEE}:agency-commission`, "adjustment"),
      ],
      credits: [
        { booking_id: LAGOS_FEE, direction: "credit", status: "posted", currency: "EUR", amount: 500, label: "Virement" },
        { booking_id: LAGOS_FEE, direction: "credit", status: "pending", currency: "EUR", amount: 900, label: "Pas encore reçu" },
        { booking_id: LAGOS_FEE, direction: "credit", status: "posted", currency: "USD", amount: 40, label: "Dollars" },
      ],
    },
    {
      bookingId: FRANKFURT,
      reference: "TB-2026-0077",
      destination: "Francfort",
      dates: "12 janv. 2026 — 14 janv. 2026",
      travelers: ["Camille Martin", "Louis Martin"],
      commission: false,
      discountEuros: 0,
      debits: [debit(FRANKFURT, "d6", "Train Francfort", 800, `booking:${FRANKFURT}:item:dddddddd-dddd-4ddd-8ddd-dddddddddddd`)],
      credits: [{ booking_id: FRANKFURT, direction: "credit", status: "posted", currency: "EUR", amount: 800, label: "Règlement" }],
    },
  ]);
  assert.equal("error" in composed, false);
  if ("error" in composed) return;
  const fee = composed.sections[1];
  assert.equal(fee.lines.some((line) => line.label === "Séjour"), false);
  assert.equal(fee.lines.some((line) => line.label === AGENCY_FEE_LABEL && line.amount === 300), true);
  assert.equal(fee.lines.some((line) => line.label.includes("10")), false);
  assert.equal(fee.lines.some((line) => line.label === COMMERCIAL_DISCOUNT_LABEL && line.amount === -200), true);
  assert.equal(fee.foreignPayments, true);
  const doc = groupedInvoiceDocument({
    number: "FG-2026-0007",
    billTo: ["Nilos France", "1 rue du Test", "75001 Paris"],
    payerLabel: "Nilos France",
    sections: composed.sections,
    now: new Date("2026-11-19T10:00:00.000Z"),
    wire: { iban: "FR7630006000011234567890189", bic: "REVOFRP2", holder: "Travel Business Agency", source: "revolut" },
  });
  assert.equal(doc.kicker, "Facture pro forma");
  assert.equal(doc.sections[0].subtotal, 6000);
  assert.equal(doc.sections[0].paid, 1000);
  assert.equal(doc.sections[0].balance, 5000);
  assert.equal(doc.sections[1].subtotal, 3100);
  assert.equal(doc.sections[1].paid, 500);
  assert.equal(doc.sections[1].balance, 2600);
  assert.equal(doc.sections[2].balance, 0);
  assert.equal(doc.total, 9900);
  assert.equal(doc.paid, 2300);
  assert.equal(doc.balance, 7600);
  assert.equal(groupedNumberIsLocal(doc.number), true);
  assert.equal(groupedInvoiceClientMarks(doc.clientText), null);
  assert.equal(doc.clientText.includes("MB3M"), false);
  assert.equal(doc.issuer.some((line) => line.includes("20291655")), false);
  assert.equal(doc.legal.some((line) => /IATA|APST/i.test(line)), false);
});

test("sans écriture de commission, la ligne n’est pas inventée", () => {
  const composed = composeGroupedSections([
    {
      bookingId: LAGOS,
      reference: "TB-2026-0211",
      destination: "Lagos",
      dates: "4 mars 2026",
      travelers: [],
      commission: false,
      discountEuros: 0,
      debits: [debit(LAGOS, "d1", "Hôtel", 100, `booking:${LAGOS}:item:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`)],
      credits: [],
    },
    {
      bookingId: LAGOS_FEE,
      reference: "TB-2026-0212",
      destination: "Lagos",
      dates: "4 mars 2026",
      travelers: [],
      commission: true,
      discountEuros: 0,
      debits: [debit(LAGOS_FEE, "d4", "Hôtel", 100, `booking:${LAGOS_FEE}:item:cccccccc-cccc-4ccc-8ccc-cccccccccccc`)],
      credits: [],
    },
  ]);
  assert.equal("error" in composed, false);
  if ("error" in composed) return;
  assert.equal(composed.sections[1].lines.some((line) => line.label === AGENCY_FEE_LABEL), false);
});

test("deux payeurs, un dossier seul, un dossier annulé : refus", () => {
  const company = booking(LAGOS, "TB-2026-0211");
  const personal = booking(FRANKFURT, "TB-2026-0077", { payer_kind: "personal", billing_company_id: null });
  assert.equal(payerKey(payerRefOf(company)) === payerKey(payerRefOf(personal)), false);
  assert.match(assertGroupedSelection([company, personal], CLIENT) || "", /même entité/);
  assert.match(assertGroupedSelection([company], CLIENT) || "", /au moins deux/);
  assert.match(assertGroupedSelection([company, booking(LAGOS_FEE, "TB-2026-0212", { status: "cancelled" })], CLIENT) || "", /annulé/);
  assert.equal(assertGroupedSelection([company, booking(LAGOS_FEE, "TB-2026-0212")], CLIENT), null);
});

test("le numéro local continue après les factures déjà prises, y compris retirées", () => {
  assert.equal(nextGroupedNumber(["FG-2026-0002", "FG-2025-0099", "FG-2026-0007"], 2026), "FG-2026-0008");
  assert.equal(nextGroupedNumber([], 2026), "FG-2026-0001");
});

function pdfDrawnText(buffer: Buffer) {
  const source = buffer.toString("latin1");
  let drawn = "";
  for (const match of source.matchAll(/stream\r?\n([\s\S]*?)\nendstream/g)) {
    let body = match[1];
    try {
      body = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      /* flux déjà en clair */
    }
    if (!body.includes(" Tj")) continue;
    for (const hex of body.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      drawn += `${Buffer.from(hex[1], "hex").toString("latin1")}\n`;
    }
  }
  return drawn;
}

test("le PDF groupé est une pro forma sans IATA, sans APST et sans logiciel de facturation", async () => {
  const pdf = Buffer.from(
    await renderGroupedInvoicePdf({
      number: "FG-2026-0007",
      billTo: ["Nilos France"],
      payerLabel: "Nilos France",
      sections: [
        {
          bookingId: LAGOS,
          reference: "TB-2026-0211",
          destination: "Lagos",
          dates: "4 mars 2026",
          travelers: ["Camille Martin"],
          commission: false,
          lines: [{ label: "Hôtel Lagos", amount: 4000 }],
          payments: [{ label: "Acompte", amount: 1000 }],
        },
        {
          bookingId: LAGOS_FEE,
          reference: "TB-2026-0212",
          destination: "Lagos",
          dates: "4 mars 2026",
          travelers: ["Camille Martin"],
          commission: true,
          lines: [
            { label: "Hôtel Lagos", amount: 3000 },
            { label: AGENCY_FEE_LABEL, amount: 300 },
            { label: COMMERCIAL_DISCOUNT_LABEL, amount: -200 },
          ],
          payments: [{ label: "Virement", amount: 500 }],
        },
        {
          bookingId: FRANKFURT,
          reference: "TB-2026-0077",
          destination: "Francfort",
          dates: "12 janv. 2026",
          travelers: ["Louis Martin"],
          commission: false,
          lines: [{ label: "Train Francfort", amount: 800 }],
          payments: [{ label: "Règlement", amount: 800 }],
        },
      ],
      now: new Date("2026-11-19T10:00:00.000Z"),
    })
  );
  const text = pdfDrawnText(pdf);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.match(text, /FACTURE PRO FORMA/);
  assert.match(text, /TB-2026-0211/);
  assert.match(text, /TB-2026-0212/);
  assert.match(text, /TB-2026-0077/);
  assert.match(text, /Commission d'agence/);
  assert.match(text, /Reste à payer|Reste a payer/);
  assert.equal(/IATA|APST|MB3M/.test(text), false);
});

test("la facture groupée ne lit pas usage_name sur crm_booking_travelers", () => {
  const files = [
    new URL("./grouped-invoice-run.ts", import.meta.url),
    new URL("./grouped-invoice.ts", import.meta.url),
    new URL("./grouped-invoice-pdf.ts", import.meta.url),
    new URL("../../app/api/admin/clients/[id]/facture-groupee/route.ts", import.meta.url),
    new URL("./mcp-registry.ts", import.meta.url),
  ];
  let seen = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const selects = [...source.matchAll(/from\("crm_booking_travelers"\)\s*\.select\(\s*"([^"]*)"/g)];
    seen += selects.length;
    for (const match of selects) {
      const columns = match[1].split(",").map((column) => column.trim());
      assert.equal(columns.includes("usage_name"), false, `${file.pathname} : ${match[1]}`);
    }
  }
  assert.equal(seen, 1);
});

test("une lecture des lignes de vente remonte le message de la base", () => {
  const missing = asError(
    { code: "42703", message: "column crm_booking_travelers.usage_name does not exist" },
    "Les lignes de vente ne sont pas lisibles."
  );
  assert.match(missing, /Les lignes de vente ne sont pas lisibles/);
  assert.match(missing, /usage_name does not exist/);
  assert.equal(
    asError({ code: "42P01", message: "relation crm_grouped_invoices does not exist" }, "Les dossiers ne sont pas lisibles."),
    GROUPED_INVOICE_SETUP
  );
  assert.equal(asError(null, "Les lignes de vente ne sont pas lisibles."), "Les lignes de vente ne sont pas lisibles.");
  const run = readFileSync(new URL("./grouped-invoice-run.ts", import.meta.url), "utf8");
  assert.match(run, /asError\(saleError, "Les lignes de vente ne sont pas lisibles\."\)/);
  assert.equal(run.includes('return fail(400, "Les lignes de vente ne sont pas lisibles.")'), false);
});

test("le CRM refuse d’imprimer, de valider ou de finaliser une pièce MB3M", async () => {
  for (const call of GROUPED_INVOICE_MB3M_CALLS) {
    assert.equal(/print|validate|finali|impress/i.test(call), false);
  }
  assert.equal(GROUPED_INVOICE_MB3M_CALLS.includes("FolderService/AddPieces"), true);
  const sent: string[] = [];
  const fetchImpl = async () => {
    sent.push("appel");
    return new Response("<ne-doit-pas-partir/>");
  };
  for (const action of ["Print", "Validate", "Finalize", "Imprimer", "Valider"]) {
    await assert.rejects(
      () => mb3mSoap("PieceService", "IPieceService", action, `<${action}/>`, fetchImpl),
      (error: unknown) => error instanceof Mb3mError && /pro forma/.test(error.message)
    );
  }
  await assert.rejects(
    () =>
      mb3mSoap(
        "FolderService",
        "IFolderService",
        "AddPieces",
        "<FolderAddPiecesRequest><Invoice><DatePrint>2026-01-01</DatePrint><Validate>true</Validate></Invoice></FolderAddPiecesRequest>",
        fetchImpl
      ),
    (error: unknown) => error instanceof Mb3mError && /DatePrint/.test(error.message)
  );
  assert.equal(sent.length, 0);
  const source = readFileSync(new URL("./grouped-invoice-run.ts", import.meta.url), "utf8");
  const piece = readFileSync(new URL("./grouped-invoice-mb3m.ts", import.meta.url), "utf8");
  assert.equal(source.includes("DatePrint"), false);
  assert.equal(source.includes("PrintedDate"), false);
  assert.equal(piece.includes("DatePrint"), false);
  assert.equal(piece.includes("CreditNote"), false);
  assert.equal(source.includes("visible_to_client: false"), true);
  assert.equal(source.includes("sendEmail"), false);
  assert.equal(source.includes("sendWhatsapp"), false);
  assert.equal(source.includes("from \"resend\""), false);
  const branch = source.indexOf('if (action === "mb3m")');
  const previewAt = source.indexOf("if (args.confirmer !== true)", branch);
  const pushAt = source.indexOf("await pushGroupedInvoiceToMb3m(", previewAt);
  assert.equal(branch > 0 && previewAt > branch && pushAt > previewAt, true);
});
