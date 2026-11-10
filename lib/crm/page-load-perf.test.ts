import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CUSTOMER_LIST_SELECT, CUSTOMER_PICK_SELECT } from "./customer-search";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pages = [
  "app/admin/reservations/[id]/page.tsx",
  "app/mon-compte/page.tsx",
  "app/mon-compte/reservations/[reference]/page.tsx",
];

describe("page-load-perf", () => {
  it("ne réconcilie pas le foyer sur un GET de page", () => {
    for (const file of pages) {
      const src = readFileSync(join(root, file), "utf8");
      assert.equal(src.includes("reconcileCustomerParty"), false, file);
    }
  });

  it("ne charge pas tout crm_customers sur le détail réservation", () => {
    const page = readFileSync(join(root, "app/admin/reservations/[id]/page.tsx"), "utf8");
    const load = readFileSync(join(root, "lib/crm/admin-booking-load.ts"), "utf8");
    assert.equal(page.includes('.order("last_name")'), false);
    assert.equal(load.includes('.order("last_name")'), false);
    assert.match(load, /\.in\("id", relatedIds\)/);
    assert.match(load, /live: false/);
    assert.match(load, /bookingLedgers\(supabase, customer, billingCustomer, false\)/);
    assert.match(page, /shellAdminBooking/);
    assert.equal(page.includes("await repairCustomerDownloads"), false);
    assert.match(page, /after\(task\)/);
    assert.match(load, /console\.time\("\[dossier\] vague 1"\)/);
    assert.match(load, /\.limit\(30\)/);
    assert.match(load, /loadCustomerWhatsappMessages\(supabase, b\.customer_id, 50\)/);
    assert.doesNotMatch(load, /body_text, extract/);
  });

  it("la fiche client ne rapproche pas Stripe et ne géocode pas au premier affichage", () => {
    const page = readFileSync(join(root, "app/admin/clients/[id]/page.tsx"), "utf8");
    const sepa = readFileSync(join(root, "lib/crm/sepa-ledger.ts"), "utf8");
    assert.equal(page.includes("await repairCustomerDownloads"), false);
    assert.equal(page.includes("reconcileCustomerSepa"), false);
    assert.match(page, /geocode: false/);
    assert.match(page, /console\.time\("\[fiche\] vague 1"\)/);
    assert.match(sepa, /export async function loadCustomerSepaState/);
    assert.doesNotMatch(
      sepa.slice(sepa.indexOf("export async function loadCustomerSepaState")),
      /reconcileCustomerSepa/
    );
  });

  it("le sélecteur typeahead n’expose pas l’IBAN", () => {
    assert.equal(CUSTOMER_PICK_SELECT.includes("iban"), false);
    assert.match(CUSTOMER_PICK_SELECT, /first_name/);
    assert.match(CUSTOMER_PICK_SELECT, /company_role/);
    for (const forbidden of ["iban", "siret", "vat_number", "address_line", "billing_address_line"]) {
      assert.equal(CUSTOMER_LIST_SELECT.includes(forbidden), false, forbidden);
    }
  });

  it("les listes agence ne sérialisent jamais la fiche client entière (A-06)", () => {
    const wholeCustomer = /from\("crm_customers"\)\s*\.select\("\*"\)/g;
    for (const file of [
      "app/admin/reservations/page.tsx",
      "app/admin/clients/page.tsx",
      "app/admin/transactions/page.tsx",
      "app/admin/page.tsx",
      "app/api/admin/bookings/ingest/route.ts",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.equal(src.match(wholeCustomer)?.length ?? 0, 0, file);
    }
    // La fiche elle-même reste complète ; les admins société passent par le sélecteur.
    const fiche = readFileSync(join(root, "app/admin/clients/[id]/page.tsx"), "utf8");
    assert.equal(fiche.match(wholeCustomer)?.length ?? 0, 1);
    assert.match(fiche, /\.select\(CUSTOMER_PICK_SELECT\)\s*\.eq\("company_role", "admin"\)/);
  });

  it("plus de <select> natif de toute la clientèle : CustomerPickField", () => {
    for (const file of [
      "components/crm/BookingIngest.tsx",
      "components/admin/Ledger.tsx",
    ]) {
      const src = readFileSync(join(root, file), "utf8");
      assert.match(src, /CustomerPickField/, file);
      assert.doesNotMatch(src, /customers\.map\(\(c\) => \(\s*<option/, file);
    }
  });
});
