import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanyRoleFields } from "../../components/crm/CompanyRoleFields";
import { customerPatchFromBody } from "./customer-patch";
import {
  bookingIdsWhereClientTravels,
  clientBookingFilter,
  clientMayReadBooking,
  clientTravelsAs,
  collaboratorTripOwnerIds,
  companyRoleLabel,
  filterClientLedgerRows,
  parseCompanyRole,
  payerMayReadBilledInvoice,
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
    "gaelle"
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

test("un admin ne reçoit pas les dossiers de ses collaborateurs", () => {
  assert.deepEqual(collaboratorTripOwnerIds({ id: "raphael" }), ["raphael"]);
  assert.deepEqual(collaboratorTripOwnerIds({ id: "gaelle" }), ["gaelle"]);
});

test("le payeur voit un dossier seulement s’il y voyage", () => {
  const raphael = { first_name: "Raphaël", last_name: "Benillouche", usage_name: null };
  assert.equal(clientTravelsAs(raphael, { first_name: "Raphael", last_name: "Benillouche" }), true);
  assert.equal(clientTravelsAs(raphael, { first_name: "Jorge", last_name: "Garcia Velez" }), false);
  assert.equal(clientTravelsAs(raphael, { first_name: "Raphael", last_name: "" }), false);
  const raphaelId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jorge = "11111111-1111-4111-8111-111111111111";
  const shared = "22222222-2222-4222-8222-222222222222";
  const ids = bookingIdsWhereClientTravels(raphael, [
    { booking_id: jorge, first_name: "Jorge", last_name: "Garcia Velez" },
    { booking_id: shared, first_name: "Raphael", last_name: "Benillouche" },
  ]);
  assert.deepEqual(ids, [shared]);
  const scope = { ownerIds: [raphaelId], travelerBookingIds: ids };
  assert.equal(
    clientMayReadBooking(
      { id: jorge, customer_id: "jorge", visible_to_client: true, archived_at: null },
      scope
    ),
    false
  );
  assert.equal(
    clientMayReadBooking(
      { id: shared, customer_id: "jorge", visible_to_client: true, archived_at: null },
      scope
    ),
    true
  );
  assert.equal(
    clientMayReadBooking(
      { id: "own", customer_id: raphaelId, visible_to_client: true, archived_at: null },
      scope
    ),
    true
  );
  assert.equal(
    clientMayReadBooking(
      { id: "own", customer_id: raphaelId, visible_to_client: false, archived_at: null },
      scope
    ),
    false
  );
  const filter = clientBookingFilter(scope);
  assert.equal(filter.kind, "or");
  if (filter.kind === "or") {
    assert.match(filter.value, new RegExp(`customer_id\\.in\\.\\(${raphaelId}\\)`));
    assert.match(filter.value, new RegExp(shared));
    assert.equal(filter.value.includes(jorge), false);
  }
});

test("la facture d’un séjour facturé au payeur se lit, pas le billet", () => {
  assert.equal(
    payerMayReadBilledInvoice({
      viewerId: "raphael",
      billingCustomerId: "raphael",
      kind: "invoice",
      fileName: "facture.pdf",
      storagePath: "bookings/jorge/facture.pdf",
    }),
    true
  );
  assert.equal(
    payerMayReadBilledInvoice({
      viewerId: "raphael",
      billingCustomerId: "jorge",
      kind: "invoice",
      fileName: "facture.pdf",
      storagePath: "bookings/jorge/facture.pdf",
    }),
    false
  );
  assert.equal(
    payerMayReadBilledInvoice({
      viewerId: "raphael",
      billingCustomerId: "raphael",
      kind: "ticket",
      fileName: "e-ticket.pdf",
      storagePath: "bookings/jorge/e-ticket.pdf",
    }),
    false
  );
});

test("la fiche n’attache un admin à aucun wallet", () => {
  const linked = customerPatchFromBody({
    company_role: "admin",
    billing_parent_id: "raphael",
  });
  assert.equal(linked.patch.company_role, "admin");
  assert.equal(linked.patch.billing_parent_id, null);

  const member = customerPatchFromBody({
    company_role: "member",
    billing_parent_id: "raphael",
  });
  assert.equal(member.patch.billing_parent_id, "raphael");

  const cleared = customerPatchFromBody({
    company_role: null,
    billing_parent_id: "raphael",
  });
  assert.equal(cleared.patch.billing_parent_id, null);
  assert.equal(cleared.patch.spending_allowance, null);
});

test("le formulaire facture un collaborateur par l’admin, sans associé", () => {
  const admins = [
    {
      id: "raphael",
      first_name: "Raphael",
      last_name: "Benillouche",
      company_name: "RB&A",
      email: "rb@example.com",
      phone: "",
      company_role: "admin" as const,
      billing_parent_id: null,
    },
    {
      id: "julie",
      first_name: "Julie",
      last_name: "Martin",
      company_name: "RB&A",
      email: "jm@example.com",
      phone: "",
      company_role: "admin" as const,
      billing_parent_id: "raphael",
    },
  ];
  const memberHtml = renderToStaticMarkup(
    createElement(CompanyRoleFields, {
      role: "member",
      onRoleChange: () => {},
      billingParentId: "raphael",
      onBillingParentChange: () => {},
      companyAdmins: admins,
      selfId: "gaelle",
      spendingAllowance: "",
      onSpendingAllowanceChange: () => {},
    })
  );
  assert.match(memberHtml, /Facturé par/);
  assert.match(memberHtml, /Raphael Benillouche/);
  assert.equal(memberHtml.includes("Associé de"), false);
  assert.equal(memberHtml.includes("Julie"), false);

  const adminHtml = renderToStaticMarkup(
    createElement(CompanyRoleFields, {
      role: "admin",
      onRoleChange: () => {},
      billingParentId: "",
      onBillingParentChange: () => {},
      companyAdmins: admins,
      selfId: "raphael",
      spendingAllowance: "",
      onSpendingAllowanceChange: () => {},
    })
  );
  assert.match(adminHtml, /dépenses de son équipe, pas le voyage d’un collaborateur/);
  assert.equal(adminHtml.includes("Associé de"), false);
  assert.equal(adminHtml.includes("Facturé par"), false);
});

test("company role labels and parse", () => {
  assert.equal(companyRoleLabel("admin"), "Admin société");
  assert.equal(companyRoleLabel("member"), "Collaborateur rattaché");
  assert.equal(companyRoleLabel(null), "Particulier");
  assert.equal(parseCompanyRole("member"), "member");
  assert.equal(parseCompanyRole(""), null);
  assert.equal(parseCompanyRole("boss"), null);
});
