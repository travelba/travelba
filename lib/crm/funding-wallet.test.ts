import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingPayerLabel,
  fundingCompanyOptionLabel,
  payingCompanyCaption,
  fundingPockets,
  resolveWireAccount,
  wireAccountChoices,
  type FundingRow,
} from "./funding-wallet";

const companies = [
  { id: "rba", company_name: "RB&A", funding: "advance", sort_order: 0 },
  { id: "pro", company_name: "Pro", funding: "pro", sort_order: 1 },
];

function row(
  direction: FundingRow["direction"],
  amount: number,
  companyId: string
): FundingRow {
  return {
    direction,
    amount,
    status: "posted",
    currency: "EUR",
    billing_company_id: companyId,
  };
}

test("crédit et Pro ne se compensent pas", () => {
  const pockets = fundingPockets(
    companies,
    [
      row("credit", 10000, "rba"),
      row("debit", 2400, "rba"),
      row("debit", 1800, "pro"),
    ]
  );
  assert.ok(pockets);
  assert.equal(pockets[0]?.label, "Crédit · RB&A");
  assert.equal(pockets[0]?.balance, 7600);
  assert.equal(pockets[0]?.due, 0);
  assert.equal(pockets[1]?.label, "Pro");
  assert.equal(pockets[1]?.balance, -1800);
  assert.equal(pockets[1]?.due, 1800);
});

test("un règlement Pro ne recharge pas le crédit", () => {
  const afterPay = fundingPockets(
    companies,
    [
      row("credit", 10000, "rba"),
      row("debit", 2400, "rba"),
      row("debit", 1800, "pro"),
      row("credit", 1800, "pro"),
      row("debit", 640, "pro"),
    ]
  );
  assert.equal(afterPay?.[0]?.balance, 7600);
  assert.equal(afterPay?.[1]?.balance, -640);
  assert.equal(afterPay?.[1]?.due, 640);
});

test("sans les deux comptes, l’encours reste unique", () => {
  assert.equal(fundingPockets([companies[0]], [row("debit", 268.66, "rba")]), null);
});

test("un virement reçu attend le compte choisi", () => {
  assert.deepEqual(wireAccountChoices(companies.map((company) => ({ ...company, customer_id: "beni" }))), {
    beni: [
      { id: "rba", label: "Crédit · RB&A" },
      { id: "pro", label: "Pro" },
    ],
  });
  assert.equal("error" in resolveWireAccount(companies, null), true);
  assert.deepEqual(resolveWireAccount(companies, "pro"), { billingCompanyId: "pro" });
  assert.deepEqual(resolveWireAccount([companies[0]], null), { billingCompanyId: null });
});

test("la réservation et le séjour nomment la société qui règle", () => {
  const companies = [
    { id: "rba", company_name: "RB&A", funding: "advance" },
    { id: "pro", company_name: "Pro", funding: "pro" },
  ];
  assert.equal(payingCompanyCaption("company", companies, "pro"), "Pro");
  assert.equal(payingCompanyCaption("company", companies, "rba"), "RB&A · Crédit");
  assert.equal(payingCompanyCaption("personal", companies, "rba"), "Particulier");
  assert.equal(bookingPayerLabel({ billing_company_id: "pro", payer_kind: "company" }, companies), "Pro");
  assert.equal(bookingPayerLabel({ billing_company_id: "rba", payer_kind: "company" }, [companies[0]]), null);
});

test("le choix de société nomme le compte", () => {
  assert.equal(fundingCompanyOptionLabel("RB&A", "advance", "RB&A"), "RB&A · Crédit");
  assert.equal(fundingCompanyOptionLabel("Pro", "pro", "Pro"), "Pro");
  assert.equal(fundingCompanyOptionLabel("Atelier", null, "Atelier"), "Atelier");
});
