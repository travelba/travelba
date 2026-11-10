import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendBillingCompany,
  billingCompaniesPublic,
  billingCompanyIsEmpty,
  billingCompanyTabLabel,
  companyLabelForTransaction,
  DUPLICATE_SIRET_ERROR,
  normalizeBillingCompanies,
  planBillingCompanyWrites,
  postedCustomerBalance,
  primaryBillingMirror,
  transactionCompanyLabel,
  updateBillingCompany,
} from "./billing-companies";

test("l’encours ignore la société de facturation", () => {
  const rows = [
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "credit" as const,
      amount: 100,
      status: "posted",
      billing_company_id: null,
    },
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "debit" as const,
      amount: 40,
      status: "posted",
      billing_company_id: "a",
    },
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "debit" as const,
      amount: 25,
      status: "posted",
      billing_company_id: "b",
    },
    {
      customer_id: "c1",
      currency: "EUR",
      direction: "debit" as const,
      amount: 999,
      status: "void",
      billing_company_id: "a",
    },
  ];
  assert.equal(postedCustomerBalance(rows, "c1"), 35);
  const sql = readFileSync(
    new URL("../../supabase/migrations/20260925120000_billing_companies.sql", import.meta.url),
    "utf8"
  );
  assert.equal(sql.includes("crm_customer_balances"), true);
  assert.equal(/create\s+(or\s+replace\s+)?view\s+public\.crm_customer_balances/i.test(sql), false);
  assert.equal(/group by[^;]*billing_company_id/i.test(sql), false);
});

test("le libellé société n’apparaît que s’il y en a plusieurs", () => {
  assert.equal(transactionCompanyLabel(0, "Atelier"), null);
  assert.equal(transactionCompanyLabel(1, "Atelier"), null);
  assert.equal(transactionCompanyLabel(2, "Atelier"), "Atelier");
  assert.equal(transactionCompanyLabel(2, "  "), null);

  const companies = [
    { id: "a", customer_id: "c1", company_name: "Atelier" },
    { id: "b", customer_id: "c1", company_name: "Bureau" },
  ];
  assert.equal(
    companyLabelForTransaction({ customer_id: "c1", billing_company_id: "a" }, companies),
    "Atelier"
  );
  assert.equal(
    companyLabelForTransaction(
      { customer_id: "c1", billing_company_id: "a" },
      [companies[0]]
    ),
    null
  );
  assert.equal(
    companyLabelForTransaction({ customer_id: "c1", billing_company_id: null }, companies),
    null
  );
});

test("une société sans raison sociale ni SIRET est vide", () => {
  assert.equal(billingCompanyIsEmpty({ company_name: "  ", billing_city: "" }), true);
  assert.equal(billingCompanyIsEmpty({ company_name: "Atelier" }), false);
  assert.equal(billingCompanyIsEmpty({ siret: "73282932000074" }), false);
});

test("une société vide n’est pas enregistrée et le miroir suit la première", () => {
  const parsed = normalizeBillingCompanies([
    { company_name: "  " },
    { company_name: "Atelier", siret: "73282932000074", billing_email: "Compta@Atelier.fr" },
    { company_name: "Bureau" },
  ]);
  assert.equal("error" in parsed, false);
  if ("error" in parsed) return;
  assert.equal(parsed.companies.length, 2);
  assert.equal(parsed.companies[0]?.siret, "73282932000074");
  assert.equal(parsed.companies[0]?.billing_email, "compta@atelier.fr");
  assert.deepEqual(primaryBillingMirror(parsed.companies), {
    company_name: "Atelier",
    siret: "73282932000074",
    vat_number: null,
    billing_email: "compta@atelier.fr",
    billing_address_line: null,
    billing_postal_code: null,
    billing_city: null,
    billing_country: null,
  });
  assert.equal(billingCompanyTabLabel("", 1, 2), "Société 2");
  assert.equal(billingCompanyTabLabel("Bureau", 1, 2), "Bureau");
});

test("un second enregistrement sans id réutilise la société du même SIRET", () => {
  const plan = planBillingCompanyWrites(
    [{ id: "existant", siret: "73282932000074" }],
    [{ id: null, siret: "73282932000074", company_name: "Atelier" }]
  );
  assert.equal(plan.writes[0]?.id, "existant");
  assert.deepEqual(plan.releaseIds, []);
});

test("un SIRET déjà formaté en base est reconnu", () => {
  const plan = planBillingCompanyWrites(
    [{ id: "existant", siret: "732 829 320 00074" }],
    [{ id: null, siret: "73282932000074", company_name: "Atelier" }]
  );
  assert.equal(plan.writes[0]?.id, "existant");
});

test("remplacer une société retire l’ancienne ligne", () => {
  const plan = planBillingCompanyWrites(
    [{ id: "ancienne", siret: "73282932000074" }],
    [{ id: null, siret: "55210055400013", company_name: "Autre" }]
  );
  assert.equal(plan.writes[0]?.id, null);
  assert.deepEqual(plan.releaseIds, ["ancienne"]);
  assert.deepEqual(plan.clearSiretIds, []);
});

test("changer le SIRET vers celui d’une société retirée libère d’abord l’index", () => {
  const plan = planBillingCompanyWrites(
    [
      { id: "a", siret: "73282932000074" },
      { id: "b", siret: "55210055400013" },
    ],
    [{ id: "a", siret: "55210055400013", company_name: "Atelier" }]
  );
  assert.deepEqual(plan.releaseIds, ["b"]);
  assert.deepEqual(plan.clearSiretIds, ["b"]);
});

test("deux fois le même SIRET dans le formulaire est refusé", () => {
  const parsed = normalizeBillingCompanies([
    { company_name: "Atelier", siret: "73282932000074" },
    { company_name: "Copie", siret: "732 829 320 00074" },
  ]);
  assert.deepEqual(parsed, { error: DUPLICATE_SIRET_ERROR });
});

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  let seq = 1;
  function nextId() {
    return `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`;
  }
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
    let orderCol: string | null = null;
    const api = {
      select() {
        return api;
      },
      insert(value: Row) {
        op = "insert";
        payload = value;
        return api;
      },
      update(value: Row) {
        op = "update";
        payload = value;
        return api;
      },
      delete() {
        op = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      order(column: string) {
        orderCol = column;
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void, reject?: (err: unknown) => void) {
        return Promise.resolve(list()).then(resolve, reject);
      },
    };
    function matched() {
      let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (orderCol) {
        const column = orderCol;
        rows = [...rows].sort((a, b) => Number(a[column] || 0) - Number(b[column] || 0));
      }
      return rows;
    }
    function apply() {
      if (op === "insert") {
        const row = { ...payload, id: typeof payload.id === "string" ? payload.id : nextId() };
        tables[table].push(row);
        return [row];
      }
      if (op === "update") {
        const hits = tables[table].filter((row) => filters.every((filter) => filter(row)));
        for (const row of hits) Object.assign(row, payload);
        return hits;
      }
      if (op === "delete") {
        const removed = tables[table].filter((row) => filters.every((filter) => filter(row)));
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return removed;
      }
      return matched();
    }
    function list() {
      return { data: apply(), error: null };
    }
    function finish(allowEmpty: boolean) {
      const rows = apply();
      if (rows.length === 1) return { data: rows[0], error: null };
      if (allowEmpty && rows.length === 0) return { data: null, error: null };
      return { data: null, error: { message: "several", code: "PGRST116" } };
    }
    return api;
  }
  return { from, tables };
}

const CLIENT = "11111111-1111-4111-8111-111111111111";
const LYNQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOSSIER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("ajouter une société laisse les autres et le dossier facturé", async () => {
  const lynq = {
    id: LYNQ,
    customer_id: CLIENT,
    company_name: "Atelier",
    siret: "73282932000074",
    vat_number: "FR88732829320",
    billing_email: "atelier@example.com",
    billing_address_line: "10 rue",
    billing_postal_code: "75002",
    billing_city: "Paris",
    billing_country: "FR",
    sort_order: 0,
  };
  const booking = { id: DOSSIER, customer_id: CLIENT, billing_company_id: LYNQ };
  const db = memoryAdmin({
    crm_customers: [{ id: CLIENT, first_name: "Camille", last_name: "Martin", company_name: "Atelier", siret: "73282932000074", billing_city: "Paris" }],
    crm_billing_companies: [lynq],
    crm_bookings: [booking],
  });
  const client = db as unknown as SupabaseClient;
  const beforeLynq = JSON.stringify(db.tables.crm_billing_companies[0]);
  const beforeBooking = JSON.stringify(db.tables.crm_bookings[0]);
  const added = await appendBillingCompany(client, CLIENT, {
    company_name: "Bureau LLC",
    billing_email: "Compta@Bureau.test",
    billing_city: "Wilmington",
    billing_country: "États-Unis",
  });
  assert.equal("error" in added, false);
  if ("error" in added) return;
  assert.equal(added.company.company_name, "Bureau LLC");
  assert.equal(added.company.billing_email, "compta@bureau.test");
  assert.equal(added.company.billing_country, "US");
  assert.equal(added.company.sort_order, 1);
  assert.equal(db.tables.crm_billing_companies.length, 2);
  assert.equal(JSON.stringify(db.tables.crm_billing_companies.find((row) => row.id === LYNQ)), beforeLynq);
  assert.equal(JSON.stringify(db.tables.crm_bookings[0]), beforeBooking);
  assert.equal(db.tables.crm_customers[0].company_name, "Atelier");
  const listed = billingCompaniesPublic(added.companies);
  assert.equal(listed.find((row) => row.id === LYNQ)?.principale, true);
  assert.equal(listed.find((row) => row.id === added.company.id)?.principale, false);
  assert.equal(listed.find((row) => row.id === LYNQ)?.siret, "73282932000074");
  assert.equal(listed.find((row) => row.id === LYNQ)?.email, "atelier@example.com");
  const duplicate = await appendBillingCompany(client, CLIENT, {
    company_name: "Copie",
    siret: "732 829 320 00074",
  });
  assert.equal("error" in duplicate, true);
  if (!("error" in duplicate)) return;
  assert.match(duplicate.error, new RegExp(LYNQ));
  assert.equal(db.tables.crm_billing_companies.length, 2);
  const edited = await updateBillingCompany(client, CLIENT, added.company.id, { billing_city: "Dover" });
  assert.equal("error" in edited, false);
  if ("error" in edited) return;
  assert.equal(edited.company.billing_city, "Dover");
  assert.equal(edited.company.company_name, "Bureau LLC");
  assert.equal(JSON.stringify(db.tables.crm_billing_companies.find((row) => row.id === LYNQ)), beforeLynq);
  assert.equal(JSON.stringify(db.tables.crm_bookings[0]), beforeBooking);
  assert.equal(db.tables.crm_customers[0].billing_city, "Paris");
  const renamed = await updateBillingCompany(client, CLIENT, LYNQ, { billing_city: "Lyon" });
  assert.equal("error" in renamed, false);
  assert.equal(db.tables.crm_customers[0].company_name, "Atelier");
  assert.equal(db.tables.crm_customers[0].billing_city, "Lyon");
  assert.equal(db.tables.crm_billing_companies.find((row) => row.id === added.company.id)?.billing_city, "Dover");
  assert.equal(db.tables.crm_bookings[0].billing_company_id, LYNQ);
  const wiped = await updateBillingCompany(client, CLIENT, LYNQ, {
    company_name: " ",
    siret: "",
    vat_number: "",
    billing_email: "",
    billing_address_line: "",
    billing_postal_code: "",
    billing_city: "",
  });
  assert.equal("error" in wiped && wiped.error, "Cette société ne peut pas être vidée ici.");
  assert.equal(db.tables.crm_billing_companies.find((row) => row.id === LYNQ)?.company_name, "Atelier");
});
