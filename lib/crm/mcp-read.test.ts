import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatMoney } from "./money";
import { McpReadError } from "./mcp-passport";
import { dossierPayerLine, mcpTripCost, readChercherDossiers, readFicheClient, readFicheDossier, readFormalites, readGrandLivre } from "./mcp-read";
import type { TripCost } from "./trip-costs";

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

test("chaque coût de comptabilite_voyage porte cout_id et sortie_id", () => {
  const cost: TripCost = {
    id: "44444444-4444-4444-8444-444444444444",
    bookingId: BOOKING,
    bookingItemId: null,
    source: "pliant",
    sourceId: "33333333-3333-4333-8333-333333333333",
    amountEur: 2108.96,
    originalAmount: 2108.96,
    originalCurrency: "EUR",
    supplier: "AIR FRANCE",
    occurredOn: "2026-11-03",
    instrument: "pliant_card",
    instrumentDetail: "4242",
    state: "posted",
  };
  const line = mcpTripCost(cost);
  assert.equal(line.cout_id, cost.id);
  assert.equal(line.sortie_id, cost.sourceId);
  assert.equal(line.source, "Pliant");
  assert.equal(line.fournisseur, "AIR FRANCE");
  assert.match(line.montant, /2[\s\u202f]?108,96/);
  assert.equal(line.etat, "confirmé");
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

const STAFF_MARIE = "55555555-5555-4555-8555-555555555555";

function bookingRow(reference: string, id: string, companyId: string, total: number, ownerId: string | null = null) {
  return {
    id,
    reference,
    owner_staff_id: ownerId,
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
  { booking_id: DOSSIER_88, kind: "flight", amount: 3495, start_at: "2026-12-25T12:10:00", lifecycle: "active", details: { ticket_count: 2, from: "CDG", to: "HKT" }, include_in_ledger: false },
  { booking_id: DOSSIER_88, kind: "hotel", amount: 21842.11, lifecycle: "active", details: null, include_in_ledger: false },
  { booking_id: DOSSIER_88, kind: "hotel", amount: 17062.28, lifecycle: "active", details: null, include_in_ledger: false },
  { booking_id: DOSSIER_88, kind: "flight", amount: 3174, start_at: "2027-01-08T11:55:00", lifecycle: "active", details: { ticket_count: 2, from: "HKT", to: "CDG" }, include_in_ledger: false },
  { booking_id: DOSSIER_88, kind: "expense", amount: 50, lifecycle: "active", details: { auto_fee: "ticketing" }, include_in_ledger: true },
];

function dossierClient(options: { fail?: "societe" | "cartes" | "montant" } = {}) {
  const bookings = [
    bookingRow("TB-2026-0079", DOSSIER_79, SOCIETE_79, 3749.17, STAFF_MARIE),
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
            data: [...wanted].map((booking_id) => ({
              id: "trav-camille",
              booking_id,
              first_name: "Camille",
              last_name: "Martin",
            })),
            error: null,
          };
        }
        if (table === "crm_customers") {
          return { data: [{ id: CLIENT, first_name: "Camille", last_name: "Martin" }], error: null };
        }
        if (table === "crm_staff") {
          return { data: [{ id: STAFF_MARIE, full_name: "Marie Martin" }], error: null };
        }
        if (table === "crm_booking_cards") {
          const bookingId = calls.find((call) => call.method === "eq" && call.args[0] === "booking_id")?.args[1];
          if (bookingId !== DOSSIER_88) return { data: [], error: null };
          return {
            data: [
              {
                id: "card-88",
                label: "Phulay Bay",
                limit_cents: 1000,
                currency: "EUR",
                status: "locked",
                last4: "4242",
              },
            ],
            error: null,
          };
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
  assert.equal(fiche79.cartes[0]?.carte_id, "f1");
  assert.ok(fiche79.cartes.every((carte) => carte.carte_id));
  assert.equal(fiche79.montant, formatMoney(3774.17, "EUR"));
  assert.equal(fiche79.voyageurs[0]?.voyageur_id, "trav-camille");
  assert.equal(fiche79.voyageurs[0]?.nom, "Camille Martin");
  assert.equal(fiche79.commission_agence, "10 %");
  assert.equal(fiche79.commission_source, "defaut");
  assert.equal(fiche79.commission_appliquee, false);
  assert.equal(fiche79.en_charge, "Marie Martin");

  const fiche82 = await readFicheDossier({ reference: "TB-2026-0082" }, admin);
  assert.ok("cartes" in fiche82);
  assert.equal(fiche82.societe, "RB&A");
  assert.equal(fiche82.montant, formatMoney(2021.96, "EUR"));

  const fiche88 = await readFicheDossier({ reference: "TB-2026-0088" }, admin);
  assert.ok("cartes" in fiche88);
  assert.ok("cartes_pliant" in fiche88);
  assert.equal(fiche88.cartes_pliant.length, 1);
  assert.equal(fiche88.cartes_pliant[0]?.statut, "bloquée");
  assert.equal(fiche88.cartes_pliant[0]?.nom, "Phulay Bay");
  assert.equal(fiche88.societe, "ATELIER");
  assert.equal(fiche88.paye_par, "société");
  assert.equal(fiche88.montant, formatMoney(52292.39, "EUR"));

  const list = await readChercherDossiers({ q: "", etat: null }, admin);
  assert.ok("dossiers" in list);
  const byRef = new Map(list.dossiers.map((row) => [row.reference, row]));
  assert.equal(byRef.get("TB-2026-0079")?.montant, fiche79.montant);
  assert.equal(byRef.get("TB-2026-0079")?.societe, "NILOS FRANCE");
  assert.equal(byRef.get("TB-2026-0079")?.en_charge, "Marie Martin");
  assert.equal(byRef.get("TB-2026-0082")?.en_charge, null);
  assert.equal(byRef.get("TB-2026-0082")?.montant, fiche82.montant);
  assert.equal(byRef.get("TB-2026-0082")?.societe, "RB&A");
  assert.equal(byRef.get("TB-2026-0088")?.societe, "ATELIER");
});

test("chercher_dossiers suit l’ordre renvoyé par la recherche indexée", async () => {
  const base = dossierClient();
  const admin = {
    rpc: async (name: string, args: { q: string }) => {
      assert.equal(name, "crm_attach_booking_search");
      assert.equal(args.q, "atelier");
      return { data: [{ id: DOSSIER_88 }, { id: DOSSIER_79 }], error: null };
    },
    from: (table: string) => base.from(table),
  };
  const list = await readChercherDossiers({ q: "atelier", etat: null }, admin as unknown as SupabaseClient);
  assert.deepEqual(
    list.dossiers.map((row) => row.reference),
    ["TB-2026-0088", "TB-2026-0079", "TB-2026-0082"]
  );
  const none = {
    rpc: async () => ({ data: [], error: null }),
    from() {
      throw new Error("aucune lecture");
    },
  };
  const empty = await readChercherDossiers({ q: "inconnu", etat: null }, none as unknown as SupabaseClient);
  assert.deepEqual(empty.dossiers, []);
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

test("fiche_client et grand_livre retrouvent Prénom Nom", async () => {
  const CLIENT = "a67a720e-149f-41f3-a4f1-a1fa3ffad3f4";
  const norman = {
    id: CLIENT,
    first_name: "Norman",
    last_name: "Cohen",
    usage_name: null,
    company_name: null,
    email: null,
    phone: null,
    on_hold: false,
    created_at: "2026-01-01",
  };
  const admin = {
    from(table: string) {
      let pattern = "";
      const api = {
        select() {
          return api;
        },
        order() {
          return api;
        },
        or(filter: string) {
          pattern = filter;
          return api;
        },
        eq() {
          return api;
        },
        in() {
          return api;
        },
        is() {
          return api;
        },
        not() {
          return api;
        },
        gte() {
          return api;
        },
        lte() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: table === "crm_customers" ? { company_role: null, spending_allowance: null } : null, error: null });
        },
        then(resolve: (value: { data: unknown; error: null }) => void) {
          if (table !== "crm_customers") {
            resolve({ data: [], error: null });
            return;
          }
          resolve({ data: /cohen|norman/i.test(pattern) ? [norman] : [], error: null });
        },
      };
      return api;
    },
  } as unknown as SupabaseClient;
  const fiche = await readFicheClient({ q: "Norman Cohen" }, admin);
  assert.equal("introuvable" in fiche, false);
  assert.equal((fiche as { id?: string }).id, CLIENT);
  assert.deepEqual((fiche as { societes?: unknown[] }).societes, []);
  const book = await readGrandLivre({ q: "cohen norman" }, admin);
  assert.equal("introuvable" in book, false);
});

test("fiche_client liste chaque société avec son identifiant", async () => {
  const holder = "12121212-1212-4121-8121-121212121212";
  const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const customer = {
    id: holder,
    first_name: "Camille",
    last_name: "Martin",
    usage_name: null,
    company_name: "Atelier",
    email: "camille@example.com",
    phone: "+33600000000",
    birth_date: null,
    on_hold: false,
  };
  const companies = [
    {
      id: second,
      company_name: "Bureau LLC",
      siret: null,
      vat_number: null,
      billing_email: "compta@bureau.test",
      billing_address_line: "1 Main",
      billing_postal_code: "19801",
      billing_city: "Wilmington",
      billing_country: "US",
      sort_order: 1,
      funding: null,
    },
    {
      id: first,
      company_name: "Atelier",
      siret: "73282932000074",
      vat_number: "FR88732829320",
      billing_email: "atelier@example.com",
      billing_address_line: "10 rue",
      billing_postal_code: "75002",
      billing_city: "Paris",
      billing_country: "FR",
      sort_order: 0,
      funding: "advance",
    },
  ];
  const admin = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        not() {
          return api;
        },
        gte() {
          return api;
        },
        lte() {
          return api;
        },
        is() {
          return api;
        },
        in() {
          return api;
        },
        or() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve({
            data: table === "crm_customers" ? customer : null,
            error: null,
          });
        },
        then(resolve: (value: { data: unknown; error: { code?: string } | null }) => void) {
          if (table === "crm_billing_companies") resolve({ data: companies, error: null });
          else resolve({ data: [], error: null });
        },
      };
      return api;
    },
  } as unknown as SupabaseClient;
  const fiche = await readFicheClient({ id: holder }, admin);
  assert.equal("societes" in fiche, true);
  if (!("societes" in fiche)) return;
  assert.equal(fiche.societe, "Atelier");
  assert.equal(fiche.telephone, "+33600000000");
  assert.equal(fiche.societes.length, 2);
  assert.equal(fiche.societes[0]?.id, first);
  assert.equal(fiche.societes[0]?.principale, true);
  assert.equal(fiche.societes[0]?.siret, "73282932000074");
  assert.equal(fiche.societes[0]?.tva, "FR88732829320");
  assert.equal(fiche.societes[0]?.email, "atelier@example.com");
  assert.equal(fiche.societes[0]?.adresse, "10 rue");
  assert.equal(fiche.societes[0]?.compte, "avance");
  assert.equal(fiche.societes[1]?.raison_sociale, "Bureau LLC");
  assert.equal(fiche.societes[1]?.principale, false);
  assert.equal(fiche.societes[1]?.ville, "Wilmington");
  assert.equal(fiche.societes[1]?.pays, "US");
  const failed = {
    from(table: string) {
      const api = {
        select() {
          return api;
        },
        eq() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        not() {
          return api;
        },
        gte() {
          return api;
        },
        lte() {
          return api;
        },
        is() {
          return api;
        },
        in() {
          return api;
        },
        or() {
          return api;
        },
        maybeSingle() {
          return Promise.resolve({ data: table === "crm_customers" ? customer : null, error: null });
        },
        then(resolve: (value: { data: unknown; error: { code?: string } | null }) => void) {
          if (table === "crm_billing_companies") resolve({ data: null, error: { code: "42501" } });
          else resolve({ data: [], error: null });
        },
      };
      return api;
    },
  } as unknown as SupabaseClient;
  await assert.rejects(
    () => readFicheClient({ id: holder }, failed),
    (err: unknown) => err instanceof McpReadError && err.message === "Lecture des sociétés impossible."
  );
});
