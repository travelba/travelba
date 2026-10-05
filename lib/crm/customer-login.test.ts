import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCustomerLoginAt,
  loginMethodFromCallback,
  loginMethodLabel,
  shouldRecordLogin,
  writeCustomerLogin,
  type CustomerLoginStore,
} from "./customer-login";

function memoryStore(customerId: string | null, previousAt: string | null = null): CustomerLoginStore & {
  rows: { customer_id: string; auth_user_id: string; method: string }[];
} {
  const rows: { customer_id: string; auth_user_id: string; method: string }[] = [];
  return {
    rows,
    async findCustomerId() {
      return customerId;
    },
    async latestCreatedAt() {
      return previousAt;
    },
    async insert(row) {
      rows.push(row);
    },
  };
}

test("le libellé dit comment le titulaire est entré", () => {
  assert.equal(loginMethodLabel("password"), "Mot de passe");
  assert.equal(loginMethodLabel("magiclink"), "Lien magique");
  assert.equal(loginMethodLabel("invite"), "Invitation");
  assert.equal(loginMethodLabel("entry"), "Lien d’accès");
  assert.equal(loginMethodLabel("inconnu"), "Connexion");
});

test("le callback mappe le type OTP, sinon lien magique", () => {
  assert.equal(loginMethodFromCallback("invite"), "invite");
  assert.equal(loginMethodFromCallback("recovery"), "recovery");
  assert.equal(loginMethodFromCallback("magiclink"), "magiclink");
  assert.equal(loginMethodFromCallback("email"), "magiclink");
  assert.equal(loginMethodFromCallback(null), "magiclink");
});

test("l’heure s’affiche à Paris, jour puis heure", () => {
  const text = formatCustomerLoginAt("2026-09-28T18:32:00.000Z");
  assert.match(text, /28 septembre 2026/);
  assert.match(text, /20/);
  assert.match(text, /32/);
  assert.match(text, /à/);
  assert.equal(formatCustomerLoginAt(""), "");
  assert.equal(formatCustomerLoginAt("pas-une-date"), "pas-une-date");
});

test("on n’enregistre pas deux fois dans la minute", () => {
  const now = new Date("2026-09-28T18:32:00.000Z");
  assert.equal(shouldRecordLogin({ previousAt: null, now }), true);
  assert.equal(
    shouldRecordLogin({ previousAt: "2026-09-28T18:31:00.000Z", now }),
    false
  );
  assert.equal(
    shouldRecordLogin({ previousAt: "2026-09-28T18:30:00.000Z", now }),
    true
  );
});

test("sans fiche titulaire, rien n’est écrit", async () => {
  const store = memoryStore(null);
  const result = await writeCustomerLogin(
    { authUserId: "user-1", method: "password" },
    store
  );
  assert.equal(result.recorded, false);
  assert.equal(store.rows.length, 0);
});

test("une connexion titulaire est enregistrée", async () => {
  const store = memoryStore("cust-1");
  const result = await writeCustomerLogin(
    { authUserId: "user-1", method: "password", now: new Date("2026-09-28T18:32:00.000Z") },
    store
  );
  assert.deepEqual(result, { recorded: true, customerId: "cust-1" });
  assert.deepEqual(store.rows, [
    { customer_id: "cust-1", auth_user_id: "user-1", method: "password" },
  ]);
});

test("un second clic immédiat n’ajoute pas de ligne", async () => {
  const store = memoryStore("cust-1", "2026-09-28T18:31:30.000Z");
  const result = await writeCustomerLogin(
    { authUserId: "user-1", method: "magiclink", now: new Date("2026-09-28T18:32:00.000Z") },
    store
  );
  assert.equal(result.recorded, false);
  assert.equal(store.rows.length, 0);
});

test("une ouverture par l’agence est toujours tracée, avec l’agent", async () => {
  const inserted: Array<Record<string, unknown>> = [];
  const result = await writeCustomerLogin(
    {
      authUserId: "11111111-1111-4111-8111-111111111111",
      method: "desk",
      staffId: "44444444-4444-4444-8444-444444444444",
      now: new Date("2026-10-05T10:00:30Z"),
    },
    {
      findCustomerId: async () => "cust-1",
      // Connexion du client 30 secondes plus tôt : un desk ne se fond pas dedans.
      latestCreatedAt: async () => "2026-10-05T10:00:00Z",
      insert: async (row) => {
        inserted.push(row);
      },
    }
  );
  assert.equal(result.recorded, true);
  assert.deepEqual(inserted, [
    {
      customer_id: "cust-1",
      auth_user_id: "11111111-1111-4111-8111-111111111111",
      method: "desk",
      staff_id: "44444444-4444-4444-8444-444444444444",
    },
  ]);
});
