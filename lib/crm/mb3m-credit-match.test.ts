import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  companyMatchKey,
  invoiceNumberKey,
  labelCitesInvoice,
  labelNamesCompany,
  mb3mCreditMatchContext,
  unattachedCreditBelongsToFolder,
  type Mb3mCreditPeer,
} from "./mb3m-credit-match";

const BEELYNQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LYNQ = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const KIM =
  "Virement Revolut Beelynq L.l.c. — Pagese e fatures N:002203 -Business traveling Kim Atias";

const lynqPeer: Mb3mCreditPeer = {
  invoiceNumbers: ["2147"],
  billingCompanyId: LYNQ,
  companyName: "LYNQ CONSULTING",
};
const beelynqPeer: Mb3mCreditPeer = {
  invoiceNumbers: ["2203"],
  billingCompanyId: BEELYNQ,
  companyName: "BEELYNQ LLC",
};

describe("numéro de facture dans le libellé", () => {
  it("ignore les zéros de tête des deux côtés", () => {
    assert.equal(invoiceNumberKey("002203"), "2203");
    assert.equal(invoiceNumberKey("2203"), "2203");
    assert.equal(labelCitesInvoice("N:002203", "2203", 2767.61), true);
    assert.equal(labelCitesInvoice("facture 2203", "002203", 100), true);
  });

  it("accepte N:, le numéro seul, facture, N°, FA et F avec des zéros", () => {
    const amount = 100;
    for (const label of ["N:002203", "002203", "facture 2203", "N°2203", "FA2203", "F002203"]) {
      assert.equal(labelCitesInvoice(label, "2203", amount), true, label);
    }
    assert.equal(labelCitesInvoice("Facture n° 2203", "2203", amount), true);
    assert.equal(labelCitesInvoice("N: 002203", "2203", amount), true);
  });

  it("refuse un numéro plus long, plus court, collé, un montant, une date ou le montant du crédit", () => {
    const amount = 2203;
    for (const label of ["22030", "ref 220", "AB2203", "2203B", "2203,50", "2203.50", "2 203,50"]) {
      assert.equal(labelCitesInvoice(label, "2203", amount), false, label);
    }
    assert.equal(labelCitesInvoice("départ 22/03/2026", "2203", 100), false);
    assert.equal(labelCitesInvoice("départ 22.03.2026", "2203", 100), false);
    assert.equal(labelCitesInvoice("départ 2026-03-22", "2203", 100), false);
    assert.equal(labelCitesInvoice("départ 2026-03-22", "2026", 100), false);
    assert.equal(labelCitesInvoice("Virement 2203", "2203", 2203), false);
    assert.equal(labelCitesInvoice("Virement 2 203,00", "2203", 2203), false);
    assert.equal(labelCitesInvoice("Virement 2767,61", "2767", 2767.61), false);
    assert.equal(labelCitesInvoice("Virement 2 767,61", "2767", 2767.61), false);
    assert.equal(labelCitesInvoice("Virement 2767.61", "767", 2767.61), false);
    assert.equal(labelCitesInvoice("facture 2203", "2203", 2203), true);
    assert.equal(labelCitesInvoice("N:002203", "2203", 2203), true);
    assert.equal(labelCitesInvoice("002203", "2203", 2203), true);
  });
});

describe("société dans le libellé", () => {
  it("ignore la casse, les accents et la forme juridique", () => {
    assert.equal(companyMatchKey("BEELYNQ LLC"), "beelynq");
    assert.equal(companyMatchKey("Beelynq L.l.c."), "beelynq");
    assert.equal(companyMatchKey("Beelynq S.A.R.L."), "beelynq");
    assert.equal(companyMatchKey("Société Générale SAS"), "societe generale");
    assert.equal(companyMatchKey("Acme Ltd"), "acme");
    assert.equal(companyMatchKey("Acme Inc."), "acme");
    assert.equal(companyMatchKey("Acme GmbH"), "acme");
    assert.equal(labelNamesCompany("paiement Acme Ltd.", "ACME GMBH"), true);
    assert.equal(labelNamesCompany("Virement Beelynq L.l.c.", "BEELYNQ LLC"), true);
    assert.equal(labelNamesCompany("Virement Société Générale", "Societe Generale SAS"), true);
    assert.equal(labelNamesCompany(KIM, "LYNQ CONSULTING"), false);
    assert.equal(labelNamesCompany("Beelynq L.l.c.", "LYNQ"), false);
  });
});

describe("crédit sans dossier", () => {
  it("donne le virement Beelynq à la facture 2203, pas à Lynq 2147", () => {
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: KIM,
        amount: 2767.61,
        billingCompanyId: null,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [lynqPeer],
      }),
      true
    );
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: KIM,
        amount: 2767.61,
        billingCompanyId: null,
        invoiceNumber: "2147",
        folderCompanyId: LYNQ,
        folderCompanyName: "LYNQ CONSULTING",
        peers: [beelynqPeer],
      }),
      false
    );
  });

  it("prend le numéro seul, puis la société seule", () => {
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: "Encaissement 002203",
        amount: 100,
        billingCompanyId: null,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [lynqPeer],
      }),
      true
    );
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: "Virement Revolut Beelynq L.l.c.",
        amount: 400,
        billingCompanyId: null,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [lynqPeer],
      }),
      true
    );
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: "Virement reçu",
        amount: 400,
        billingCompanyId: BEELYNQ,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [lynqPeer],
      }),
      true
    );
  });

  it("ne tranche pas sur la société si elle est partagée ou citée deux fois", () => {
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: "Virement Beelynq LLC",
        amount: 400,
        billingCompanyId: BEELYNQ,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [{ invoiceNumbers: ["2147"], billingCompanyId: BEELYNQ, companyName: "Beelynq L.l.c." }],
      }),
      false
    );
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: "Virement Beelynq LLC et Lynq Consulting",
        amount: 400,
        billingCompanyId: null,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [lynqPeer],
      }),
      false
    );
  });

  it("ne prend pas un crédit qui cite la facture de l’autre séjour", () => {
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: "N:002147 Beelynq L.l.c.",
        amount: 400,
        billingCompanyId: BEELYNQ,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: [lynqPeer],
      }),
      false
    );
  });

  it("sans liste de séjours, ne tranche pas", () => {
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: KIM,
        amount: 2767.61,
        billingCompanyId: BEELYNQ,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: null,
      }),
      false
    );
    assert.equal(
      unattachedCreditBelongsToFolder({
        label: KIM,
        amount: 2767.61,
        billingCompanyId: BEELYNQ,
        invoiceNumber: "2203",
        folderCompanyId: BEELYNQ,
        folderCompanyName: "BEELYNQ LLC",
        peers: undefined,
      }),
      false
    );
  });
});

describe("contexte lu dans le CRM", () => {
  it("relie les sociétés et les numéros de pièce", () => {
    const context = mb3mCreditMatchContext({
      folderCompanyId: BEELYNQ,
      peers: [{ id: "dossier-2147", billingCompanyId: LYNQ }],
      companies: [
        { id: BEELYNQ, companyName: "BEELYNQ LLC" },
        { id: LYNQ, companyName: "LYNQ CONSULTING" },
      ],
      pieces: [
        { bookingId: "dossier-2147", pieceNumber: "2147" },
        { bookingId: "dossier-2147", pieceNumber: "  " },
      ],
      failed: false,
    });
    assert.equal(context.folderCompanyName, "BEELYNQ LLC");
    assert.deepEqual(context.peers, [
      { billingCompanyId: LYNQ, companyName: "LYNQ CONSULTING", invoiceNumbers: ["2147"] },
    ]);
  });

  it("n’envoie rien à rapprocher si la lecture a échoué", () => {
    const context = mb3mCreditMatchContext({
      folderCompanyId: BEELYNQ,
      peers: [{ id: "dossier-2147", billingCompanyId: LYNQ }],
      companies: [],
      pieces: [],
      failed: true,
    });
    assert.equal(context.peers, null);
    assert.equal(context.folderCompanyName, null);
  });
});
