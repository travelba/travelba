import assert from "node:assert/strict";
import test from "node:test";
import {
  NO_PASSWORD_BLOCK,
  STAFF_ACCOUNT_BLOCK,
  clientLinkToken,
  magicLinkAllowed,
  isStaffAccount,
  staffAccountDecision,
  staffEmailBlock,
} from "./client-account";

type FakeUser = { id: string; email: string; app_metadata?: Record<string, unknown> };

/** Service client factice : table crm_staff en mémoire, generateLink qui rend le user de l’e-mail. */
function fakeAdmin(input: {
  staffIds?: string[];
  users?: FakeUser[];
  staffReadError?: boolean;
  rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message?: string } | null };
}) {
  const calls: string[] = [];
  const staff = new Set(input.staffIds || []);
  const users = input.users || [];
  const admin = {
    calls,
    from(table: string) {
      calls.push(`from:${table}`);
      assert.equal(table, "crm_staff");
      let id = "";
      const query = {
        select() {
          return query;
        },
        eq(_column: string, value: string) {
          id = value;
          return query;
        },
        async maybeSingle() {
          if (input.staffReadError) return { data: null, error: { message: "lecture" } };
          return { data: staff.has(id) ? { id: `staff-${id}` } : null, error: null };
        },
      };
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push(`rpc:${name}`);
      return input.rpc ? input.rpc(name, args) : { data: null, error: { code: "PGRST202", message: "not found" } };
    },
    auth: {
      admin: {
        async generateLink(args: { type: string; email: string }) {
          calls.push(`generateLink:${args.type}:${args.email}`);
          const user = users.find((row) => row.email === args.email);
          if (!user) return { data: { user: null, properties: null }, error: { message: "User not found" } };
          return { data: { user, properties: { hashed_token: `hash-${user.id}` } }, error: null };
        },
        async getUserById(id: string) {
          calls.push(`getUserById:${id}`);
          const user = users.find((row) => row.id === id);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "absent" } };
        },
      },
    },
  };
  return admin;
}

test("la décision pure : ligne crm_staff, rôle Auth, ou lecture en échec = compte de l’agence", () => {
  assert.equal(staffAccountDecision({ staffRow: { id: "s" }, readError: null, user: null }), true);
  assert.equal(staffAccountDecision({ staffRow: null, readError: { message: "x" }, user: null }), true);
  assert.equal(staffAccountDecision({ staffRow: null, readError: null, user: null }), true);
  assert.equal(
    staffAccountDecision({ staffRow: null, readError: null, user: { app_metadata: { crm_role: "admin" } } }),
    true
  );
  assert.equal(
    staffAccountDecision({ staffRow: null, readError: null, user: { app_metadata: { crm_role: "agent" } } }),
    true
  );
  assert.equal(
    staffAccountDecision({ staffRow: null, readError: null, user: { app_metadata: { crm_role: "client" } } }),
    false
  );
  assert.equal(staffAccountDecision({ staffRow: null, readError: null, user: { app_metadata: {} } }), false);
});

test("isStaffAccount lit crm_staff puis le rôle Auth ; un user connu évite la lecture Auth", async () => {
  const admin = fakeAdmin({
    staffIds: ["admin-1"],
    users: [
      { id: "admin-1", email: "marie@travelba.fr", app_metadata: { crm_role: "admin" } },
      { id: "role-only", email: "agent@travelba.fr", app_metadata: { crm_role: "agent" } },
      { id: "client-1", email: "simon@example.com", app_metadata: { crm_role: "client" } },
    ],
  });
  assert.equal(await isStaffAccount(admin as never, "admin-1"), true);
  assert.equal(await isStaffAccount(admin as never, "role-only"), true);
  assert.equal(await isStaffAccount(admin as never, "client-1"), false);
  assert.equal(await isStaffAccount(admin as never, "client-1", { app_metadata: { crm_role: "client" } }), false);
  assert.equal(admin.calls.filter((call) => call === "getUserById:client-1").length, 1);
  assert.equal(await isStaffAccount(admin as never, "inconnu"), true);
});

test("un lien client n’est jamais généré pour un compte de l’agence", async () => {
  // Le cas Samak : la fiche client porte l’e-mail d’un admin de crm_staff.
  const admin = fakeAdmin({
    staffIds: ["admin-1"],
    users: [{ id: "admin-1", email: "jeremysamak@gmail.com", app_metadata: { crm_role: "admin" } }],
  });
  for (const type of ["magiclink", "invite", "recovery"] as const) {
    const result = await clientLinkToken(admin as never, { type, email: "JeremySamak@gmail.com " });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "staff");
      assert.equal(result.message, STAFF_ACCOUNT_BLOCK);
    }
  }
  // Le rôle Auth suffit, même sans ligne crm_staff.
  const byRole = fakeAdmin({
    users: [{ id: "agent-2", email: "agent@travelba.fr", app_metadata: { crm_role: "agent" } }],
  });
  const blocked = await clientLinkToken(byRole as never, { type: "magiclink", email: "agent@travelba.fr" });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, "staff");
});

test("un client reçoit son jeton ; l’invitation transmet les métadonnées", async () => {
  const admin = fakeAdmin({
    staffIds: ["admin-1"],
    users: [{ id: "client-1", email: "simon@example.com", app_metadata: { crm_role: "client" } }],
  });
  const result = await clientLinkToken(admin as never, {
    type: "invite",
    email: "simon@example.com",
    data: { first_name: "Simon" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.hashedToken, "hash-client-1");
    assert.equal(result.user.id, "client-1");
  }
  assert.ok(admin.calls.includes("generateLink:invite:simon@example.com"));
  assert.ok(admin.calls.includes("from:crm_staff"));
});

test("une erreur Supabase remonte telle quelle (déjà inscrit → recovery côté invitation)", async () => {
  const admin = fakeAdmin({ users: [] });
  const result = await clientLinkToken(admin as never, { type: "invite", email: "nobody@example.com" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "error");
    assert.equal(result.message, "User not found");
  }
  const empty = await clientLinkToken(admin as never, { type: "magiclink", email: "  " });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.reason, "error");
});

test("une lecture crm_staff en échec refuse le lien plutôt que d’ouvrir", async () => {
  const admin = fakeAdmin({
    staffReadError: true,
    users: [{ id: "client-1", email: "simon@example.com", app_metadata: { crm_role: "client", password_set_at: "2026-09-22T08:00:00.000Z" } }],
  });
  const result = await clientLinkToken(admin as never, { type: "magiclink", email: "simon@example.com" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "staff");
});

test("staffEmailBlock : RPC vraie → refus, fausse → rien, fonction absente → rien, autre erreur → refus", async () => {
  const yes = fakeAdmin({ rpc: () => ({ data: true, error: null }) });
  assert.equal(await staffEmailBlock(yes as never, "Marie@travelba.fr"), STAFF_ACCOUNT_BLOCK);
  assert.ok(yes.calls.includes("rpc:crm_is_staff_email"));

  const no = fakeAdmin({ rpc: () => ({ data: false, error: null }) });
  assert.equal(await staffEmailBlock(no as never, "simon@example.com"), null);

  const missing = fakeAdmin({ rpc: () => ({ data: null, error: { code: "PGRST202", message: "not found" } }) });
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await staffEmailBlock(missing as never, "simon@example.com"), null);
  } finally {
    console.warn = warn;
  }

  const broken = fakeAdmin({ rpc: () => ({ data: null, error: { code: "42501", message: "permission denied" } }) });
  assert.equal(await staffEmailBlock(broken as never, "simon@example.com"), STAFF_ACCOUNT_BLOCK);

  assert.equal(await staffEmailBlock(yes as never, ""), null);
});

test("un lien magique exige un mot de passe déjà choisi ; l’invitation et la réinitialisation non", async () => {
  // Invité, jamais connecté : must_set_password posé, pas de password_set_at.
  const invited = { id: "inv-1", email: "nina@example.com", app_metadata: { crm_role: "client", must_set_password: true } };
  // Compte ouvert par l’agence (desk) : confirmé, sans mot de passe, sans drapeau.
  const desk = { id: "desk-1", email: "olga@example.com", app_metadata: { crm_role: "client" } };
  // Mot de passe enregistré dans l’espace.
  const ready = {
    id: "ok-1",
    email: "simon@example.com",
    app_metadata: { crm_role: "client", must_set_password: false, password_set_at: "2026-09-22T08:01:35.674Z" },
  };
  const admin = fakeAdmin({ users: [invited, desk, ready] });

  for (const user of [invited, desk]) {
    const magic = await clientLinkToken(admin as never, { type: "magiclink", email: user.email });
    assert.equal(magic.ok, false);
    if (!magic.ok) {
      assert.equal(magic.reason, "no_password");
      assert.equal(magic.message, NO_PASSWORD_BLOCK);
    }
    const recovery = await clientLinkToken(admin as never, { type: "recovery", email: user.email });
    assert.equal(recovery.ok, true);
  }
  const magic = await clientLinkToken(admin as never, { type: "magiclink", email: ready.email });
  assert.equal(magic.ok, true);

  assert.equal(magicLinkAllowed(invited), false);
  assert.equal(magicLinkAllowed(desk), false);
  assert.equal(magicLinkAllowed(ready), true);
  // Le drapeau resté à tort ne compte pas : le mot de passe a bien été choisi.
  assert.equal(
    magicLinkAllowed({ app_metadata: { must_set_password: true, password_set_at: "2026-09-22T08:01:35.674Z" } }),
    true
  );
  assert.equal(magicLinkAllowed(null), false);
});
