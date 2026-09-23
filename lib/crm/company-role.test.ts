import assert from "node:assert/strict";
import test from "node:test";
import {
  companyRoleLabel,
  filterClientLedgerRows,
  parseCompanyRole,
  resolveBillingCustomerId,
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
