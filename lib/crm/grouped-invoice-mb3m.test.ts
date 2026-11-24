import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENCY_FEE_LABEL } from "./agency-fee-rate";
import {
  assembleGroupedMb3m,
  emitGroupedMb3mPiece,
  GROUPED_INVOICE_MB3M_CALLS,
  GROUPED_MB3M_MIGRATION,
  groupedSectionMarker,
  missingGroupedMb3mColumn,
  readGroupedMb3m,
  stampGroupedMb3mSection,
  writeGroupedMb3m,
  type GroupedMb3mDeps,
} from "./grouped-invoice-mb3m";
import type { Mb3mInvoiceContext } from "./mb3m-invoice";
import { MB3M_ACTIVITY } from "./mb3m-conform";
import { mb3mAddInvoice, Mb3mError, type Mb3mLine } from "./mb3m";
import {
  applyMb3mPaymentPlans,
  groupedMb3mPaymentWarning,
  planMb3mPayments,
  type Mb3mCredit,
} from "./mb3m-payments";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "30c1eaff-a968-4e1e-9387-05450e90e024";
const INVOICE = "22222222-2222-4222-8222-222222222222";
const DOSSIER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOSSIER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOSSIER_CREDIT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DOSSIER_CREDIT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WALLET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DEJA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const HORS = "99999999-9999-4999-8999-999999999999";

function payCredit(patch: Partial<Mb3mCredit> & Pick<Mb3mCredit, "id" | "amount" | "date">): Mb3mCredit {
  return {
    bookingId: null,
    customerId: CUSTOMER,
    billingCompanyId: null,
    source: "revolut",
    label: "Virement",
    ...patch,
  };
}

function fixtureCredits(): Mb3mCredit[] {
  return [
    payCredit({ id: DOSSIER_CREDIT_A, bookingId: DOSSIER_A, amount: 1000, date: "2026-11-02", label: "Virement dossier A" }),
    payCredit({ id: DOSSIER_CREDIT_B, bookingId: DOSSIER_B, amount: 500, date: "2026-11-03", label: "Virement dossier B" }),
    payCredit({
      id: WALLET,
      amount: 7198,
      date: "2026-11-18",
      source: "stripe",
      label: "Carte bancaire",
    }),
    payCredit({ id: DEJA, amount: 400, date: "2026-10-01", label: "Déjà lettré" }),
    payCredit({ id: HORS, bookingId: "autre-dossier", amount: 800, date: "2026-11-04", label: "Autre séjour" }),
  ];
}

const previous = {
  user: process.env.MB3M_API_USER,
  password: process.env.MB3M_API_PASSWORD,
  vercel: process.env.VERCEL_ENV,
  credit: process.env.MB3M_ALLOW_CREDIT_NOTE,
};

afterEach(() => {
  restore("MB3M_API_USER", previous.user);
  restore("MB3M_API_PASSWORD", previous.password);
  restore("VERCEL_ENV", previous.vercel);
  restore("MB3M_ALLOW_CREDIT_NOTE", previous.credit);
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function arm() {
  delete process.env.VERCEL_ENV;
  delete process.env.MB3M_ALLOW_CREDIT_NOTE;
  process.env.MB3M_API_USER = "agent@partner";
  process.env.MB3M_API_PASSWORD = "secret-value";
}

function line(partial: Partial<Mb3mLine> & Pick<Mb3mLine, "label" | "netPriceUnit">): Mb3mLine {
  return {
    quantity: 1,
    netPriceTotal: partial.netPriceUnit,
    type: "Standard",
    ...partial,
  };
}

function context(partial: {
  reference: string;
  destination: string;
  dateStart: string;
  dateEnd: string;
  travelers: { firstName: string; lastName: string }[];
  lines: Mb3mInvoiceContext["lines"];
}): Mb3mInvoiceContext {
  return {
    bookingId: partial.reference,
    reference: partial.reference,
    title: partial.destination,
    currency: "EUR",
    amount: partial.lines.reduce((sum, row) => sum + row.amount, 0),
    dateStart: partial.dateStart,
    dateEnd: partial.dateEnd,
    destination: partial.destination,
    destinationIso: "NG",
    payerKind: "company",
    customerId: CUSTOMER,
    person: null,
    company: {
      id: COMPANY,
      name: "NILOS FRANCE SAS",
      commercialName: "NILOS FRANCE SAS",
      email: "compta@nilos.example",
      phoneNumber: null,
      countryCode: "FR",
      siret: "12345678900011",
      address: {
        name: "NILOS FRANCE SAS",
        line1: "1 rue de la Paix",
        postalCode: "75002",
        city: "Paris",
        countryCode: "FR",
      },
    },
    travelers: partial.travelers,
    visibleToClient: false,
    configured: true,
    lines: partial.lines,
    notice: null,
    hadExpenses: partial.lines.length > 0,
  };
}

const lagosHotel = {
  transactionId: "hotel-211",
  label: "Hôtel Lagos",
  amount: 4000,
  activityId: MB3M_ACTIVITY.hotel,
  margin: 400,
  providerId: null,
  note: null,
};

const lagosFee = {
  transactionId: "fee-212",
  label: AGENCY_FEE_LABEL,
  amount: 300,
  activityId: null,
  customCode: "13" as const,
  agencyProvider: true,
  margin: null,
  note: null,
};

function nilosContexts() {
  return [
    context({
      reference: "TB-2026-0211",
      destination: "Lagos",
      dateStart: "2026-03-04",
      dateEnd: "2026-03-08",
      travelers: [{ firstName: "Camille", lastName: "Martin" }],
      lines: [lagosHotel],
    }),
    context({
      reference: "TB-2026-0212",
      destination: "Lagos",
      dateStart: "2026-03-04",
      dateEnd: "2026-03-08",
      travelers: [{ firstName: "Camille", lastName: "Martin" }],
      lines: [
        { ...lagosHotel, transactionId: "hotel-212", amount: 3000, margin: 300 },
        lagosFee,
      ],
    }),
    context({
      reference: "TB-2026-0077",
      destination: "Francfort",
      dateStart: "2026-01-12",
      dateEnd: "2026-01-13",
      travelers: [{ firstName: "Louis", lastName: "Martin" }],
      lines: [
        {
          transactionId: "rail-77",
          label: "Train Francfort",
          amount: 800,
          activityId: MB3M_ACTIVITY.rail,
          margin: 80,
          note: null,
        },
      ],
    }),
  ];
}

describe("pièce MB3M de la facture groupée", () => {
  it("regroupe les lignes par dossier, avec la commission du livre sans pourcentage", () => {
    const built = assembleGroupedMb3m(nilosContexts());
    assert.deepEqual(
      [...new Set(built.dossiers)],
      ["TB-2026-0211", "TB-2026-0212", "TB-2026-0077"]
    );
    const first = built.lines[0];
    assert.match(first?.note || "", /TB-2026-0211/);
    assert.match(first?.note || "", /Lagos/);
    assert.match(first?.note || "", /Camille Martin/);
    assert.equal(first?.activityId, MB3M_ACTIVITY.hotel);
    const fee = built.lines.find((row) => row.type === "Custom");
    assert.equal(fee?.label.startsWith(AGENCY_FEE_LABEL), true);
    assert.match(fee?.label || "", /TB-2026-0212/);
    assert.equal(fee?.customType?.lineType, 4);
    assert.equal(/%|IATA|APST/.test(built.lines.map((row) => `${row.label} ${row.note || ""}`).join(" ")), false);
    const frankfurt = built.lines.find((row) => row.label === "Train Francfort");
    assert.equal(frankfurt?.activityId, MB3M_ACTIVITY.land);
    assert.match(frankfurt?.note || "", /TB-2026-0077/);
    assert.match(frankfurt?.note || "", /Francfort/);
    assert.match(frankfurt?.note || "", /Louis Martin/);
    assert.equal(built.dateStart, "2026-01-12");
    assert.equal(built.dateEnd, "2026-03-08");
    assert.deepEqual(
      built.travelers.map((row) => row.firstName),
      ["Camille", "Louis"]
    );
  });

  it("pose le repère complet sur un frais quand le dossier n’a pas d’autre ligne", () => {
    const marker = groupedSectionMarker({
      reference: "TB-2026-0212",
      destination: "Lagos",
      dates: "4 mars 2026",
      travelers: ["Camille Martin"],
    });
    const [stamped] = stampGroupedMb3mSection(marker, [
      line({
        label: AGENCY_FEE_LABEL,
        netPriceUnit: 300,
        netPriceTotal: 300,
        type: "Custom",
        customType: { complementary: "13", lineType: 4 },
        providerRole: "agency",
      }),
    ]);
    assert.match(stamped?.label || "", new RegExp(`^${AGENCY_FEE_LABEL}`));
    assert.match(stamped?.label || "", /TB-2026-0212/);
    assert.match(stamped?.label || "", /Camille Martin/);
    assert.equal(/%/.test(stamped?.label || ""), false);
  });

  it("crée une pro forma sans champ d’impression et reprend la société déjà liée", async () => {
    arm();
    const calls: string[] = [];
    let body = "";
    const deps = fakeDeps({
      linkedCompany: async () => {
        calls.push("lien");
        return { uid: "ac53a900-3ab4-4e41-bfce-0af005dfde72" };
      },
      findCompanies: async () => {
        calls.push("recherche");
        return [];
      },
      saveCompany: async () => {
        calls.push("creation-societe");
        return { uid: "nope", partnerId: "" };
      },
      addInvoice: async (input) => {
        calls.push("ajout");
        assert.equal(input.customerUid, "ac53a900-3ab4-4e41-bfce-0af005dfde72");
        assert.equal(input.refCommand, "FG-2026-0002");
        assert.equal(input.replacesNumber, undefined);
        const created = await mb3mAddInvoice(input, async (_url, init) => {
          body = String(init?.body);
          assert.equal(String(new Headers(init?.headers).get("SOAPAction")), '"http://schemas.mb3m.fr/Partners/IFolderService/AddPieces"');
          return new Response(
            `<FolderOperationResponse><ResultCode>1</ResultCode><Invoices><Invoice><Number>4542</Number><Uid>b0ffa2ce-0adb-4ba9-8214-202609141014</Uid></Invoice></Invoices></FolderOperationResponse>`
          );
        });
        return created;
      },
    });
    const pushed = await emitGroupedMb3mPiece(
      {
        customerId: CUSTOMER,
        invoiceId: INVOICE,
        number: "FG-2026-0002",
        contexts: nilosContexts(),
        previous: { pieceNumber: null, folderId: null, customerUid: null },
      },
      deps
    );
    assert.equal(pushed.number, "4542");
    assert.equal(calls.includes("creation-societe"), false);
    assert.equal(calls.includes("recherche"), false);
    assert.equal(calls.includes("ajout"), true);
    assert.equal(/<(?:DatePrint|PrintedDate|Validate|Finalize|Validation|CreditNote)\b/i.test(body), false);
    assert.match(body, /TB-2026-0211/);
    assert.match(body, /TB-2026-0077/);
    assert.equal(body.includes("%"), false);
  });

  it("cherche puis crée la société quand aucun lien n’existe", async () => {
    arm();
    const calls: string[] = [];
    const deps = fakeDeps({
      linkedCompany: async () => null,
      findCompanies: async () => {
        calls.push("recherche");
        return [
          {
            uid: "doublon-1",
            name: "NILOS FRANCE SAS",
            altName: "",
            company: true,
            email: "autre@nilos.example",
          },
          {
            uid: "doublon-2",
            name: "NILOS FRANCE SAS",
            altName: "",
            company: true,
            email: "encore@nilos.example",
          },
        ];
      },
      saveCompany: async (draft) => {
        calls.push(`creation:${draft.name}`);
        return { uid: "societe-creee", partnerId: "NILOS" };
      },
      addInvoice: async () => {
        calls.push("ajout");
        throw new Error("ne doit pas partir");
      },
    });
    await assert.rejects(
      () =>
        emitGroupedMb3mPiece(
          {
            customerId: CUSTOMER,
            invoiceId: INVOICE,
            number: "FG-2026-0002",
            contexts: nilosContexts(),
            previous: { pieceNumber: null, folderId: null, customerUid: null },
          },
          deps
        ),
      /n’en a pas choisi une/
    );
    assert.deepEqual(calls, ["recherche"]);

    const created = fakeDeps({
      linkedCompany: async () => null,
      findCompanies: async () => [],
      saveCompany: async (draft) => {
        calls.push(`creation:${draft.name}`);
        assert.equal(draft.name, "NILOS FRANCE SAS");
        return { uid: "societe-creee", partnerId: "NILOS" };
      },
      rememberCompany: async (input) => {
        calls.push(`memoire:${input.uid}`);
      },
      addInvoice: async (input) => {
        assert.equal(input.customerUid, "societe-creee");
        return { number: "4543", uid: "uid-piece" };
      },
    });
    const pushed = await emitGroupedMb3mPiece(
      {
        customerId: CUSTOMER,
        invoiceId: INVOICE,
        number: "FG-2026-0002",
        contexts: nilosContexts(),
        previous: { pieceNumber: null, folderId: null, customerUid: null },
      },
      created
    );
    assert.equal(pushed.number, "4543");
    assert.equal(calls.includes("creation:NILOS FRANCE SAS"), true);
    assert.equal(calls.includes("memoire:societe-creee"), true);
  });

  it("ne remplace pas une pièce imprimée, et lettre les règlements sur elle", async () => {
    arm();
    const calls: string[] = [];
    const payments: { invoiceNumber: string; balance: number | null; folderId: string; bookingIds: string[] }[] = [];
    const deps = fakeDeps({
      findPiece: async () => "printed",
      readLettrage: async () => ({ lettered: true, amount: 8000, balance: 7198, seen: true }),
      saveCompany: async () => {
        calls.push("societe");
        return { uid: "x", partnerId: "" };
      },
      saveFolder: async () => {
        calls.push("dossier");
        return { id: "22-1", uid: "f" };
      },
      addInvoice: async () => {
        calls.push("ajout");
        return { number: "9", uid: "" };
      },
      cancelInvoice: async () => {
        calls.push("annulation");
      },
      recordPayments: async (input) => {
        payments.push({
          invoiceNumber: input.invoiceNumber,
          balance: input.balance,
          folderId: input.folderId,
          bookingIds: input.bookingIds,
        });
        return [];
      },
    });
    const pushed = await emitGroupedMb3mPiece(
      {
        customerId: CUSTOMER,
        invoiceId: INVOICE,
        number: "FG-2026-0002",
        contexts: nilosContexts(),
        previous: { pieceNumber: "2218", folderId: "22-1", customerUid: "deja" },
      },
      deps
    );
    assert.deepEqual(calls, []);
    assert.equal(pushed.replaced, false);
    assert.equal(pushed.number, "2218");
    assert.match(pushed.avertissement || "", /2218/);
    assert.match(pushed.avertissement || "", /imprimée/);
    assert.equal(payments.length, 1);
    assert.equal(payments[0]?.invoiceNumber, "2218");
    assert.equal(payments[0]?.balance, 7198);
    assert.equal(payments[0]?.folderId, "22-1");
    assert.deepEqual(payments[0]?.bookingIds, ["TB-2026-0211", "TB-2026-0212", "TB-2026-0077"]);
  });

  it("remplace une pro forma ouverte, puis retire l’ancienne", async () => {
    arm();
    const calls: string[] = [];
    const deps = fakeDeps({
      findPiece: async (number) => {
        calls.push(`lecture:${number}`);
        return "open";
      },
      addInvoice: async (input) => {
        calls.push(`ajout:${input.replacesNumber}`);
        return { number: "4600", uid: "uid-nouvelle" };
      },
      cancelInvoice: async (_folder, number) => {
        calls.push(`annulation:${number}`);
      },
    });
    const pushed = await emitGroupedMb3mPiece(
      {
        customerId: CUSTOMER,
        invoiceId: INVOICE,
        number: "FG-2026-0002",
        contexts: nilosContexts(),
        previous: { pieceNumber: "4542", folderId: "22-0000025", customerUid: "client-connu" },
      },
      deps
    );
    assert.equal(pushed.replaced, true);
    assert.equal(pushed.number, "4600");
    assert.deepEqual(calls, ["lecture:4542", "ajout:4542", "annulation:4542"]);
  });

  it("retire la nouvelle pro forma si l’ancienne ne s’annule pas", async () => {
    arm();
    const cancelled: string[] = [];
    const deps = fakeDeps({
      findPiece: async () => "open",
      addInvoice: async () => ({ number: "4601", uid: "uid" }),
      cancelInvoice: async (_folder, number) => {
        cancelled.push(number);
        if (number === "4542") throw new Mb3mError("MB3M refuse l’annulation.", -1);
      },
    });
    await assert.rejects(
      () =>
        emitGroupedMb3mPiece(
          {
            customerId: CUSTOMER,
            invoiceId: INVOICE,
            number: "FG-2026-0002",
            contexts: nilosContexts(),
            previous: { pieceNumber: "4542", folderId: "22-1", customerUid: "client" },
          },
          deps
        ),
      /4542/
    );
    assert.deepEqual(cancelled, ["4542", "4601"]);
  });

  it("ne remplace pas une pro forma groupée déjà lettrée, et s’arrête si la lecture échoue", async () => {
    arm();
    const blocked = async (read: GroupedMb3mDeps["readLettrage"]) => {
      const calls: string[] = [];
      const deps = fakeDeps({
        findPiece: async () => "open",
        readLettrage: read,
        saveFolder: async () => {
          calls.push("dossier");
          return { id: "22-1", uid: "f" };
        },
        addInvoice: async () => {
          calls.push("ajout");
          return { number: "9", uid: "" };
        },
        cancelInvoice: async () => {
          calls.push("annulation");
        },
      });
      const pushed = await emitGroupedMb3mPiece(
        {
          customerId: CUSTOMER,
          invoiceId: INVOICE,
          number: "FG-2026-0002",
          contexts: nilosContexts(),
          previous: { pieceNumber: "4542", folderId: "22-0000025", customerUid: "client-connu" },
        },
        deps
      );
      return { calls, pushed };
    };
    const lettered = await blocked(async () => ({ lettered: true, amount: 5404.15, balance: 0, seen: true }));
    assert.deepEqual(lettered.calls, []);
    assert.equal(lettered.pushed.replaced, false);
    assert.equal(lettered.pushed.number, "4542");
    assert.equal(lettered.pushed.statut, "bloque_lettrage");
    assert.match(lettered.pushed.avertissement || "", /4542/);
    assert.match(lettered.pushed.avertissement || "", /pas remplacée/);
    const unread = await blocked(async () => {
      throw new Error("lecture impossible");
    });
    assert.deepEqual(unread.calls, []);
    assert.equal(unread.pushed.statut, "avertissement");
    assert.match(unread.pushed.avertissement || "", /vérification du lettrage est impossible/);
    assert.equal(unread.pushed.replaced, false);
  });

  it("n’enregistre pas le numéro si la colonne n’est pas encore là", async () => {
    const missing = { code: "42703", message: "column mb3m_piece_number does not exist" };
    assert.equal(missingGroupedMb3mColumn(missing), true);
    const admin = fakeAdmin(missing);
    const read = await readGroupedMb3m(admin, INVOICE);
    assert.equal(read.available, false);
    assert.equal(read.pieceNumber, null);
    const stored = await writeGroupedMb3m(admin, INVOICE, { pieceNumber: "4542", error: null });
    assert.equal(stored, false);
    assert.match(GROUPED_MB3M_MIGRATION, /20261119201000_crm_grouped_invoice_mb3m\.sql$/);
  });

  it("interdit l’impression, la validation, la finalisation et l’avoir", () => {
    const source = readFileSync(new URL("./grouped-invoice-mb3m.ts", import.meta.url), "utf8");
    assert.equal(source.includes("DatePrint"), false);
    assert.equal(source.includes("PrintedDate"), false);
    assert.equal(source.includes("CreditNote"), false);
    assert.equal(source.includes("mb3mAddCreditNote"), false);
    assert.equal(source.includes("mb3mRenderPiece"), false);
    assert.equal(source.includes("sendEmail"), false);
    assert.equal(source.includes("whatsapp"), false);
    assert.equal(/IATA|APST/.test(source), false);
    assert.match(source, /recordMb3mInvoicePayments/);
    assert.match(source, /grouped:\s*true/);
    for (const call of GROUPED_INVOICE_MB3M_CALLS) {
      assert.equal(/print|validate|finali|impress/i.test(call), false);
    }
    assert.equal(GROUPED_INVOICE_MB3M_CALLS.includes("FolderService/AddPieces"), true);
    assert.equal(GROUPED_INVOICE_MB3M_CALLS.includes("FolderService/SavePayment"), true);
    assert.equal(GROUPED_INVOICE_MB3M_CALLS.includes("PieceService/WriteMatching"), true);
    const run = readFileSync(new URL("./grouped-invoice-run.ts", import.meta.url), "utf8");
    const guard = run.slice(run.indexOf("async function guardGroupedMb3m"), run.indexOf("async function syncGroupedMb3m"));
    assert.equal(guard.includes("groupedMb3mPrintedMessage"), false);
    assert.equal(/imprimée/.test(guard), false);
  });

  it("envoie les règlements de plusieurs dossiers et du portefeuille sur la pièce groupée", async () => {
    arm();
    const saved: { id: string; mode: string; amount: number }[] = [];
    const matched: { payment: string; invoice: string; amount: number }[] = [];
    let cap = 0;
    const deps = fakeDeps({
      recordPayments: async (input) => {
        cap = input.invoiceAmount;
        assert.equal(input.folderId, "22-0000099");
        assert.equal(input.customerUid, "client-connu");
        assert.equal(input.invoiceNumber, "4542");
        assert.equal(input.balance, input.invoiceAmount);
        assert.ok((input.invoiceAmount || 0) > 0);
        const plans = planMb3mPayments({
          bookingId: DOSSIER_A,
          bookingIds: [DOSSIER_A, DOSSIER_B],
          includeWallet: true,
          attributeWallet: false,
          invoiceNumber: input.invoiceNumber,
          invoiceAmount: input.invoiceAmount,
          maxLetter: input.balance,
          credits: fixtureCredits(),
          otherOpenBookings: 2,
          links: [
            {
              transactionId: DEJA,
              paymentNumber: "2100",
              invoiceNumber: "1999",
              matchedAmount: 400,
            },
          ],
          remote: [
            {
              number: "2100",
              reference: "CRM deja",
              amount: 400,
              date: "2026-11-01",
              invoiceNumber: "1999",
              unmatched: 0,
            },
          ],
          remoteReady: true,
        });
        return applyMb3mPaymentPlans(
          { folderId: input.folderId, invoiceNumber: input.invoiceNumber, plans },
          {
            savePayment: async (plan) => {
              saved.push({ id: plan.credit.id, mode: plan.mode, amount: plan.credit.amount });
              assert.notEqual(plan.mode, "OnlinePaymentCard");
              return { number: `R-${plan.credit.id}` };
            },
            writeMatching: async (plan, paymentNumber) => {
              matched.push({ payment: paymentNumber, invoice: input.invoiceNumber, amount: plan.matched });
              return { id: `M-${plan.credit.id}` };
            },
            remember: async () => undefined,
            attributeBooking: async () => {
              throw new Error("le portefeuille ne doit pas être posé sur un dossier");
            },
          }
        );
      },
    });
    const contexts = nilosContexts();
    contexts[0] = { ...contexts[0], bookingId: DOSSIER_A };
    contexts[1] = { ...contexts[1], bookingId: DOSSIER_B };
    const pushed = await emitGroupedMb3mPiece(
      {
        customerId: CUSTOMER,
        invoiceId: INVOICE,
        number: "FG-2026-0010",
        contexts,
        previous: { pieceNumber: null, folderId: null, customerUid: "client-connu" },
      },
      deps
    );
    assert.equal(pushed.number, "4542");
    assert.equal(pushed.statut, undefined);
    assert.deepEqual(
      saved.map((row) => row.id).sort(),
      [DOSSIER_CREDIT_A, DOSSIER_CREDIT_B, WALLET].sort()
    );
    assert.equal(saved.some((row) => row.id === DEJA), false);
    assert.equal(saved.find((row) => row.id === WALLET)?.mode, "PaymentCard");
    assert.equal(matched.length, 3);
    assert.ok(matched.every((row) => row.invoice === "4542" && row.amount > 0));
    const lettered = matched.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(lettered, Math.min(1000 + 500 + 7198, cap));
    assert.ok(lettered <= cap + 0.001);
    const wallet = matched.find((row) => row.payment === `R-${WALLET}`);
    assert.ok(wallet && wallet.amount > 0 && wallet.amount <= 7198);
  });

  it("ne renvoie pas un crédit déjà enregistré et plafonne le lettrage au solde", async () => {
    const links = [
      { transactionId: WALLET, paymentNumber: "2240", invoiceNumber: "2001", matchedAmount: 7198 },
      { transactionId: DEJA, paymentNumber: "2100", invoiceNumber: "1999", matchedAmount: 400 },
    ];
    const remote = [
      {
        number: "2240",
        reference: `CRM ${WALLET}`,
        amount: 7198,
        date: "2026-11-18",
        invoiceNumber: "2001",
        unmatched: 0,
      },
      {
        number: "2100",
        reference: `CRM ${DEJA}`,
        amount: 400,
        date: "2026-10-01",
        invoiceNumber: "1999",
        unmatched: 0,
      },
    ];
    const skipped = planMb3mPayments({
      bookingId: DOSSIER_A,
      bookingIds: [DOSSIER_A, DOSSIER_B],
      includeWallet: true,
      attributeWallet: false,
      invoiceNumber: "2248",
      invoiceAmount: 20000,
      credits: fixtureCredits(),
      otherOpenBookings: 3,
      links,
      remote,
      remoteReady: true,
    });
    assert.equal(skipped.some((row) => row.credit.id === WALLET), false);
    assert.equal(skipped.some((row) => row.credit.id === DEJA), false);
    assert.equal(skipped.some((row) => row.credit.id === HORS), false);
    const capped = planMb3mPayments({
      bookingId: DOSSIER_A,
      bookingIds: [DOSSIER_A, DOSSIER_B],
      includeWallet: true,
      attributeWallet: false,
      invoiceNumber: "2248",
      invoiceAmount: 20000,
      maxLetter: 300,
      credits: fixtureCredits().filter((row) => row.id !== DEJA),
      otherOpenBookings: 1,
      links: [],
      remote: [],
      remoteReady: true,
    });
    assert.equal(capped.length, 1);
    assert.equal(capped[0]?.matched, 300);
    assert.equal(capped[0]?.attributeBooking, false);
    const matchedAmounts: number[] = [];
    const reglements = await applyMb3mPaymentPlans(
      { folderId: "22-0002248", invoiceNumber: "2248", plans: capped },
      {
        savePayment: async (plan) => {
          assert.equal(plan.mode, "BankTransfer");
          assert.notEqual(plan.mode, "OnlinePaymentCard");
          return { number: "3001" };
        },
        writeMatching: async (plan) => {
          matchedAmounts.push(plan.matched);
          return { id: "lettrage" };
        },
        remember: async () => undefined,
        attributeBooking: async () => undefined,
      }
    );
    assert.deepEqual(matchedAmounts, [300]);
    assert.equal(reglements[0]?.statut, "envoye");
    assert.equal(reglements[0]?.montant, 300);
    assert.equal(reglements[0]?.numero_mb3m, "3001");
  });

  it("un échec de règlement ou de lettrage laisse la facture groupée", async () => {
    const plans = planMb3mPayments({
      bookingId: DOSSIER_A,
      bookingIds: [DOSSIER_A],
      includeWallet: true,
      attributeWallet: false,
      invoiceNumber: "2248",
      invoiceAmount: 1000,
      maxLetter: 1000,
      credits: [fixtureCredits()[0]],
      otherOpenBookings: 0,
      links: [],
      remote: [],
      remoteReady: true,
    });
    const failed = await applyMb3mPaymentPlans(
      { folderId: "22-1", invoiceNumber: "2248", plans },
      {
        savePayment: async () => {
          throw new Error("MB3M refuse le règlement.");
        },
        writeMatching: async () => ({ id: "non" }),
        remember: async () => undefined,
        attributeBooking: async () => undefined,
      }
    );
    const warning = groupedMb3mPaymentWarning(failed);
    assert.match(warning || "", /n’a pas été envoyé sur la facture groupée/);
    assert.match(warning || "", /MB3M refuse le règlement/);
    assert.match(warning || "", /reste en place/);
    arm();
    const deps = fakeDeps({
      recordPayments: async () => {
        throw new Error("Le lettrage n’a pas abouti.");
      },
    });
    const pushed = await emitGroupedMb3mPiece(
      {
        customerId: CUSTOMER,
        invoiceId: INVOICE,
        number: "FG-2026-0010",
        contexts: nilosContexts(),
        previous: { pieceNumber: null, folderId: null, customerUid: "client-connu" },
      },
      deps
    );
    assert.equal(pushed.number, "4542");
    assert.equal(pushed.replaced, false);
    assert.match(pushed.avertissement || "", /lettrage n’a pas abouti/);
    assert.match(pushed.avertissement || "", /reste en place/);
  });
});

function fakeDeps(partial: Partial<GroupedMb3mDeps>): GroupedMb3mDeps {
  return {
    linkedCompany: async () => ({ uid: "client-connu" }),
    findCompanies: async () => [],
    rememberCompany: async () => undefined,
    saveCompany: async () => {
      throw new Error("création société inattendue");
    },
    savePerson: async () => {
      throw new Error("création personne inattendue");
    },
    saveFolder: async (input) => ({ id: input.id || "22-0000099", uid: "dossier-uid" }),
    addInvoice: async () => ({ number: "4542", uid: "piece-uid" }),
    findPiece: async () => "missing",
    readLettrage: async () => ({ lettered: false, amount: null, balance: null, seen: true }),
    cancelInvoice: async () => undefined,
    agencyUid: async () => null,
    ...partial,
  };
}

function fakeAdmin(error: { code: string; message: string }) {
  const query = {
    select() {
      return query;
    },
    update() {
      return query;
    },
    eq() {
      return query;
    },
    maybeSingle: async () => ({ data: null, error }),
    then(resolve: (value: { data: null; error: typeof error }) => void) {
      resolve({ data: null, error });
    },
  };
  return { from: () => query } as unknown as SupabaseClient;
}
