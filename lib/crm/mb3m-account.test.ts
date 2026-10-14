import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mb3mAccountBalance,
  mb3mAccountBuckets,
  mb3mAccountLines,
  mb3mAccountsSplit,
  mb3mFactureMention,
  mb3mInvoiceAction,
  mb3mLineSignature,
  mb3mPieceStale,
  mb3mAccountSyncAllowed,
  mb3mAgencyActivityId,
  mb3mChargeKind,
  mb3mDossierActivityId,
} from "./mb3m-account";

const companies = [
  { id: "credit", funding: "advance" },
  { id: "pro", funding: "pro" },
];

describe("facture MB3M du compte", () => {
  it("groupe par compte seulement quand Crédit et Pro existent", () => {
    assert.equal(mb3mAccountsSplit([{ id: "a", funding: "advance" }]), false);
    assert.equal(mb3mAccountsSplit(companies), true);
    assert.deepEqual(
      mb3mAccountBuckets(companies, [
        row("d1", "debit", 10, "credit"),
        row("c1", "credit", 4, "pro"),
      ]).map((bucket) => bucket.companyId),
      ["credit", "pro"]
    );
  });

  it("ne met sur la facture que les dépenses en euros", () => {
    const lines = mb3mAccountLines(
      [
        row("b", "debit", 20, null, "Hôtel"),
        row("a", "debit", 10, null, "Vol"),
        row("c", "credit", 5, null, "Virement"),
        { ...row("d", "debit", 8, null, "Dollar"), currency: "USD" },
        { ...row("e", "debit", 3, null, "Annulé"), status: "void" },
        { ...row("old", "debit", 40, null, "Ancien hôtel"), occurred_on: "2020-01-01" },
      ],
      null,
      false
    );
    assert.deepEqual(
      lines.map((line) => line.transactionId),
      ["a", "b", "old"]
    );
    assert.equal(lines[1].label, "Hôtel");
    assert.equal(mb3mAccountBalance([row("b", "debit", 20, null), row("c", "credit", 5, null)], null, false), -15);
  });

  it("remplace la facture ouverte quand une dépense change, et la fige une fois émise", () => {
    const first = mb3mAccountLines([row("a", "debit", 10, null, "Vol")], null, false);
    assert.equal(mb3mInvoiceAction(null, first), "create");
    assert.equal(mb3mInvoiceAction(first, first), "keep");
    const second = mb3mAccountLines(
      [row("a", "debit", 10, null, "Vol"), row("b", "debit", 4, null, "Train")],
      null,
      false
    );
    assert.equal(mb3mInvoiceAction(first, second), "replace");
    assert.notEqual(mb3mLineSignature(first), mb3mLineSignature(second));
    assert.equal(mb3mInvoiceAction(first, []), "clear");
    assert.equal(mb3mFactureMention("4540", false).text, "Comptabilisé dans MB3M · Facture n° 4540");
    assert.equal(mb3mFactureMention("4540", false).openPdf, false);
    assert.equal(mb3mFactureMention("4540", true).text, "Facture MB3M n° 4540");
    assert.equal(mb3mFactureMention("4540", true).openPdf, true);
  });

  it("porte la marge et les fournisseurs des coûts pointés, et signale une pièce imprimée à corriger", () => {
    const rows = [row("a", "debit", 1200, null, "Hôtel"), row("b", "debit", 400, null, "Vol")];
    const plain = mb3mAccountLines(rows, null, false);
    // Sans coût pointé, la marge est la vente : MB3M lit une marge sur chaque ligne.
    assert.equal(plain[0].margin, 1200);
    assert.equal(plain[0].note, null);
    const margins = new Map([["a", { margin: 350, suppliers: ["RIAD KNIZA", "RIAD KNIZA"] }]]);
    const costed = mb3mAccountLines(rows, null, false, margins);
    assert.equal(costed[0].margin, 350);
    assert.equal(costed[0].note, "Fournisseur : RIAD KNIZA");
    assert.equal(costed[1].margin, 400);
    assert.notEqual(mb3mLineSignature(plain), mb3mLineSignature(costed));
    assert.equal(mb3mInvoiceAction(plain, costed), "replace");
    const printed = { transactionIds: ["a", "b"], signature: mb3mLineSignature(plain) };
    assert.equal(mb3mPieceStale(printed, plain), false);
    assert.equal(mb3mPieceStale(printed, costed), true);
    assert.equal(mb3mPieceStale({ transactionIds: ["a"], signature: null }, costed), false);
  });

  it("n’envoie aucun compte tant que la liste d’essai est vide", () => {
    const previous = {
      user: process.env.MB3M_API_USER,
      password: process.env.MB3M_API_PASSWORD,
      activity: process.env.MB3M_ACTIVITY_ID,
      allow: process.env.MB3M_SYNC_CUSTOMER_IDS,
      vercel: process.env.VERCEL_ENV,
    };
    process.env.MB3M_API_USER = "user";
    process.env.MB3M_API_PASSWORD = "secret";
    process.env.MB3M_ACTIVITY_ID = "3";
    delete process.env.VERCEL_ENV;
    delete process.env.MB3M_SYNC_CUSTOMER_IDS;
    const trial = "11111111-1111-4111-8111-111111111111";
    assert.equal(mb3mAccountSyncAllowed(trial), false);
    process.env.MB3M_SYNC_CUSTOMER_IDS = `${trial}, autre`;
    assert.equal(mb3mAccountSyncAllowed(trial), true);
    assert.equal(mb3mAccountSyncAllowed("22222222-2222-4222-8222-222222222222"), false);
    restore("MB3M_API_USER", previous.user);
    restore("MB3M_API_PASSWORD", previous.password);
    restore("MB3M_ACTIVITY_ID", previous.activity);
    restore("MB3M_SYNC_CUSTOMER_IDS", previous.allow);
    restore("VERCEL_ENV", previous.vercel);
  });

  it("reprend le fichier d’activités de l’agence, une activité par dépense", () => {
    assert.equal(mb3mAgencyActivityId("flight"), 2);
    assert.equal(mb3mAgencyActivityId("insurance"), 3);
    assert.equal(mb3mAgencyActivityId("rail"), 5);
    assert.equal(mb3mAgencyActivityId("hotel"), 7);
    assert.equal(mb3mAgencyActivityId("car"), 8);
    assert.equal(mb3mAgencyActivityId("cruise"), 20);
    // Frais généraux (14) est refusé en ligne de facture par la base agence.
    assert.equal(mb3mAgencyActivityId("fee"), 22);
    assert.equal(mb3mAgencyActivityId("package"), 11);
    assert.equal(mb3mAgencyActivityId("transfer"), 22);
    assert.equal(mb3mAgencyActivityId("expense"), 22);
    assert.equal(mb3mAgencyActivityId("inconnu"), 22);
    assert.equal(
      mb3mChargeKind({ external_id: "booking:b1:agency-commission" }),
      "fee"
    );
    assert.equal(
      mb3mChargeKind({ external_id: "booking:b1:item:x", itemKind: "hotel" }),
      "hotel"
    );
    assert.equal(mb3mChargeKind({ booking_id: "b1" }), "package");
    assert.equal(mb3mChargeKind({ ticketing: true, itemKind: "expense" }), "fee");
    const previous = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    const lines = mb3mAccountLines(
      [
        { ...row("f", "debit", 10, null, "Vol"), chargeKind: "flight" },
        { ...row("h", "debit", 20, null, "Hôtel"), chargeKind: "hotel" },
        { ...row("s", "debit", 30, null, "Séjour"), chargeKind: "package" },
        { ...row("e", "debit", 5, null, "Dépense"), chargeKind: "expense" },
      ],
      null,
      false
    );
    assert.deepEqual(
      lines.map((line) => [line.transactionId, line.activityId]),
      [
        ["e", 22],
        ["f", 2],
        ["h", 7],
        ["s", 11],
      ]
    );
    assert.equal(mb3mDossierActivityId(), 11);
    const same = mb3mAccountLines([{ ...row("f", "debit", 12, null, "Vol"), chargeKind: "flight" }], null, false);
    const changed = mb3mAccountLines([{ ...row("f", "debit", 12, null, "Vol"), chargeKind: "hotel" }], null, false);
    assert.equal(mb3mInvoiceAction(same, changed), "replace");
    restore("VERCEL_ENV", previous);
  });

  it("facture le compte en production sans activité unique", () => {
    const previous = {
      user: process.env.MB3M_PROD_API_USER,
      password: process.env.MB3M_PROD_API_PASSWORD,
      activity: process.env.MB3M_PROD_ACTIVITY_ID,
      allow: process.env.MB3M_SYNC_CUSTOMER_IDS,
      vercel: process.env.VERCEL_ENV,
    };
    process.env.VERCEL_ENV = "production";
    process.env.MB3M_PROD_API_USER = "agence";
    process.env.MB3M_PROD_API_PASSWORD = "secret";
    delete process.env.MB3M_PROD_ACTIVITY_ID;
    const trial = "11111111-1111-4111-8111-111111111111";
    process.env.MB3M_SYNC_CUSTOMER_IDS = trial;
    assert.equal(mb3mAccountSyncAllowed(trial), true);
    assert.equal(mb3mAccountSyncAllowed("22222222-2222-4222-8222-222222222222"), false);
    restore("MB3M_PROD_API_USER", previous.user);
    restore("MB3M_PROD_API_PASSWORD", previous.password);
    restore("MB3M_PROD_ACTIVITY_ID", previous.activity);
    restore("MB3M_SYNC_CUSTOMER_IDS", previous.allow);
    restore("VERCEL_ENV", previous.vercel);
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function row(
  id: string,
  direction: "debit" | "credit",
  amount: number,
  company: string | null,
  label = "Dépense"
) {
  return {
    id,
    direction,
    status: "posted",
    currency: "EUR",
    amount,
    label,
    billing_company_id: company,
  };
}
