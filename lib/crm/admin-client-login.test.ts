import assert from "node:assert/strict";
import test from "node:test";
import { LOGIN_FAILURE_MESSAGE } from "./login-message";
import {
  accessWhileDesk,
  attemptClientLogin,
  deskBypass,
  loginRoutePlan,
  openServiceSession,
  secretEquals,
  signDesk,
  type ClientLoginDeps,
} from "./admin-client-login";

const FAKE_CODE = "tb-test-code";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "client@example.com";

async function withCode(value: string | undefined, run: () => Promise<void>) {
  const previous = process.env.ADMIN_CLIENT_CODE;
  if (value === undefined) delete process.env.ADMIN_CLIENT_CODE;
  else process.env.ADMIN_CLIENT_CODE = value;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_CLIENT_CODE;
    else process.env.ADMIN_CLIENT_CODE = previous;
  }
}

function deps(overrides: Partial<ClientLoginDeps> = {}): ClientLoginDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    findCustomer: overrides.findCustomer
      ? overrides.findCustomer
      : async () => {
          calls.push("find");
          return { authUserId: USER_ID };
        },
    openSession: overrides.openSession
      ? overrides.openSession
      : async () => {
          calls.push("open");
          return true;
        },
  };
}

test("feature off when ADMIN_CLIENT_CODE is missing", async () => {
  await withCode(undefined, async () => {
    const client = deps();
    const result = await attemptClientLogin(
      { email: EMAIL, password: FAKE_CODE, store: new Map() },
      client
    );
    assert.equal(result.action, "fallback");
    assert.deepEqual(client.calls, []);
    assert.equal(loginRoutePlan(false, result), "client-fallback");
  });
});

test("blank ADMIN_CLIENT_CODE keeps the normal login", async () => {
  await withCode("   ", async () => {
    const client = deps();
    const result = await attemptClientLogin(
      { email: EMAIL, password: "quelque-chose", store: new Map() },
      client
    );
    assert.equal(result.action, "fallback");
    assert.equal(loginRoutePlan(false, result), "client-fallback");
    assert.deepEqual(client.calls, []);
  });
});

test("success opens a session and does not update the password", async () => {
  await withCode(FAKE_CODE, async () => {
    const calls: string[] = [];
    const result = await attemptClientLogin(
      { email: `  ${EMAIL}  `, password: FAKE_CODE, ip: "203.0.113.5", store: new Map() },
      {
        findCustomer: async () => {
          calls.push("find");
          return { authUserId: USER_ID };
        },
        openSession: async (authUserId) => {
          calls.push(`open:${authUserId}`);
          return true;
        },
      }
    );
    assert.deepEqual(result, { action: "open", authUserId: USER_ID });
    assert.deepEqual(calls, [`find`, `open:${USER_ID}`]);
    assert.equal(loginRoutePlan(true, result), "open");

    let passwordUpdates = 0;
    const opened = await openServiceSession(
      {
        getUserById: async () => {
          calls.push("get");
          return { user: { id: USER_ID, email: EMAIL }, error: false };
        },
        generateLink: async () => {
          calls.push("link");
          return { tokenHash: "hashed-token", error: false };
        },
        updateUserById: async () => {
          passwordUpdates += 1;
          calls.push("update");
        },
      } as Parameters<typeof openServiceSession>[0] & {
        updateUserById: () => Promise<void>;
      },
      USER_ID,
      async () => {
        calls.push("verify");
        return true;
      }
    );
    assert.equal(opened, true);
    assert.equal(passwordUpdates, 0);
    assert.equal(calls.includes("update"), false);
    assert.deepEqual(calls.slice(-3), ["get", "link", "verify"]);
  });
});

test("wrong code falls through to the password check", async () => {
  await withCode(FAKE_CODE, async () => {
    const client = deps();
    const result = await attemptClientLogin(
      { email: EMAIL, password: "mot-de-passe-client", store: new Map() },
      client
    );
    assert.equal(result.action, "fallback");
    assert.deepEqual(client.calls, []);
    assert.equal(loginRoutePlan(true, result), "password");
  });
});

test("unknown email is a normal failure", async () => {
  await withCode(FAKE_CODE, async () => {
    const client = deps({
      findCustomer: async () => null,
    });
    const missing = await attemptClientLogin(
      { email: "inconnu@example.com", password: FAKE_CODE, store: new Map() },
      client
    );
    assert.equal(missing.action, "reject");
    assert.equal(loginRoutePlan(true, missing), "reject");

    const unlinked = await attemptClientLogin(
      { email: EMAIL, password: FAKE_CODE, store: new Map() },
      deps({
        findCustomer: async () => ({ authUserId: null }),
      })
    );
    assert.equal(unlinked.action, "reject");
    assert.equal(LOGIN_FAILURE_MESSAGE, "E-mail ou mot de passe incorrect.");
    assert.equal(client.calls.includes("open"), false);
  });
});

test("too many code attempts stop opening a session", async () => {
  await withCode(FAKE_CODE, async () => {
    const store = new Map();
    const limits = { ip: 2, email: 2, windowMs: 60_000 };
    const client = deps();
    const first = await attemptClientLogin(
      { email: EMAIL, password: "un", store, limits, now: 1_000 },
      client
    );
    const second = await attemptClientLogin(
      { email: EMAIL, password: "deux", store, limits, now: 1_100 },
      client
    );
    const blocked = await attemptClientLogin(
      { email: EMAIL, password: FAKE_CODE, store, limits, now: 1_200 },
      client
    );
    assert.equal(first.action, "fallback");
    assert.equal(second.action, "fallback");
    assert.equal(blocked.action, "reject");
    assert.deepEqual(client.calls, []);
  });
});

test("secret compare matches only the configured code", async () => {
  assert.equal(secretEquals(FAKE_CODE, FAKE_CODE), true);
  assert.equal(secretEquals("autre", FAKE_CODE), false);
  assert.equal(secretEquals("", FAKE_CODE), false);
  assert.equal(secretEquals(FAKE_CODE.slice(0, -1), FAKE_CODE), false);
});

test("desk cookie skips password setup and onboarding only when it is valid", async () => {
  await withCode(FAKE_CODE, async () => {
    const token = signDesk(USER_ID, 2_000_000_000);
    assert.ok(token);
    assert.equal(deskBypass(token, USER_ID, 1_900_000_000), true);
    assert.equal(deskBypass(token, "22222222-2222-4222-8222-222222222222", 1_900_000_000), false);
    assert.equal(deskBypass(token, USER_ID, 2_000_000_000), false);
    assert.equal(deskBypass(`${token}x`, USER_ID, 1_900_000_000), false);
    assert.deepEqual(
      accessWhileDesk({
        desk: true,
        mustSetPassword: true,
        needsOnboarding: true,
        staff: true,
      }),
      { desk: true, mustSetPassword: false, needsOnboarding: false, staff: false }
    );
    assert.equal(
      accessWhileDesk({
        desk: false,
        mustSetPassword: true,
        needsOnboarding: true,
        staff: false,
      }).mustSetPassword,
      true
    );
  });
});
