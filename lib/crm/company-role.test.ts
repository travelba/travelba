import assert from "node:assert/strict";
import test from "node:test";
import {
  billingParentError,
  bookingPayerKind,
  bookingPayerLabel,
  companyDisplayName,
  companyPaidBookingIds,
  companyRoleLabel,
  filterClientLedgerRows,
  hasBillingParent,
  isCompanyPaidBooking,
  parseCompanyRole,
  resolveBillingCustomerId,
  splitMemberLedger,
} from "./company-role";
import type { CrmTransaction } from "./types";

test("resolveBillingCustomerId uses parent for members", () => {
  assert.equal(
    resolveBillingCustomerId({
      id: "traveler",
      company_role: "member",
      billing_parent_id: "company-admin",
    }),
    "company-admin"
  );
  assert.equal(
    resolveBillingCustomerId({
      id: "admin",
      company_role: "admin",
      billing_parent_id: null,
    }),
    "admin"
  );
  assert.equal(
    resolveBillingCustomerId({
      id: "roselle-gerant",
      company_role: "admin",
      billing_parent_id: "ozb",
    }),
    "ozb"
  );
  assert.equal(
    resolveBillingCustomerId({
      id: "solo",
      company_role: null,
      billing_parent_id: null,
    }),
    "solo"
  );
});

test("member ledger hides company credits", () => {
  const rows = [
    {
      id: "1",
      direction: "credit",
      booking_id: null,
      amount: 10000,
    },
    {
      id: "2",
      direction: "debit",
      booking_id: "b1",
      amount: 2000,
    },
    {
      id: "3",
      direction: "debit",
      booking_id: "other",
      amount: 500,
    },
  ] as CrmTransaction[];

  const visible = filterClientLedgerRows(rows, {
    companyRole: "member",
    travelerBookingIds: ["b1"],
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, "2");

  const full = filterClientLedgerRows(rows, {
    companyRole: "admin",
    travelerBookingIds: ["b1"],
  });
  assert.equal(full.length, 3);
});

test("company role labels and parse", () => {
  assert.equal(companyRoleLabel("admin"), "Admin société");
  assert.equal(companyRoleLabel("member"), "Collaborateur rattaché");
  assert.equal(companyRoleLabel(null), "Particulier");
  assert.equal(parseCompanyRole("member"), "member");
  assert.equal(parseCompanyRole(""), null);
  assert.equal(parseCompanyRole("boss"), null);
});

test("Marrakech billed to OZB is company-paid, a personal trip is not", () => {
  const marrakech = {
    id: "b-marrakech",
    customer_id: "jeremy",
    billing_customer_id: "ozb",
  };
  const perso = {
    id: "b-perso",
    customer_id: "jeremy",
    billing_customer_id: "jeremy",
  };
  assert.equal(isCompanyPaidBooking(marrakech, "jeremy"), true);
  assert.equal(isCompanyPaidBooking(perso, "jeremy"), false);
  assert.equal(bookingPayerKind(marrakech, "jeremy"), "company");
  assert.equal(bookingPayerKind(perso, "jeremy"), "personal");
  assert.deepEqual(companyPaidBookingIds([marrakech, perso], "jeremy"), ["b-marrakech"]);
  assert.equal(companyDisplayName({ company_name: "OZB Optique", first_name: "", last_name: "" }), "OZB Optique");
  assert.equal(bookingPayerLabel("company", "OZB Optique"), "Réglé par OZB Optique");
  assert.equal(bookingPayerLabel("personal", "OZB Optique"), "À votre charge");
  assert.equal(bookingPayerLabel("company", "OZB Optique", { voice: "admin" }), "Facturé à OZB Optique");
});

test("any traveler can share a billing account without being a member", () => {
  assert.equal(hasBillingParent({ billing_parent_id: "ozb" }), true);
  assert.equal(hasBillingParent({ billing_parent_id: null }), false);
  assert.equal(
    billingParentError({
      selfId: "jeremy",
      role: "admin",
      parentId: "ozb",
      parentFound: true,
      parentRole: "admin",
    }),
    null
  );
  assert.equal(
    billingParentError({
      selfId: "jeremy",
      role: "member",
      parentId: null,
    }),
    "Choisissez le compte de facturation pour ce collaborateur."
  );
});

test("member keeps a personal wallet and never sees company credits", () => {
  const personalRows = [
    { id: "p1", direction: "credit", booking_id: null, amount: 800, customer_id: "jeremy" },
    { id: "p2", direction: "debit", booking_id: "b-perso", amount: 300, customer_id: "jeremy" },
  ] as CrmTransaction[];
  const companyDebitRows = [
    { id: "c1", direction: "credit", booking_id: null, amount: 50000, customer_id: "ozb" },
    { id: "c2", direction: "debit", booking_id: "b-marrakech", amount: 2400, customer_id: "ozb" },
    { id: "c3", direction: "debit", booking_id: "b-other-employee", amount: 900, customer_id: "ozb" },
  ] as CrmTransaction[];

  const split = splitMemberLedger({
    personalRows,
    companyDebitRows,
    companyPaidBookingIds: ["b-marrakech"],
  });
  assert.equal(split.personalRows.length, 2);
  assert.equal(split.companyRows.length, 1);
  assert.equal(split.companyRows[0].id, "c2");
  assert.equal(
    split.companyRows.some((t) => t.direction === "credit"),
    false
  );
});
