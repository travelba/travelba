import assert from "node:assert/strict";
import test from "node:test";
import { cronSecret } from "./cron-auth";
import { isCursorCloudAgent, productionOnlySecret } from "./preview-secrets";

function withVercelEnv(value: string | undefined, run: () => void) {
  const previous = process.env.VERCEL_ENV;
  if (value === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
}

function withCloudAgentNames(value: string | undefined, run: () => void) {
  const injected = process.env.CLOUD_AGENT_INJECTED_SECRET_NAMES;
  const all = process.env.CLOUD_AGENT_ALL_SECRET_NAMES;
  if (value === undefined) {
    delete process.env.CLOUD_AGENT_INJECTED_SECRET_NAMES;
    delete process.env.CLOUD_AGENT_ALL_SECRET_NAMES;
  } else {
    process.env.CLOUD_AGENT_INJECTED_SECRET_NAMES = value;
    process.env.CLOUD_AGENT_ALL_SECRET_NAMES = value;
  }
  try {
    run();
  } finally {
    if (injected === undefined) delete process.env.CLOUD_AGENT_INJECTED_SECRET_NAMES;
    else process.env.CLOUD_AGENT_INJECTED_SECRET_NAMES = injected;
    if (all === undefined) delete process.env.CLOUD_AGENT_ALL_SECRET_NAMES;
    else process.env.CLOUD_AGENT_ALL_SECRET_NAMES = all;
  }
}

test("une preview ignore un secret de production", () => {
  withCloudAgentNames(undefined, () => {
    withVercelEnv("preview", () => {
      assert.equal(productionOnlySecret("secret-value"), "");
      assert.equal(productionOnlySecret("  secret-value  "), "");
    });
  });
});

test("la production et le local conservent le secret", () => {
  withCloudAgentNames(undefined, () => {
    withVercelEnv("production", () => {
      assert.equal(productionOnlySecret("  secret-value  "), "secret-value");
    });
    withVercelEnv(undefined, () => {
      assert.equal(productionOnlySecret("secret-value"), "secret-value");
    });
  });
});

test("un Cloud Agent ignore un secret même s’il est injecté", () => {
  withVercelEnv(undefined, () => {
    withCloudAgentNames("SUPABASE_SERVICE_ROLE_KEY", () => {
      assert.equal(isCursorCloudAgent(), true);
      assert.equal(productionOnlySecret("secret-value"), "");
    });
    withCloudAgentNames(undefined, () => {
      assert.equal(isCursorCloudAgent(), false);
      assert.equal(productionOnlySecret("secret-value"), "secret-value");
    });
  });
});

test("le cron d’une preview n’a pas de secret", () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "secret-value";
  try {
    withCloudAgentNames(undefined, () => {
      withVercelEnv("preview", () => {
        assert.equal(cronSecret(), "");
      });
      withVercelEnv("production", () => {
        assert.equal(cronSecret(), "secret-value");
      });
    });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
