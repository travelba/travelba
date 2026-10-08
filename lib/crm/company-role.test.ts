import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyRoleFields } from "../../components/crm/CompanyRoleFields";
import { customerPatchFromBody } from "./customer-patch";
import {
  adminLedgerCustomerId,
  adminTripOwnerIds,
  companyLinkError,
  companyRoleLabel,
  filterClientLedgerRows,
  isAssociatedAdmin,
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
      id: "gaelle",
      company_role: "admin",
      billing_parent_id: "raphael",
    }),
    "raphael"
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
    {
      id: "4",
      direction: "credit",
      booking_id: "b1",
      amount: 100,
    },
  ] as CrmTransaction[];

  const visible = filterClientLedgerRows(rows, {
    companyRole: "member",
    travelerBookingIds: ["b1"],
  });
  assert.deepEqual(
    visible.map((row) => row.id),
    ["2", "4"]
  );

  const full = filterClientLedgerRows(rows, {
    companyRole: "admin",
    travelerBookingIds: ["b1"],
  });
  assert.equal(full.length, 4);
});

test("les admins associés partagent le wallet et les voyages, pas ceux des collaborateurs", () => {
  const raphael = { id: "raphael", company_role: "admin" as const, billing_parent_id: null };
  const gaelle = { id: "gaelle", company_role: "admin" as const, billing_parent_id: "raphael" };
  const louis = { id: "louis", company_role: "member" as const, billing_parent_id: "raphael" };
  assert.equal(adminLedgerCustomerId(gaelle), "raphael");
  assert.equal(adminLedgerCustomerId(raphael), "raphael");
  assert.equal(isAssociatedAdmin(gaelle), true);
  assert.equal(isAssociatedAdmin(raphael), false);
  const rows = [raphael, gaelle, louis];
  assert.deepEqual(adminTripOwnerIds(raphael, rows).sort(), ["gaelle", "raphael"]);
  assert.deepEqual(adminTripOwnerIds(gaelle, rows).sort(), ["gaelle", "raphael"]);
  assert.deepEqual(adminTripOwnerIds(louis, rows), ["louis"]);
});

test("un admin associé se rattache au wallet, pas à un autre associé", () => {
  const wallet = { company_role: "admin" as const, billing_parent_id: null };
  const peer = { company_role: "admin" as const, billing_parent_id: "raphael" };
  assert.equal(
    companyLinkError({
      selfId: "gaelle",
      role: "admin",
      parentId: "raphael",
      parent: wallet,
      childCount: 0,
    }),
    null
  );
  assert.match(
    companyLinkError({
      selfId: "julie",
      role: "admin",
      parentId: "gaelle",
      parent: peer,
      childCount: 0,
    }) || "",
    /wallet/
  );
  assert.match(
    companyLinkError({
      selfId: "raphael",
      role: "admin",
      parentId: "autre",
      parent: wallet,
      childCount: 2,
    }) || "",
    /porte déjà le wallet/
  );
});

test("la fiche garde le wallet d’un admin associé", () => {
  const linked = customerPatchFromBody({
    company_role: "admin",
    billing_parent_id: "raphael",
  });
  assert.equal(linked.patch.company_role, "admin");
  assert.equal(linked.patch.billing_parent_id, "raphael");

  const wallet = customerPatchFromBody({ company_role: "admin" });
  assert.equal(wallet.patch.billing_parent_id, null);

  const cleared = customerPatchFromBody({
    company_role: null,
    billing_parent_id: "raphael",
  });
  assert.equal(cleared.patch.billing_parent_id, null);
});

test("le formulaire propose Associé de pour un admin, sans les autres associés", () => {
  const html = renderToStaticMarkup(
    createElement(CompanyRoleFields, {
      role: "admin",
      onRoleChange: () => {},
      billingParentId: "raphael",
      onBillingParentChange: () => {},
      companyAdmins: [
        {
          id: "raphael",
          first_name: "Raphael",
          last_name: "Benillouche",
          company_name: "RB&A",
          email: "rb@example.com",
          phone: "",
          company_role: "admin",
          billing_parent_id: null,
        },
        {
          id: "gaelle",
          first_name: "Gaëlle",
          last_name: "Zerbib",
          company_name: "RB&A",
          email: "gz@example.com",
          phone: "",
          company_role: "admin",
          billing_parent_id: "raphael",
        },
      ],
      selfId: "gaelle",
      spendingAllowance: "",
      onSpendingAllowanceChange: () => {},
    })
  );
  assert.match(html, /Associé de/);
  assert.match(html, /Raphael Benillouche/);
  assert.match(html, /Cet admin partage le wallet/);
  assert.equal(html.includes("Gaëlle"), false);
});

test("company role labels and parse", () => {
  assert.equal(companyRoleLabel("admin"), "Admin société");
  assert.equal(companyRoleLabel("member"), "Collaborateur rattaché");
  assert.equal(companyRoleLabel(null), "Particulier");
  assert.equal(parseCompanyRole("member"), "member");
  assert.equal(parseCompanyRole(""), null);
  assert.equal(parseCompanyRole("boss"), null);
});
