import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  inviteAgain,
  inviteClientAccess,
  prepareCompanyRole,
  prepareHolderProfile,
  setCompanyRole,
  updateHolderProfile,
} from "./mcp-account";
import { McpWriteError } from "./mcp-write";
import type { CrmCustomer } from "./types";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const BOOKING = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HOLDER_DOC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER_DOC = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const COMPANION_DOC = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TRAVELER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMPANION_TRAVELER = "abababab-abab-4aba-8aba-abababababab";
const AUTH = "99999999-9999-4999-8999-999999999999";

type Row = Record<string, unknown>;

function memoryAdmin(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row = {};
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
      is(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column: string, values: unknown[]) {
        const allowed = new Set(values);
        filters.push((row) => allowed.has(row[column]));
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        return Promise.resolve(finish(false));
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        return Promise.resolve(list()).then(resolve);
      },
    };
    function matched() {
      return tables[table].filter((row) => filters.every((filter) => filter(row)));
    }
    function apply() {
      if (op === "insert") {
        const row = { ...payload, id: payload.id || "00000000-0000-4000-8000-000000000099" };
        tables[table].push(row);
        return [row];
      }
      if (op === "update") {
        const hits = matched();
        for (const row of hits) Object.assign(row, payload);
        return hits;
      }
      if (op === "delete") {
        const removed = matched();
        tables[table] = tables[table].filter((row) => !removed.includes(row));
        return removed;
      }
      return matched();
    }
    function list() {
      return { data: apply(), error: null as null };
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

function holder(extra: Row = {}) {
  return {
    id: CLIENT,
    first_name: "Camille",
    last_name: "Martin",
    usage_name: null,
    birth_date: "1985-10-12",
    sex: "F",
    nationality: "FR",
    address_line: null,
    postal_code: null,
    city: null,
    country: "FR",
    email: "camille@example.com",
    phone: "+33601020304",
    auth_user_id: null,
    company_role: null,
    billing_parent_id: null,
    spending_allowance: null,
    ...extra,
  };
}

function seed(extra: Record<string, Row[]> = {}) {
  return memoryAdmin({
    crm_customers: [holder(), { id: ADMIN, first_name: "Raphaël", last_name: "Bernard", company_role: "admin", billing_parent_id: null, email: "raphael@example.com" }],
    crm_bookings: [{ id: BOOKING, customer_id: CLIENT }],
    crm_booking_travelers: [
      { id: TRAVELER, booking_id: BOOKING, is_account_holder: true, first_name: "Camille", last_name: "Martin" },
      { id: COMPANION_TRAVELER, booking_id: BOOKING, is_account_holder: false, first_name: "Louis", last_name: "Martin" },
    ],
    crm_travel_documents: [
      {
        id: HOLDER_DOC,
        customer_id: CLIENT,
        companion_id: null,
        booking_id: null,
        doc_type: "passport",
        issuing_country: "FR",
        number: "12AB34567",
        first_name: "Camille",
        last_name: "Martin",
        usage_name: null,
        birth_date: "1985-10-12",
        sex: "F",
        nationality: "FR",
        place_of_birth: "Paris",
        issued_on: "2018-03-12",
      },
      {
        id: COMPANION_DOC,
        customer_id: CLIENT,
        companion_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        booking_id: null,
        doc_type: "passport",
        issuing_country: "FR",
        number: "99ZZ00000",
        first_name: "Louis",
        last_name: "Martin",
      },
    ],
    crm_staff: [],
    crm_audit_events: [],
    ...extra,
  });
}

function asAdmin(db: ReturnType<typeof memoryAdmin>) {
  return db as unknown as SupabaseClient;
}

test("la fiche du titulaire reprend les champs de l’accompagnateur, le livret et l’adresse", () => {
  const draft = prepareHolderProfile({
    id: CLIENT,
    prenoms: "Camille Louise",
    nom: "Martin",
    nom_passeport: "Dupont",
    nom_usage: "Martin",
    date_naissance: "1985-10-12",
    lieu_naissance: "Levallois-Perret",
    sexe: "femme",
    nationalite: "Française",
    delivrance: "2020-01-02",
    adresse: "12 rue du Bois",
    code_postal: "92200",
    ville: "Neuilly-sur-Seine",
    pays: "France",
    pays_passeport: "FR",
  });
  assert.equal(draft.customer.first_name, "Camille Louise");
  assert.equal(draft.customer.last_name, "Martin");
  assert.equal(draft.customer.usage_name, "Martin");
  assert.equal(draft.customer.birth_date, "1985-10-12");
  assert.equal(draft.customer.sex, "F");
  assert.equal(draft.customer.nationality, "FR");
  assert.equal(draft.customer.address_line, "12 rue du Bois");
  assert.equal(draft.customer.country, "FR");
  assert.equal("billing_address_line" in draft.customer, false);
  assert.equal(draft.passport.last_name, "Dupont");
  assert.equal(draft.passport.first_name, "Camille Louise");
  assert.equal(draft.passport.place_of_birth, "Levallois-Perret");
  assert.equal(draft.passport.issued_on, "2020-01-02");
  assert.equal(draft.passport.nationality, "FR");
  assert.equal("number" in draft.passport, false);
  assert.equal("issuing_country" in draft.passport, false);
  assert.equal(draft.paysPasseport, "FR");
  assert.equal(draft.documentSpecific, true);
  assert.throws(() => prepareHolderProfile({ id: CLIENT }), /modifier/);
  assert.throws(() => prepareHolderProfile({ id: CLIENT, nationalite: "Martienne" }), /Nationalité/);
  assert.throws(() => prepareHolderProfile({ id: CLIENT, delivrance: "12/03/2018" }), /AAAA-MM-JJ/);
  assert.throws(() => prepareHolderProfile({ id: CLIENT, sexe: "oui" }), /Sexe/);
  assert.throws(() => prepareHolderProfile({ id: CLIENT, pays_passeport: "FR" }), /modifier/);
});

test("le nom de la fiche et le nom du passeport restent distincts", async () => {
  const db = seed();
  const result = await updateHolderProfile(
    { id: CLIENT, nom: "Bernard", nom_passeport: "Dupont", prenoms: "Camille Louise", adresse: "12 rue du Bois" },
    asAdmin(db)
  );
  const customer = db.tables.crm_customers.find((row) => row.id === CLIENT);
  const passport = db.tables.crm_travel_documents.find((row) => row.id === HOLDER_DOC);
  const companion = db.tables.crm_travel_documents.find((row) => row.id === COMPANION_DOC);
  const traveler = db.tables.crm_booking_travelers.find((row) => row.id === TRAVELER);
  const other = db.tables.crm_booking_travelers.find((row) => row.id === COMPANION_TRAVELER);
  assert.equal(customer?.last_name, "Bernard");
  assert.equal(customer?.first_name, "Camille Louise");
  assert.equal(customer?.address_line, "12 rue du Bois");
  assert.equal("billing_address_line" in (customer || {}), false);
  assert.equal(passport?.last_name, "Dupont");
  assert.equal(passport?.first_name, "Camille Louise");
  assert.equal(passport?.number, "12AB34567");
  assert.equal(companion?.last_name, "Martin");
  assert.equal(companion?.number, "99ZZ00000");
  assert.equal(traveler?.last_name, "Bernard");
  assert.equal(other?.last_name, "Martin");
  assert.equal(result.notifie, false);
  assert.equal(JSON.stringify(result).includes("12AB34567"), false);
  assert.equal(JSON.stringify(db.tables.crm_audit_events).includes("12AB34567"), false);
  const audit = db.tables.crm_audit_events[0];
  assert.equal(audit?.action, "fiche_titulaire");
  assert.equal(audit?.source, "mcp");
});

test("plusieurs passeports : la délivrance attend le pays, et l’autre livret reste", async () => {
  const db = seed({
    crm_travel_documents: [
      {
        id: HOLDER_DOC,
        customer_id: CLIENT,
        companion_id: null,
        booking_id: null,
        doc_type: "passport",
        issuing_country: "FR",
        number: "12AB34567",
        issued_on: "2018-03-12",
        last_name: "Martin",
      },
      {
        id: OTHER_DOC,
        customer_id: CLIENT,
        companion_id: null,
        booking_id: null,
        doc_type: "passport",
        issuing_country: "IL",
        number: "IL998877",
        issued_on: "2019-04-01",
        last_name: "Martin",
      },
    ],
  });
  await assert.rejects(
    () => updateHolderProfile({ id: CLIENT, delivrance: "2024-05-06", nom: "Bernard" }, asAdmin(db)),
    McpWriteError
  );
  assert.equal(db.tables.crm_customers.find((row) => row.id === CLIENT)?.last_name, "Martin");
  assert.equal(db.tables.crm_travel_documents.find((row) => row.id === OTHER_DOC)?.issued_on, "2019-04-01");
  const updated = await updateHolderProfile(
    { id: CLIENT, delivrance: "2024-05-06", pays_passeport: "Israël" },
    asAdmin(db)
  );
  assert.equal(db.tables.crm_travel_documents.find((row) => row.id === OTHER_DOC)?.issued_on, "2024-05-06");
  assert.equal(db.tables.crm_travel_documents.find((row) => row.id === HOLDER_DOC)?.issued_on, "2018-03-12");
  assert.equal(db.tables.crm_travel_documents.find((row) => row.id === OTHER_DOC)?.number, "IL998877");
  assert.equal(updated.pays_passeport, "IL");
  assert.equal(updated.nationalite, undefined);
});

test("sans livret, la délivrance crée le passeport du titulaire, sans numéro et sans message", async () => {
  const db = seed({ crm_travel_documents: [] });
  const result = await updateHolderProfile(
    { id: CLIENT, delivrance: "2021-02-03", lieu_naissance: "Lyon", prenoms: "Camille Louise" },
    asAdmin(db)
  );
  const created = db.tables.crm_travel_documents.filter((row) => row.customer_id === CLIENT);
  assert.equal(created.length, 1);
  assert.equal(created[0].doc_type, "passport");
  assert.equal(created[0].companion_id, null);
  assert.equal(created[0].issued_on, "2021-02-03");
  assert.equal(created[0].place_of_birth, "Lyon");
  assert.equal(created[0].first_name, "Camille Louise");
  assert.equal(created[0].number ?? null, null);
  assert.equal(result.passeport, true);
  assert.equal(result.notifie, false);
});

test("le rôle société suit la fiche : admin, membre, particulier", async () => {
  assert.equal(prepareCompanyRole({ id: CLIENT, role: "ADMIN" }).role, "admin");
  assert.equal(prepareCompanyRole({ id: CLIENT, role: "membre", payeur_id: ADMIN }).payeurId, ADMIN);
  assert.throws(() => prepareCompanyRole({ id: CLIENT, role: "membre" }), /admin société/);
  assert.throws(() => prepareCompanyRole({ id: CLIENT, role: "membre", payeur_id: CLIENT }), /lui-même/);
  assert.throws(() => prepareCompanyRole({ id: CLIENT, role: "directeur" }), /Rôle inconnu/);
  assert.throws(() => prepareCompanyRole({ id: CLIENT, role: "membre", payeur_id: ADMIN, droit_depense: "-1" }), /euros/);

  const db = seed();
  const adminRole = await setCompanyRole({ id: CLIENT, role: "admin", droit_depense: "10000" }, asAdmin(db));
  assert.equal(adminRole.role, "admin");
  assert.equal(adminRole.payeur_id, null);
  assert.equal(adminRole.droit_depense, 10000);
  assert.equal(adminRole.notifie, false);
  let customer = db.tables.crm_customers.find((row) => row.id === CLIENT);
  assert.equal(customer?.company_role, "admin");
  assert.equal(customer?.billing_parent_id, null);

  const member = await setCompanyRole({ id: CLIENT, role: "membre", payeur_id: ADMIN }, asAdmin(db));
  assert.equal(member.role, "membre");
  assert.equal(member.payeur_id, ADMIN);
  customer = db.tables.crm_customers.find((row) => row.id === CLIENT);
  assert.equal(customer?.company_role, "member");
  assert.equal(customer?.billing_parent_id, ADMIN);
  assert.equal(customer?.spending_allowance, 10000);

  db.tables.crm_customers.find((row) => row.id === ADMIN)!.company_role = "member";
  await assert.rejects(() => setCompanyRole({ id: CLIENT, role: "membre", payeur_id: ADMIN }, asAdmin(db)), /Admin société/);
  assert.equal(db.tables.crm_customers.find((row) => row.id === CLIENT)?.billing_parent_id, ADMIN);

  db.tables.crm_customers.find((row) => row.id === ADMIN)!.company_role = "admin";
  db.tables.crm_customers.find((row) => row.id === ADMIN)!.billing_parent_id = CLIENT;
  await assert.rejects(() => setCompanyRole({ id: CLIENT, role: "membre", payeur_id: ADMIN }, asAdmin(db)), /Admin société/);

  const cleared = await setCompanyRole({ id: CLIENT, role: "particulier" }, asAdmin(db));
  customer = db.tables.crm_customers.find((row) => row.id === CLIENT);
  assert.equal(cleared.role, "particulier");
  assert.equal(customer?.company_role, null);
  assert.equal(customer?.billing_parent_id, null);
  assert.equal(customer?.spending_allowance, null);
});

test("l’invitation part une fois, par le flux de la fiche, et le lien ne sort pas", async () => {
  assert.equal(inviteAgain("none"), true);
  assert.equal(inviteAgain("invited"), false);
  assert.equal(inviteAgain("ready"), false);
  const db = seed();
  const calls: string[] = [];
  let status: "none" | "invited" | "ready" = "none";
  const invite = async (customer: CrmCustomer) => {
    calls.push(customer.id);
    customer.auth_user_id = AUTH;
    db.tables.crm_customers.find((row) => row.id === CLIENT)!.auth_user_id = AUTH;
    status = "invited";
    return {
      customer,
      delivered: true,
      link: "https://travelba.fr/e/SECRET",
      whatsapp: { ok: false as const, reason: "no_phone" as const },
      notice: "E-mail envoyé.",
    };
  };
  const first = await inviteClientAccess({ id: CLIENT }, asAdmin(db), {
    invite,
    portal: async () => status,
    origin: "https://travelba.fr",
  });
  assert.equal(first.envoye, true);
  assert.equal(first.email, true);
  assert.equal(first.deja, false);
  assert.equal(first.canal, "email");
  assert.equal(first.acces, "invite");
  assert.equal(first.notifie, true);
  assert.equal(JSON.stringify(first).includes("SECRET"), false);
  assert.equal(JSON.stringify(db.tables.crm_audit_events).includes("SECRET"), false);
  const second = await inviteClientAccess({ id: CLIENT }, asAdmin(db), {
    invite,
    portal: async () => status,
  });
  assert.equal(calls.length, 1);
  assert.equal(second.deja, true);
  assert.equal(second.envoye, false);
  assert.equal(second.notifie, false);
  assert.equal(second.canal, null);

  const whatsapp = seed();
  const sent = await inviteClientAccess({ client_id: CLIENT }, asAdmin(whatsapp), {
    portal: async () => "none",
    invite: async (customer) => ({
      customer,
      delivered: true,
      link: "https://travelba.fr/e/SECRET",
      whatsapp: { ok: true as const, sid: "SM1" },
      notice: "Invitation envoyée par e-mail et sur WhatsApp.",
    }),
  });
  assert.equal(sent.canal, "whatsapp");
  assert.equal(sent.whatsapp, true);

  const silent = seed();
  await assert.rejects(
    () =>
      inviteClientAccess({ id: CLIENT }, asAdmin(silent), {
        portal: async () => "none",
        invite: async () => {
          throw new Error("ne doit pas partir");
        },
      }),
    (err: unknown) => {
      assert.ok(err instanceof McpWriteError);
      return true;
    }
  );
});

test("sans e-mail, ou pour un compte agence, l’invitation ne part pas", async () => {
  const noMail = seed();
  noMail.tables.crm_customers.find((row) => row.id === CLIENT)!.email = "";
  let called = false;
  await assert.rejects(
    () =>
      inviteClientAccess({ id: CLIENT }, asAdmin(noMail), {
        portal: async () => "none",
        invite: async (customer) => {
          called = true;
          return {
            customer,
            delivered: true,
            link: "https://travelba.fr/e/SECRET",
            whatsapp: { ok: false as const, reason: "no_phone" as const },
            notice: "",
          };
        },
      }),
    /e-mail/
  );
  assert.equal(called, false);

  const staff = seed({ crm_staff: [{ id: "staff", auth_user_id: AUTH }] });
  staff.tables.crm_customers.find((row) => row.id === CLIENT)!.auth_user_id = AUTH;
  await assert.rejects(
    () =>
      inviteClientAccess({ id: CLIENT }, asAdmin(staff), {
        portal: async () => "none",
        invite: async (customer) => {
          called = true;
          return {
            customer,
            delivered: true,
            link: "https://travelba.fr/e/SECRET",
            whatsapp: { ok: false as const, reason: "no_phone" as const },
            notice: "",
          };
        },
      }),
    /client/
  );
  assert.equal(called, false);
});
