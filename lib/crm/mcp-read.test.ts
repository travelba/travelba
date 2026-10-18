import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "./money";
import { McpReadError } from "./mcp-passport";
import { dossierPayerLine, readChercherDossiers, readFicheDossier, readFormalites } from "./mcp-read";

const BOOKING = "22222222-2222-4222-8222-222222222222";

test("fiche et recherche montrent la société à côté du contact", () => {
  assert.deepEqual(dossierPayerLine({ payer_kind: "company", billing_company_id: "soc" }, "NILOS FRANCE"), {
    societe: "NILOS FRANCE",
    paye_par: "société",
  });
  assert.deepEqual(dossierPayerLine({ payer_kind: "personal", billing_company_id: null }, "NILOS FRANCE"), {
    societe: null,
    paye_par: "particulier",
  });
  assert.deepEqual(dossierPayerLine({ billing_company_id: "soc" }, "EXPONENTIEL"), {
    societe: "EXPONENTIEL",
    paye_par: "société",
  });
});

test("formalites lists visa requests by created_at", async () => {
  const orders: { table: string; column: string }[] = [];
  const admin = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        is() {
          return api;
        },
        order(column: string) {
          orders.push({ table, column });
          return api;
        },
        limit() {
          return api;
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          const data =
            table === "crm_visa_requests"
              ? [
                  { booking_id: BOOKING, country: "IL", status: "en_cours", step: "paiement" },
                  { booking_id: BOOKING, country: "US", status: "piece", step: "piece" },
                ]
              : [];
          resolve({ data, error: null });
        },
      };
      return api;
    },
  };
  const result = await readFormalites({}, admin as unknown as SupabaseClient);
  assert.equal(
    orders.some((row) => row.table === "crm_visa_requests" && row.column === "updated_at"),
    false
  );
  assert.equal(
    orders.some((row) => row.table === "crm_visa_requests" && row.column === "created_at"),
    true
  );
  assert.equal(result.demandes.length, 1);
  assert.equal(result.demandes[0].statut, "en_cours");
  assert.equal(result.demandes[0].lien, `/admin/reservations/${BOOKING}`);
});

test("formalites keeps the dossier named by reference", async () => {
  const OTHER = "99999999-9999-4999-8999-999999999999";
  const eqs: { table: string; column: string; value: unknown }[] = [];
  const admin = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          eqs.push({ table, column, value });
          return api;
        },
        is() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        in() {
          return api;
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          if (table === "crm_bookings") {
            const reference = [...eqs].reverse().find((row) => row.table === table && row.column === "reference")?.value;
            const id = [...eqs].reverse().find((row) => row.table === table && row.column === "id")?.value;
            const rows = [{ id: BOOKING, reference: "TB-2026-0082" }].filter((row) => {
              if (reference && row.reference !== reference) return false;
              if (id && row.id !== id) return false;
              return true;
            });
            resolve({ data: rows, error: null });
            return;
          }
          const bookingEq = eqs.find((row) => row.table === table && row.column === "booking_id")?.value;
          const data =
            table === "crm_visa_requests"
              ? [
                  { booking_id: BOOKING, country: "IL", status: "en_cours", step: "paiement" },
                  { booking_id: OTHER, country: "US", status: "en_cours", step: "paiement" },
                ]
              : table === "crm_visa_tasks"
                ? [
                    { booking_id: BOOKING, holder_name: "Camille", reference: "TB-2026-0082", reasons: [] },
                    { booking_id: OTHER, holder_name: "Autre", reference: "TB-1", reasons: [] },
                  ]
                : [];
          resolve({
            data: data.filter((row) => !bookingEq || row.booking_id === bookingEq),
            error: null,
          });
        },
      };
      return api;
    },
  };
  const result = await readFormalites({ reference: "TB-2026-0082" }, admin as unknown as SupabaseClient);
  assert.equal("introuvable" in result, false);
  assert.equal(result.demandes.length, 1);
  assert.equal(result.taches.length, 1);
  assert.equal(result.taches[0].voyageur, "Camille");
  assert.equal(
    eqs.some((row) => row.table === "crm_visa_requests" && row.column === "booking_id" && row.value === BOOKING),
    true
  );
  const missing = await readFormalites({ reference: "TB-INCONNU" }, admin as unknown as SupabaseClient);
  assert.equal(missing.introuvable, true);
  assert.equal(missing.demandes.length, 0);
  assert.equal(missing.taches.length, 0);
});

const DOSSIER_79 = "4fabc2da-368c-4087-9733-dfe4e6f1da85";
const DOSSIER_82 = "56dada19-5b06-4690-9d43-4decbdb28e5b";
const DOSSIER_88 = "6ca304b2-ed11-4a68-882f-e6833b07359d";
const SOCIETE_79 = "34301497-a484-42d2-a198-2e7c62cc610b";
const SOCIETE_82 = "169a6454-d7d2-4cdc-911d-3e6d81ac3359";
const SOCIETE_88 = "5eea47ae-9b38-4eda-b2bc-5a48b0ebf460";
const CLIENT = "11111111-1111-4111-8111-111111111111";

type Call = { method: string; args: unknown[] };

function chain(answer: (calls: Call[]) => { data: unknown; error: { code?: string; message?: string } | null }) {
  const calls: Call[] = [];
  const api: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "is", "or", "neq", "gte", "lte", "not"]) {
    api[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return api;
    };
  }
  api.then = (resolve: (value: { data: unknown; error: { code?: string; message?: string } | null }) => void) => {
    resolve(answer(calls));
  };
  return api;
}

function bookingRow(reference: string, id: string, companyId: string, total: number) {
  return {
    id,
    reference,
    title: reference,
    destination: null,
    status: reference === "TB-2026-0088" ? "draft" : "confirmed",
    start_date: "2026-11-01",
    end_date: "2026-11-08",
    currency: "EUR",
    total_amount: total,
    agency_commission: false,
    visible_to_client: reference !== "TB-2026-0088",
    customer_id: CLIENT,
    client_settles_stay: false,
    include_in_ledger: true,
    billing_company_id: companyId,
    payer_kind: "company",
  };
}

const CARDS_79 = [
  { id: "f1", kind: "flight", title: "Aller", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: {}, lifecycle: "active", visible_to_client: true, sort_order: 0 },
  { id: "f2", kind: "flight", title: "Retour", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: {}, lifecycle: "active", visible_to_client: true, sort_order: 1 },
  { id: "h1", kind: "hotel", title: "Hôtel", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: {}, lifecycle: "active", visible_to_client: true, sort_order: 2 },
  { id: "h2", kind: "hotel", title: "Hôtel 2", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: {}, lifecycle: "active", visible_to_client: true, sort_order: 3 },
  { id: "fee", kind: "expense", title: "Frais de billeterie", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: { auto_fee: "ticketing" }, lifecycle: "active", visible_to_client: false, sort_order: 4 },
  { id: "f3", kind: "flight", title: "Segment", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: {}, lifecycle: "active", visible_to_client: true, sort_order: 5 },
  { id: "f4", kind: "flight", title: "Segment 2", supplier: null, confirmation_ref: null, start_at: null, end_at: null, details: {}, lifecycle: "active", visible_to_client: true, sort_order: 6 },
];

const AMOUNT_ITEMS = [
  { booking_id: DOSSIER_79, kind: "flight", amount: 1205.93, lifecycle: "active", details: { ticket_count: 1 }, include_in_ledger: true },
  { booking_id: DOSSIER_79, kind: "hotel", amount: 1182, lifecycle: "active", details: null, include_in_ledger: true },
  { booking_id: DOSSIER_79, kind: "hotel", amount: 1361.24, lifecycle: "active", details: null, include_in_ledger: true },
  { booking_id: DOSSIER_79, kind: "expense", amount: 25, lifecycle: "active", details: { auto_fee: "ticketing" }, include_in_ledger: true },
  { booking_id: DOSSIER_82, kind: "flight", amount: 977.88, lifecycle: "active", details: { ticket_count: 1 }, include_in_ledger: true },
  { booking_id: DOSSIER_82, kind: "hotel", amount: 994.08, lifecycle: "active", details: null, include_in_ledger: true },
  { booking_id: DOSSIER_82, kind: "expense", amount: 25, lifecycle: "active", details: { auto_fee: "ticketing" }, include_in_ledger: true },
  { booking_id: DOSSIER_82, kind: "visa", amount: 25, lifecycle: "active", details: null, include_in_ledger: true },
  { booking_id: DOSSIER_88, kind: "expense", amount: 50, lifecycle: "active", details: { auto_fee: "ticketing" }, include_in_ledger: true },
];

function dossierClient(options: { fail?: "societe" | "cartes" | "montant" } = {}) {
  const bookings = [
    bookingRow("TB-2026-0079", DOSSIER_79, SOCIETE_79, 3749.17),
    bookingRow("TB-2026-0082", DOSSIER_82, SOCIETE_82, 1971.96),
    bookingRow("TB-2026-0088", DOSSIER_88, SOCIETE_88, 52242.39),
  ];
  const companies = [
    { id: SOCIETE_79, company_name: "NILOS FRANCE" },
    { id: SOCIETE_82, company_name: "RB&A" },
    { id: SOCIETE_88, company_name: "ATELIER" },
  ];
  return {
    from(table: string) {
      return chain((calls) => {
        const failed = { data: null, error: { code: "42501", message: "permission denied for schema crm_private" } };
        if (table === "crm_bookings") {
          const reference = [...calls].reverse().find((call) => call.method === "eq" && call.args[0] === "reference")?.args[1];
          const id = [...calls].reverse().find((call) => call.method === "eq" && call.args[0] === "id")?.args[1];
          const rows = bookings.filter((row) => {
            if (reference && row.reference !== reference) return false;
            if (id && row.id !== id) return false;
            return true;
          });
          return { data: rows, error: null };
        }
        if (table === "crm_billing_companies") {
          if (options.fail === "societe") return failed;
          const ids = calls.find((call) => call.method === "in" && call.args[0] === "id")?.args[1];
          const wanted = new Set(Array.isArray(ids) ? ids : []);
          return { data: companies.filter((row) => wanted.has(row.id)), error: null };
        }
        if (table === "crm_booking_items") {
          const amountQuery = calls.some((call) => call.method === "in" && call.args[0] === "kind");
          if (amountQuery) {
            if (options.fail === "montant") return failed;
            const ids = calls.find((call) => call.method === "in" && call.args[0] === "booking_id")?.args[1];
            const wanted = new Set(Array.isArray(ids) ? ids : []);
            return { data: AMOUNT_ITEMS.filter((row) => wanted.has(row.booking_id)), error: null };
          }
          if (options.fail === "cartes") return failed;
          return { data: CARDS_79, error: null };
        }
        if (table === "crm_booking_travelers") {
          if (options.fail === "montant" && calls.some((call) => call.method === "in")) return failed;
          const ids = calls.find((call) => call.method === "in" && call.args[0] === "booking_id")?.args[1];
          const wanted = new Set(Array.isArray(ids) ? (ids as string[]) : [DOSSIER_79]);
          return {
            data: [...wanted].map((booking_id) => ({ booking_id, first_name: "Camille", last_name: "Martin" })),
            error: null,
          };
        }
        if (table === "crm_customers") {
          return { data: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }], error: null };
        }
        return { data: [], error: null };
      });
    },
  } as unknown as SupabaseClient;
}

test("fiche et recherche montrent la société, les cartes et le même montant", async () => {
  const admin = dossierClient();
  const fiche79 = await readFicheDossier({ reference: "TB-2026-0079" }, admin);
  assert.ok("cartes" in fiche79);
  assert.equal(fiche79.societe, "NILOS FRANCE");
  assert.equal(fiche79.paye_par, "société");
  assert.equal(fiche79.cartes.length, 7);
  assert.equal(fiche79.montant, formatMoney(3774.17, "EUR"));

  const fiche82 = await readFicheDossier({ reference: "TB-2026-0082" }, admin);
  assert.ok("cartes" in fiche82);
  assert.equal(fiche82.societe, "RB&A");
  assert.equal(fiche82.montant, formatMoney(2021.96, "EUR"));

  const fiche88 = await readFicheDossier({ reference: "TB-2026-0088" }, admin);
  assert.ok("cartes" in fiche88);
  assert.equal(fiche88.societe, "ATELIER");
  assert.equal(fiche88.paye_par, "société");
  assert.equal(fiche88.montant, formatMoney(52292.39, "EUR"));

  const list = await readChercherDossiers({ q: "", etat: null }, admin);
  assert.ok("dossiers" in list);
  const byRef = new Map(list.dossiers.map((row) => [row.reference, row]));
  assert.equal(byRef.get("TB-2026-0079")?.montant, fiche79.montant);
  assert.equal(byRef.get("TB-2026-0079")?.societe, "NILOS FRANCE");
  assert.equal(byRef.get("TB-2026-0082")?.montant, fiche82.montant);
  assert.equal(byRef.get("TB-2026-0082")?.societe, "RB&A");
  assert.equal(byRef.get("TB-2026-0088")?.societe, "ATELIER");
});

test("une lecture société ou cartes en échec remonte, elle ne vide pas la fiche", async () => {
  await assert.rejects(
    () => readFicheDossier({ reference: "TB-2026-0079" }, dossierClient({ fail: "societe" })),
    (err: unknown) => err instanceof McpReadError && err.message === "Lecture de la société impossible."
  );
  await assert.rejects(
    () => readFicheDossier({ reference: "TB-2026-0079" }, dossierClient({ fail: "cartes" })),
    (err: unknown) => err instanceof McpReadError && err.message === "Lecture des cartes impossible."
  );
  await assert.rejects(
    () => readChercherDossiers({ q: "", etat: null }, dossierClient({ fail: "montant" })),
    (err: unknown) => err instanceof McpReadError && err.message === "Lecture du montant impossible."
  );
});
