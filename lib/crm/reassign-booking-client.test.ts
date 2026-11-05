import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attachSearchFold } from "./attach-search";
import {
  changeBookingClient,
  matchingClientDuplicates,
  planBookingClientChange,
  prepareClientDraft,
  splitTypedClientName,
  travelerIsFormerClient,
  type ReassignPlan,
} from "./reassign-booking-client";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OLD = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BOOK = "33333333-3333-4333-8333-333333333333";
const PARENT = "44444444-4444-4444-8444-444444444444";
const PAYER = "55555555-5555-4555-8555-555555555555";
const COMPANION = "66666666-6666-4666-8666-666666666666";

type Row = Record<string, unknown>;

function memory(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }));
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: { op: "eq" | "in" | "ilike"; column: string; value: unknown }[] = [];
    let action: "select" | "update" | "delete" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row | Row[] | null = null;
    const api = {
      select() {
        return api;
      },
      update(row: Row) {
        action = "update";
        patch = row;
        return api;
      },
      insert(row: Row | Row[]) {
        action = "insert";
        inserted = row;
        return api;
      },
      delete() {
        action = "delete";
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push({ op: "eq", column, value });
        return api;
      },
      in(column: string, value: unknown) {
        filters.push({ op: "in", column, value });
        return api;
      },
      ilike(column: string, value: unknown) {
        filters.push({ op: "ilike", column, value });
        return api;
      },
      limit() {
        return api;
      },
      order() {
        return api;
      },
      maybeSingle() {
        const rows = finish();
        return Promise.resolve({ data: rows[0] || null, error: null });
      },
      single() {
        const rows = finish();
        return Promise.resolve({ data: rows[0] || null, error: rows[0] ? null : { message: "none" } });
      },
      then(resolve: (value: { data: Row[] | null; error: null }) => void) {
        resolve({ data: finish(), error: null });
      },
    };
    function matches(row: Row) {
      return filters.every((filter) => {
        if (filter.op === "eq") return row[filter.column] === filter.value;
        if (filter.op === "in") return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
        return attachSearchFold(String(row[filter.column] || "")) === attachSearchFold(String(filter.value || ""));
      });
    }
    function finish() {
      if (action === "insert") {
        const list = (Array.isArray(inserted) ? inserted : [inserted]).filter(Boolean) as Row[];
        const created = list.map((row) => ({ id: row.id || crypto.randomUUID(), ...row }));
        tables[table].push(...created);
        return created;
      }
      const rows = tables[table].filter(matches);
      if (action === "update") {
        for (const row of rows) Object.assign(row, patch);
      } else if (action === "delete") {
        tables[table] = tables[table].filter((row) => !rows.includes(row));
      }
      return rows;
    }
    return api;
  }
  return { from, tables };
}

function person(id: string, first: string, last: string, extra: Row = {}) {
  return {
    id,
    first_name: first,
    last_name: last,
    email: null,
    phone: null,
    company_name: null,
    company_role: null,
    billing_parent_id: null,
    ...extra,
  };
}

function booking(extra: Row = {}) {
  return {
    id: BOOK,
    reference: "TB-2026-0073",
    title: "Sunny Isles Beach",
    customer_id: OLD,
    billing_customer_id: OLD,
    billing_company_id: "co-old",
    payer_kind: "company",
    fees_follow_stay: true,
    visible_to_client: true,
    ...extra,
  };
}

function base(extra: Record<string, Row[]> = {}) {
  return memory({
    crm_customers: [
      person(OLD, "Jonathan", "Amar", {
        email: "john@johndalia.com",
        phone: "+33610330020",
        company_name: "JOHN DALIA",
        company_role: "admin",
      }),
      person(OTHER, "Jonathan", "Amar", {
        email: "jonathan.amar@example.com",
        phone: "+33601020304",
        birth_date: "1984-06-15",
      }),
    ],
    crm_billing_companies: [
      { id: "co-old", customer_id: OLD, company_name: "JOHN DALIA", siret: "123", sort_order: 0 },
      { id: "co-new", customer_id: OTHER, company_name: "JOHN DALIA", siret: "123", sort_order: 0 },
    ],
    crm_bookings: [booking()],
    crm_booking_travelers: [
      { id: "t-holder", booking_id: BOOK, is_account_holder: true, companion_id: null, first_name: "Jonathan", last_name: "Amar" },
      {
        id: "t-homonym",
        booking_id: BOOK,
        is_account_holder: false,
        companion_id: COMPANION,
        first_name: "Jonathan",
        last_name: "Amar",
      },
    ],
    crm_transactions: [
      { id: "tx1", customer_id: OLD, booking_id: BOOK, billing_company_id: "co-old", direction: "debit" },
      { id: "tx-other", customer_id: OLD, booking_id: "autre", billing_company_id: "co-old" },
    ],
    crm_revolut_transactions: [
      { id: "rev1", matched_customer_id: OLD, matched_booking_id: BOOK, matched_transaction_id: "tx1" },
    ],
    crm_stripe_transactions: [{ id: "st1", matched_customer_id: OLD, matched_transaction_id: "tx1" }],
    crm_pliant_transactions: [{ id: "pl1", customer_id: OLD, matched_customer_id: OLD, booking_id: BOOK }],
    crm_pliant_cards: [{ id: "card1", customer_id: OLD, booking_id: BOOK }],
    crm_booking_items: [{ id: "item1", booking_id: BOOK, billing_company_id: "co-old" }],
    crm_whatsapp_messages: [{ id: "wa1", customer_id: OLD, booking_id: BOOK }],
    ...extra,
  });
}

test("le nom saisi préremplit prénom et nom", () => {
  assert.deepEqual(splitTypedClientName("Jonathan Amar"), { firstName: "Jonathan", lastName: "Amar" });
  assert.deepEqual(splitTypedClientName("  Jean Pierre Martin "), { firstName: "Jean", lastName: "Pierre Martin" });
  assert.equal(prepareClientDraft({ firstName: "Ada", lastName: "Lovelace", email: "Ada@Travelba.fr" }).email, "ada@travelba.fr");
  assert.throws(() => prepareClientDraft({ firstName: "Ada", lastName: "Lovelace", email: "ada" }), /e-mail/);
});

test("un homonyme se reconnaît au nom, à l’e-mail ou au téléphone", () => {
  const hits = matchingClientDuplicates(
    [
      person(OTHER, "Jonathan", "Amar", { email: "autre@example.com" }),
      person(PAYER, "Paul", "Martin", { email: "ada@travelba.fr" }),
      person(PARENT, "Léa", "Martin", { phone: "+33601020304" }),
    ],
    prepareClientDraft({ firstName: "Jonathan", lastName: "Amar", email: "ada@travelba.fr", phone: "06 01 02 03 04" })
  );
  assert.deepEqual(hits.map((hit) => hit.id).sort(), [OTHER, PAYER, PARENT].sort());
});

test("un compagnon homonyme n’est pas le client du dossier", () => {
  assert.equal(
    travelerIsFormerClient(
      { id: "a", is_account_holder: false, companion_id: COMPANION, first_name: "Jonathan", last_name: "Amar" },
      { first_name: "Jonathan", last_name: "Amar" }
    ),
    false
  );
  assert.equal(
    travelerIsFormerClient(
      { id: "b", is_account_holder: true, companion_id: null, first_name: "Jonathan", last_name: "Amar" },
      { first_name: "Jonathan", last_name: "Amar" }
    ),
    true
  );
});

test("l’aperçu ne déplace rien et décrit ce qui suivra", async () => {
  const db = base();
  const preview = await changeBookingClient(db as unknown as SupabaseClient, {
    bookingId: BOOK,
    customerId: OTHER,
  });
  assert.equal(preview.applique, false);
  assert.equal(preview.invite, false);
  assert.equal(preview.messages, false);
  assert.equal(preview.voyageurs, 1);
  assert.equal(preview.ecritures, 1);
  assert.deepEqual(preview.paiements, { revolut: 1, stripe: 1, pliant: 1, cartes: 1 });
  assert.equal(preview.payeur.suit, true);
  assert.match(preview.payeur.apres, /JOHN DALIA/);
  assert.match(preview.resume.join(" "), /ne voit plus/);
  assert.match(preview.resume.join(" "), /Aucun e-mail ni WhatsApp/);
  assert.equal(db.tables.crm_bookings[0].customer_id, OLD);
  assert.equal(db.tables.crm_transactions[0].customer_id, OLD);
  assert.equal(db.tables.crm_whatsapp_messages.length, 1);
});

test("le rattachement déplace le client, le voyageur, le grand livre, les paiements et la société", async () => {
  const db = base();
  const done = await changeBookingClient(db as unknown as SupabaseClient, {
    bookingId: BOOK,
    customerId: OTHER,
    confirmer: true,
  });
  assert.equal(done.applique, true);
  assert.equal(done.invite, false);
  assert.equal(done.nouveau.cree, false);
  assert.equal(db.tables.crm_bookings[0].customer_id, OTHER);
  assert.equal(db.tables.crm_bookings[0].billing_customer_id, OTHER);
  assert.equal(db.tables.crm_bookings[0].billing_company_id, "co-new");
  assert.equal(db.tables.crm_bookings[0].visible_to_client, true);
  const holder = db.tables.crm_booking_travelers.find((row) => row.id === "t-holder");
  const homonym = db.tables.crm_booking_travelers.find((row) => row.id === "t-homonym");
  assert.equal(holder?.first_name, "Jonathan");
  assert.equal(holder?.last_name, "Amar");
  assert.equal(holder?.is_account_holder, true);
  assert.equal(homonym?.companion_id, COMPANION);
  assert.equal(db.tables.crm_transactions.find((row) => row.id === "tx1")?.customer_id, OTHER);
  assert.equal(db.tables.crm_transactions.find((row) => row.id === "tx1")?.billing_company_id, "co-new");
  assert.equal(db.tables.crm_transactions.find((row) => row.id === "tx-other")?.customer_id, OLD);
  assert.equal(db.tables.crm_revolut_transactions[0].matched_customer_id, OTHER);
  assert.equal(db.tables.crm_stripe_transactions[0].matched_customer_id, OTHER);
  assert.equal(db.tables.crm_pliant_transactions[0].customer_id, OTHER);
  assert.equal(db.tables.crm_pliant_cards[0].customer_id, OTHER);
  assert.equal(db.tables.crm_booking_items[0].billing_company_id, "co-new");
  assert.equal(db.tables.crm_whatsapp_messages[0].customer_id, OLD);
  assert.match(done.journal.summary, /Jonathan Amar → Jonathan Amar/);
  assert.equal((done.journal.diff.client as { apres: string }).apres, "Jonathan Amar");
});

test("un payeur choisi à part ne suit pas l’ancien client", async () => {
  const db = base({
    crm_customers: [
      person(OLD, "Jonathan", "Amar", { email: "john@johndalia.com" }),
      person(OTHER, "Jonathan", "Amar", { email: "autre@example.com" }),
      person(PAYER, "Camille", "Martin", { company_name: "MARTIN" }),
    ],
    crm_billing_companies: [{ id: "co-payer", customer_id: PAYER, company_name: "MARTIN", siret: null, sort_order: 0 }],
    crm_bookings: [booking({ billing_customer_id: PAYER, billing_company_id: "co-payer", payer_kind: "company" })],
    crm_transactions: [
      { id: "tx1", customer_id: PAYER, booking_id: BOOK, billing_company_id: "co-payer" },
      { id: "tx-self", customer_id: OLD, booking_id: BOOK, billing_company_id: null },
    ],
    crm_revolut_transactions: [],
    crm_stripe_transactions: [],
    crm_pliant_transactions: [],
    crm_pliant_cards: [],
  });
  const done = await changeBookingClient(db as unknown as SupabaseClient, {
    reference: "TB-2026-0073",
    customerId: OTHER,
    confirmer: true,
  });
  assert.equal(done.payeur.suit, false);
  assert.equal(db.tables.crm_bookings[0].customer_id, OTHER);
  assert.equal(db.tables.crm_bookings[0].billing_customer_id, PAYER);
  assert.equal(db.tables.crm_bookings[0].billing_company_id, "co-payer");
  assert.equal(db.tables.crm_transactions.find((row) => row.id === "tx1")?.customer_id, PAYER);
  assert.equal(db.tables.crm_transactions.find((row) => row.id === "tx-self")?.customer_id, OTHER);
});

test("le collaborateur emmène le débit qui était sur l’admin société", async () => {
  const db = base({
    crm_customers: [
      person(OLD, "Jonathan", "Amar", { company_role: "member", billing_parent_id: PARENT }),
      person(PARENT, "Camille", "Martin"),
      person(OTHER, "Jonathan", "Amar", { email: "autre@example.com" }),
    ],
    crm_billing_companies: [],
    crm_bookings: [booking({ billing_customer_id: PARENT, billing_company_id: null, payer_kind: "personal" })],
    crm_transactions: [{ id: "tx1", customer_id: PARENT, booking_id: BOOK, billing_company_id: null }],
    crm_revolut_transactions: [],
    crm_stripe_transactions: [],
    crm_pliant_transactions: [],
    crm_pliant_cards: [],
  });
  const done = await changeBookingClient(db as unknown as SupabaseClient, {
    bookingId: BOOK,
    customerId: OTHER,
    confirmer: true,
  });
  assert.equal(done.payeur.suit, true);
  assert.equal(db.tables.crm_bookings[0].billing_customer_id, OTHER);
  assert.equal(db.tables.crm_bookings[0].payer_kind, "personal");
  assert.equal(db.tables.crm_transactions[0].customer_id, OTHER);
});

test("sans société correspondante, le séjour redevient particulier", () => {
  const plan: ReassignPlan = planBookingClientChange({
    booking: booking({ billing_company_id: "co-old" }) as never,
    from: person(OLD, "Jonathan", "Amar") as never,
    to: person(OTHER, "Léa", "Martin") as never,
    payerBefore: person(OLD, "Jonathan", "Amar") as never,
    payerAfter: person(OTHER, "Léa", "Martin") as never,
    companies: [
      { id: "co-old", customer_id: OLD, company_name: "JOHN DALIA", siret: "123", sort_order: 0 },
      { id: "co-a", customer_id: OTHER, company_name: "ALPHA", siret: "1", sort_order: 0 },
      { id: "co-b", customer_id: OTHER, company_name: "BETA", siret: "2", sort_order: 1 },
    ],
    travelers: [],
    transactions: [],
    revolut: [],
    stripe: [],
    pliantTx: [],
    pliantCards: [],
    items: [],
    creation: false,
    duplicates: [],
  });
  assert.equal(plan.bookingPatch.payer_kind, "personal");
  assert.equal(plan.bookingPatch.billing_company_id, null);
  assert.match(plan.result.resume.join(" "), /redevient particulier/);
});

test("créer la fiche ne invite pas, avertit d’un homonyme, puis rattache", async () => {
  const db = base();
  const preview = await changeBookingClient(db as unknown as SupabaseClient, {
    bookingId: BOOK,
    create: { firstName: "Jonathan", lastName: "Amar", email: "", phone: "", companyName: "Plage" },
  });
  assert.equal(preview.applique, false);
  assert.equal(preview.creation, true);
  assert.equal(preview.doublons.length, 2);
  assert.equal(db.tables.crm_customers.length, 2);
  const done = await changeBookingClient(db as unknown as SupabaseClient, {
    bookingId: BOOK,
    create: { firstName: "Noa", lastName: "Leblanc", email: "noa@example.com", phone: "06 12 34 56 78", companyName: "Plage" },
    confirmer: true,
  });
  assert.equal(done.applique, true);
  assert.equal(done.nouveau.cree, true);
  assert.equal(done.invite, false);
  assert.equal(db.tables.crm_customers.length, 3);
  const created = db.tables.crm_customers.find((row) => row.email === "noa@example.com");
  assert.equal(created?.phone, "+33612345678");
  assert.equal(db.tables.crm_bookings[0].customer_id, created?.id);
  assert.equal(db.tables.crm_booking_travelers.find((row) => row.id === "t-holder")?.first_name, "Noa");
  assert.equal(db.tables.crm_booking_travelers.find((row) => row.id === "t-holder")?.last_name, "Leblanc");
  assert.equal(db.tables.crm_billing_companies.some((row) => row.customer_id === created?.id && row.company_name === "Plage"), true);
  assert.equal(db.tables.crm_whatsapp_messages[0].customer_id, OLD);
});

test("une adresse déjà prise ne crée pas de fiche", async () => {
  const db = base();
  await assert.rejects(
    () =>
      changeBookingClient(db as unknown as SupabaseClient, {
        bookingId: BOOK,
        create: { firstName: "Jonathan", lastName: "Amar", email: "john@johndalia.com" },
        confirmer: true,
      }),
    /déjà utilisée/
  );
  assert.equal(db.tables.crm_customers.length, 2);
  assert.equal(db.tables.crm_bookings[0].customer_id, OLD);
});

test("le même client est refusé, et rien n’invite", () => {
  const src = readFileSync(join(root, "lib/crm/reassign-booking-client.ts"), "utf8");
  assert.equal(src.includes("inviteCustomer"), false);
  assert.equal(src.includes("whatsapp"), false);
  assert.equal(src.includes("resend"), false);
  const db = base();
  return assert.rejects(
    () => changeBookingClient(db as unknown as SupabaseClient, { bookingId: BOOK, customerId: OLD, confirmer: true }),
    /déjà attribué/
  );
});
