import assert from "node:assert/strict";
import test from "node:test";
import {
  DESK_LINK_MAX_OPENS,
  DESK_LINK_TTL_MS,
  accessWhileDesk,
  confirmedClientUser,
  deskBypass,
  deskOpenDecision,
  deskSetCookie,
  linkCustomerAuth,
  signDesk,
  type AuthLinkAdmin,
} from "./desk-mode";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const NEW_USER_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "client@example.com";

async function withServiceKey(value: string | undefined, run: () => Promise<void> | void) {
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousEnv = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  if (value === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = value;
  try {
    await run();
  } finally {
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  }
}

function linkAdmin(overrides: Partial<AuthLinkAdmin> = {}): AuthLinkAdmin {
  return {
    listByEmail: overrides.listByEmail ?? (async () => null),
    createConfirmedUser:
      overrides.createConfirmedUser ?? (async () => ({ id: null, alreadyExists: false })),
    findExistingUserId: overrides.findExistingUserId ?? (async () => null),
    attach: overrides.attach ?? (async (_customerId, authUserId) => authUserId),
  };
}

test("desk links live 10 minutes and open once", () => {
  assert.equal(DESK_LINK_TTL_MS, 10 * 60 * 1000);
  assert.equal(DESK_LINK_MAX_OPENS, 1);
});

test("a desk link opens only when alive, unused and no other session is here", () => {
  const now = new Date("2026-10-05T10:00:00Z");
  const alive = { now, expiresAt: new Date("2026-10-05T10:05:00Z"), revokedAt: null, openCount: 0 };
  assert.equal(deskOpenDecision({ ...alive, sessionEmail: null, linkEmail: EMAIL }), "open");
  assert.equal(
    deskOpenDecision({ ...alive, expiresAt: new Date("2026-10-05T09:59:59Z"), sessionEmail: null, linkEmail: EMAIL }),
    "refuse"
  );
  assert.equal(deskOpenDecision({ ...alive, openCount: 1, sessionEmail: null, linkEmail: EMAIL }), "refuse");
  assert.equal(
    deskOpenDecision({ ...alive, revokedAt: "2026-10-05T09:58:00Z", sessionEmail: null, linkEmail: EMAIL }),
    "refuse"
  );
  // L’agent connecté dans ce navigateur : sa session n’est pas écrasée, le lien reste intact.
  assert.equal(deskOpenDecision({ ...alive, sessionEmail: "agent@travelba.fr", linkEmail: EMAIL }), "other-session");
  assert.equal(deskOpenDecision({ ...alive, sessionEmail: " Client@Example.com ", linkEmail: EMAIL }), "same-session");
  // Un lien mort est refusé avant toute autre considération.
  assert.equal(deskOpenDecision({ ...alive, openCount: 1, sessionEmail: EMAIL, linkEmail: EMAIL }), "refuse");
});

test("customer without an auth user gets a confirmed account and no password", async () => {
  assert.equal("password" in confirmedClientUser(EMAIL), false);
  assert.equal(confirmedClientUser(EMAIL).email_confirm, true);
  assert.equal(confirmedClientUser(EMAIL).app_metadata.crm_role, "client");

  const calls: string[] = [];
  let creates = 0;
  const linked = await linkCustomerAuth(EMAIL, {
    listByEmail: async () => [{ id: "cust-1", authUserId: null }],
    createConfirmedUser: async () => {
      creates += 1;
      return { id: NEW_USER_ID, alreadyExists: false };
    },
    findExistingUserId: async () => {
      throw new Error("pas de second compte");
    },
    attach: async (customerId, authUserId) => {
      calls.push(`attach:${customerId}:${authUserId}`);
      return authUserId;
    },
  });
  assert.equal(linked, NEW_USER_ID);
  assert.equal(creates, 1);
  assert.deepEqual(calls, [`attach:cust-1:${NEW_USER_ID}`]);
});

test("an existing auth user is reused, never duplicated", async () => {
  let created = 0;
  const reused = await linkCustomerAuth(
    EMAIL,
    linkAdmin({
      listByEmail: async () => [{ id: "cust-1", authUserId: USER_ID }],
      createConfirmedUser: async () => {
        created += 1;
        return { id: NEW_USER_ID, alreadyExists: false };
      },
    })
  );
  assert.equal(reused, USER_ID);
  assert.equal(created, 0);
});

test("an e-mail already taken by an account the adapter refuses (agency) is not attached", async () => {
  let attached = 0;
  const linked = await linkCustomerAuth(
    EMAIL,
    linkAdmin({
      listByEmail: async () => [{ id: "cust-1", authUserId: null }],
      createConfirmedUser: async () => ({ id: null, alreadyExists: true }),
      findExistingUserId: async () => null,
      attach: async (_customerId, authUserId) => {
        attached += 1;
        return authUserId;
      },
    })
  );
  assert.equal(linked, null);
  assert.equal(attached, 0);
});

test("two customers with the same email are not given an auth user", async () => {
  let created = 0;
  const linked = await linkCustomerAuth(
    EMAIL,
    linkAdmin({
      listByEmail: async () => [
        { id: "cust-1", authUserId: null },
        { id: "cust-2", authUserId: null },
      ],
      createConfirmedUser: async () => {
        created += 1;
        return { id: NEW_USER_ID, alreadyExists: false };
      },
    })
  );
  assert.equal(linked, null);
  assert.equal(created, 0);
});

test("desk cookie is signed with a key derived from the service key, never a typed code", async () => {
  await withServiceKey("service-key-a", () => {
    const now = 1_800_000_000;
    const token = signDesk(USER_ID, now + 60);
    assert.ok(token);
    assert.equal(deskBypass(token, USER_ID, now), true);
    assert.equal(deskBypass(token, OTHER_USER_ID, now), false);
    assert.equal(deskBypass(token, USER_ID, now + 61), false);
    assert.equal(deskBypass(`${token}x`, USER_ID, now), false);
    const cookie = deskSetCookie(USER_ID, now);
    assert.equal(cookie?.options.httpOnly, true);
    assert.equal(cookie?.options.maxAge, 4 * 60 * 60);
  });
  // Autre clé de service : l’ancien cookie ne vaut plus rien.
  let token: string | null = null;
  await withServiceKey("service-key-a", () => {
    token = signDesk(USER_ID, 1_800_000_060);
  });
  await withServiceKey("service-key-b", () => {
    assert.equal(deskBypass(token, USER_ID, 1_800_000_000), false);
  });
  // Pas de clé (preview, local sans service) : mode desk coupé.
  await withServiceKey(undefined, () => {
    assert.equal(signDesk(USER_ID, 1_800_000_060), null);
    assert.equal(deskBypass(token, USER_ID, 1_800_000_000), false);
  });
});

test("desk cookie skips password setup and onboarding only when it is valid", () => {
  assert.deepEqual(
    accessWhileDesk({ desk: false, mustSetPassword: true, needsOnboarding: true, staff: false }),
    { desk: false, mustSetPassword: true, needsOnboarding: true, staff: false }
  );
  assert.deepEqual(
    accessWhileDesk({ desk: true, mustSetPassword: true, needsOnboarding: true, staff: true }),
    { desk: true, mustSetPassword: false, needsOnboarding: false, staff: false }
  );
});
