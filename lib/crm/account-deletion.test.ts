import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextResponse } from "next/server";
import { AccountDeletion } from "../../components/account/AccountDeletion";
import { AccountDeletedNotice } from "../../components/account/AccountDeletedNotice";
import { ConfirmDialogCard } from "../../components/crm/ConfirmDialog";
import { jsonError } from "./auth";
import {
  ACCOUNT_DELETED_TITLE,
  ACCOUNT_DELETION_CANCEL,
  ACCOUNT_DELETION_CONFIRM,
  ACCOUNT_DELETION_PARAGRAPHS,
  ACCOUNT_DELETION_TITLE,
  deletedAccountEmail,
  isDeletedAccountEmail,
} from "./account-deletion-copy";
import {
  AccountDeletionError,
  authUserAlreadyGone,
  deleteClientAccount,
  handleClientAccountDeletion,
  missingColumnName,
  sessionMayDeleteCustomer,
  type DeletionDb,
} from "./account-deletion";
import { appreviewAccountDecision, appreviewPasswordAccepted } from "./appreview-account";

type Row = Record<string, unknown>;

function memoryDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  function from(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    let single = false;
    let returning = false;
    const builder: Record<string, unknown> = {
      select() {
        if (op !== "select") returning = true;
        return builder;
      },
      insert(row: Row) {
        op = "insert";
        payload = row;
        return builder;
      },
      update(row: Row) {
        op = "update";
        payload = row;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      is(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      ilike(column: string, value: unknown) {
        filters.push((row) => String(row[column] ?? "").toLowerCase() === String(value).toLowerCase());
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        single = true;
        return builder;
      },
      then(onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) {
        const rows = (tables[table] ||= []);
        const matched = rows.filter((row) => filters.every((filter) => filter(row)));
        let result: { data: unknown; error: null };
        if (op === "insert" && payload) {
          rows.push(payload);
          result = { data: payload, error: null };
        } else if (op === "update" && payload) {
          for (const row of matched) Object.assign(row, payload);
          result = { data: returning ? matched : null, error: null };
        } else if (op === "delete") {
          tables[table] = rows.filter((row) => !matched.includes(row));
          result = { data: matched, error: null };
        } else {
          result = { data: single ? (matched[0] ?? null) : matched, error: null };
        }
        return Promise.resolve(result).then(onOk, onErr);
      },
    };
    return builder;
  }
  return { admin: { from } as unknown as DeletionDb, tables };
}

const CUSTOMER = "d39602e0-0af3-455e-969d-802bc6eb8996";
const OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOKING = "e29a2074-5f2c-4719-8507-6947366e37ba";
const AUTH = "11111111-1111-4111-8111-111111111111";

function seed() {
  return {
    crm_customers: [
      {
        id: CUSTOMER,
        auth_user_id: AUTH,
        first_name: "Alice",
        last_name: "Martin",
        email: "alice@example.com",
        phone: "+33601020304",
        birth_date: "1990-01-02",
        address_line: "1 rue des Lilas",
        stripe_customer_id: "cus_test",
        account_deleted_at: null,
        company_name: "Martin SAS",
      },
    ],
    crm_staff: [] as Row[],
    crm_bookings: [{ id: BOOKING, customer_id: CUSTOMER, reference: "TB-2026-0001", notes_client: "Arrivée tardive" }],
    crm_transactions: [{ id: "tx-1", customer_id: CUSTOMER, amount: 120 }],
    crm_billing_companies: [{ id: "co-1", customer_id: CUSTOMER, company_name: "Martin SAS" }],
    crm_booking_documents: [{ storage_path: `bookings/${BOOKING}/billet.pdf` }],
    crm_travel_documents: [{ id: "doc-1", customer_id: CUSTOMER, number: "12AB34567", storage_path: `customers/${CUSTOMER}/documents/passeport.pdf` }],
    crm_travel_companions: [{ id: "comp-1", customer_id: CUSTOMER, first_name: "Bob", last_name: "Martin", birth_date: "2015-05-05" }],
    crm_espace_devices: [{ id: "dev-1", customer_id: CUSTOMER, token: "apns-token" }],
    crm_device_unlocks: [{ id: "face-1", customer_id: CUSTOMER, token_hash: "hash" }],
    crm_payment_methods: [{ id: "pm-1", customer_id: CUSTOMER, stripe_payment_method_id: "pm_123" }],
    crm_entry_links: [{ code: "abc", email: "alice@example.com" }],
    crm_visa_requests: [{ id: "visa-1", booking_id: BOOKING, answers: { passport: "12AB34567" } }],
    crm_esta_checks: [{ id: "esta-1", booking_id: BOOKING, esta_passport_last3: "567" }],
    crm_customer_activity: [{ id: "act-1", customer_id: CUSTOMER, action: "download", summary: "Passeport de Alice" }],
    crm_customer_twins: [{ customer_a: CUSTOMER, customer_b: OTHER }],
  };
}

function deps(
  admin: DeletionDb,
  overrides: Partial<{
    deleteAuthUser: (userId: string) => Promise<{ error: { message: string; status?: number } | null }>;
    removed: string[][];
    mails: { email: string; name: string }[];
    stripe: string[];
  }> = {}
) {
  const removed = overrides.removed ?? [];
  const mails = overrides.mails ?? [];
  const stripe = overrides.stripe ?? [];
  return {
    admin,
    customerId: CUSTOMER,
    authUserId: AUTH,
    sessionEmail: "alice@example.com",
    crmRole: "client",
    deleteAuthUser:
      overrides.deleteAuthUser ??
      (async () => {
        return { error: null };
      }),
    listFiles: async (prefix: string) => [`${prefix}/messages/photo.jpg`, `bookings/${BOOKING}/billet.pdf`],
    removeFiles: async (paths: string[]) => {
      removed.push(paths);
    },
    notifyAgency: async (notice: { name: string; email: string; customerId: string }) => {
      mails.push({ email: notice.email, name: notice.name });
    },
    forgetStripeCustomer: async (id: string) => {
      stripe.push(id);
    },
    removed,
    mails,
    stripe,
  };
}

test("la colonne manquante se lit sur le message Postgres", () => {
  assert.equal(missingColumnName({ code: "42703", message: "column crm_customers.account_deleted_at does not exist" }), "account_deleted_at");
  assert.equal(missingColumnName({ code: "PGRST204", message: "Could not find the 'usage_name' column" }), "usage_name");
  assert.equal(missingColumnName({ code: "23505", message: "duplicate" }), null);
  assert.equal(authUserAlreadyGone({ message: "User not found", status: 404 }), true);
  assert.equal(authUserAlreadyGone({ message: "Auth down", status: 500 }), false);
  assert.equal(isDeletedAccountEmail(deletedAccountEmail(CUSTOMER)), true);
  assert.equal(isDeletedAccountEmail("alice@example.com"), false);
});

test("seul le titulaire de la fiche peut la supprimer", () => {
  assert.equal(
    sessionMayDeleteCustomer({
      sessionUserId: AUTH,
      sessionEmail: "alice@example.com",
      customerAuthUserId: AUTH,
      customerEmail: "alice@example.com",
    }),
    true
  );
  assert.equal(
    sessionMayDeleteCustomer({
      sessionUserId: AUTH,
      sessionEmail: "alice@example.com",
      customerAuthUserId: OTHER,
      customerEmail: "alice@example.com",
    }),
    false
  );
});

test("la route exige une session", async () => {
  let desk = false;
  const response = await handleClientAccountDeletion({
    requireCustomer: async () => jsonError("Non authentifié", 401),
    isDesk: () => {
      desk = true;
      return false;
    },
    admin: { from() { throw new Error("pas d’accès base"); } },
    deleteAuthUser: async () => ({ error: null }),
    listFiles: async () => [],
    removeFiles: async () => {},
  });
  assert.equal(response.status, 401);
  assert.equal(desk, false);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "Non authentifié");
});

test("l’ouverture par l’agence ne supprime pas le compte", async () => {
  let deleted = false;
  const response = await handleClientAccountDeletion({
    requireCustomer: async () => ({
      user: { id: AUTH, email: "alice@example.com", app_metadata: { crm_role: "client" } },
      customer: { id: CUSTOMER },
    }),
    isDesk: () => true,
    admin: { from() { throw new Error("pas d’accès base"); } },
    deleteAuthUser: async () => {
      deleted = true;
      return { error: null };
    },
    listFiles: async () => [],
    removeFiles: async () => {},
  });
  assert.equal(response.status, 403);
  assert.equal(deleted, false);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /compte du client/);
});

test("un compte d’agence est refusé, et rien n’est anonymisé", async () => {
  const { admin, tables } = memoryDb(seed());
  tables.crm_staff.push({ id: "staff-1", auth_user_id: AUTH, email: "alice@example.com" });
  let deleted = false;
  await assert.rejects(
    () =>
      deleteClientAccount({
        ...deps(admin),
        deleteAuthUser: async () => {
          deleted = true;
          return { error: null };
        },
      }),
    (error: unknown) => error instanceof AccountDeletionError && error.status === 403
  );
  assert.equal(deleted, false);
  assert.equal(tables.crm_customers[0].email, "alice@example.com");
  assert.equal(tables.crm_customers[0].first_name, "Alice");
  assert.equal(tables.crm_travel_documents.length, 1);
});

test("le rôle agence du jeton est refusé même sans ligne staff", async () => {
  const { admin, tables } = memoryDb(seed());
  const response = await handleClientAccountDeletion({
    requireCustomer: async () => ({
      user: { id: AUTH, email: "alice@example.com", app_metadata: { crm_role: "admin" } },
      customer: { id: CUSTOMER },
    }),
    isDesk: () => false,
    ...deps(admin),
  });
  assert.equal(response.status, 403);
  assert.equal(tables.crm_customers[0].email, "alice@example.com");
  assert.equal(tables.crm_bookings.length, 1);
});

test("la suppression retire le compte et anonymise la fiche, les dossiers restent", async () => {
  const { admin, tables } = memoryDb(seed());
  const bag = deps(admin);
  let authDeletes = 0;
  bag.deleteAuthUser = async (userId) => {
    authDeletes += 1;
    assert.equal(userId, AUTH);
    if (authDeletes === 1) return { error: { message: "Auth down", status: 500 } };
    return { error: null };
  };
  const failed = await handleClientAccountDeletion({
    requireCustomer: async () => ({
      user: { id: AUTH, email: "alice@example.com", app_metadata: { crm_role: "client" } },
      customer: { id: CUSTOMER },
    }),
    isDesk: () => false,
    ...bag,
  });
  assert.equal(failed.status, 500);

  const customer = tables.crm_customers[0];
  assert.equal(customer.first_name, "Compte");
  assert.equal(customer.last_name, "supprimé");
  assert.equal(customer.email, deletedAccountEmail(CUSTOMER));
  assert.equal(customer.phone, null);
  assert.equal(customer.birth_date, null);
  assert.equal(customer.address_line, null);
  assert.equal(customer.stripe_customer_id, null);
  assert.equal(customer.company_name, "Martin SAS");
  assert.equal(typeof customer.account_deleted_at, "string");
  assert.equal(customer.auth_user_id, AUTH);
  assert.equal(tables.crm_bookings[0].reference, "TB-2026-0001");
  assert.equal(tables.crm_bookings[0].notes_client, null);
  assert.equal(tables.crm_transactions[0].amount, 120);
  assert.equal(tables.crm_billing_companies[0].company_name, "Martin SAS");
  assert.equal(tables.crm_booking_documents.length, 1);
  assert.equal(tables.crm_travel_documents.length, 0);
  assert.equal(tables.crm_espace_devices.length, 0);
  assert.equal(tables.crm_device_unlocks.length, 0);
  assert.equal(tables.crm_payment_methods.length, 0);
  assert.equal(tables.crm_entry_links.length, 0);
  assert.equal(tables.crm_customer_twins.length, 0);
  assert.equal(tables.crm_travel_companions[0].first_name, "Voyageur");
  assert.equal(tables.crm_travel_companions[0].birth_date, null);
  assert.deepEqual(tables.crm_visa_requests[0].answers, {});
  assert.equal(tables.crm_esta_checks[0].esta_passport_last3, null);
  assert.equal(bag.mails.length, 1);
  assert.equal(bag.mails[0].email, "alice@example.com");
  assert.equal(bag.mails[0].name, "Alice Martin");
  assert.deepEqual(bag.stripe, ["cus_test"]);
  const removed = bag.removed.flat();
  assert.ok(removed.includes(`customers/${CUSTOMER}/documents/passeport.pdf`));
  assert.ok(removed.includes(`customers/${CUSTOMER}/messages/photo.jpg`));
  assert.equal(removed.some((path) => path.includes("billet.pdf")), false);
  const audit = tables.crm_customer_activity.find((row) => row.action === "account_deleted");
  assert.ok(audit);
  assert.equal(JSON.stringify(audit).includes("Alice"), false);
  assert.equal(JSON.stringify(audit).includes("alice@example.com"), false);

  const response = await handleClientAccountDeletion({
    requireCustomer: async () => ({
      user: { id: AUTH, email: "alice@example.com", app_metadata: { crm_role: "client" } },
      customer: { id: CUSTOMER },
    }),
    isDesk: () => false,
    ...bag,
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; already: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.already, true);
  assert.equal(bag.mails.length, 1);
  assert.equal(authDeletes, 2);
  assert.equal(tables.crm_customers[0].auth_user_id, null);
  assert.equal(tables.crm_bookings.length, 1);
  assert.equal(tables.crm_transactions.length, 1);
});

test("un autre utilisateur Auth ne supprime pas la fiche", async () => {
  const { admin, tables } = memoryDb(seed());
  await assert.rejects(
    () =>
      deleteClientAccount({
        ...deps(admin),
        authUserId: OTHER,
        sessionEmail: "autre@example.com",
      }),
    (error: unknown) => error instanceof AccountDeletionError && error.status === 403
  );
  assert.equal(tables.crm_customers[0].email, "alice@example.com");
});

test("le dialogue nomme l’effacement et reste au-dessus de la barre", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmDialogCard, {
      title: ACCOUNT_DELETION_TITLE,
      titleId: "titre",
      questionId: "question",
      question: ACCOUNT_DELETION_PARAGRAPHS.map((paragraph) => createElement("p", { key: paragraph }, paragraph)),
      confirmLabel: ACCOUNT_DELETION_CONFIRM,
      cancelLabel: ACCOUNT_DELETION_CANCEL,
      tone: "danger",
      busy: false,
      onConfirm: () => {},
      onClose: () => {},
    })
  );
  assert.match(html, /z-\[80\]/);
  assert.match(html, /Supprimer définitivement mon compte/);
  assert.match(html, /Annuler/);
  assert.match(html, /effacés tout de suite/);
  assert.match(html, /dix ans/);
  assert.match(html, /code du tourisme/);
  assert.doesNotMatch(html, /30 jours/);
  assert.match(html, /role="dialog"/);
  const page = renderToStaticMarkup(createElement(AccountDeletion));
  assert.match(page, /Supprimer mon compte/);
  assert.match(page, /effacé tout de suite/);
  assert.doesNotMatch(page, /30 jours/);
  const done = renderToStaticMarkup(createElement(AccountDeletedNotice));
  assert.match(done, new RegExp(ACCOUNT_DELETED_TITLE));
});

test("la route branche l’auth, le desk et la suppression Auth", () => {
  const route = readFileSync(new URL("../../app/api/client/account/deletion/route.ts", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(route, /requireCustomer/);
  assert.match(route, /deskBypass/);
  assert.match(route, /deleteUser/);
  assert.match(route, /handleClientAccountDeletion/);
  assert.doesNotMatch(route, /30 jours/);
  assert.match(proxy, /path === "\/compte-supprime"/);
});

test("le compte de revue se recrée sans toucher une fiche supprimée ni un collègue", () => {
  assert.equal(appreviewPasswordAccepted("court"), false);
  assert.equal(appreviewPasswordAccepted("mot de passe long"), false);
  assert.equal(appreviewPasswordAccepted("RevueApple2026"), true);
  assert.deepEqual(appreviewAccountDecision({ staff: true, customer: null, authUserId: null }), { action: "refuse" });
  assert.deepEqual(
    appreviewAccountDecision({
      staff: false,
      customer: { id: CUSTOMER, authUserId: AUTH, deleted: false },
      authUserId: AUTH,
    }),
    { action: "refresh", customerId: CUSTOMER, authUserId: AUTH }
  );
  assert.deepEqual(
    appreviewAccountDecision({
      staff: false,
      customer: { id: CUSTOMER, authUserId: null, deleted: true },
      authUserId: null,
    }),
    { action: "create", authUserId: null }
  );
});

test("une erreur inattendue reste une erreur serveur", async () => {
  const { admin } = memoryDb(seed());
  const response = await handleClientAccountDeletion({
    requireCustomer: async () => ({
      user: { id: AUTH, email: "alice@example.com", app_metadata: { crm_role: "client" } },
      customer: { id: CUSTOMER },
    }),
    isDesk: () => false,
    admin,
    deleteAuthUser: async () => ({ error: null }),
    listFiles: async () => {
      throw new Error("coupure");
    },
    removeFiles: async () => {},
  });
  assert.ok(response instanceof NextResponse);
  assert.equal(response.status, 500);
});
