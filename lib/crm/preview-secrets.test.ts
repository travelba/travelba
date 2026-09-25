import assert from "node:assert/strict";
import test from "node:test";
import { cronSecret } from "./cron-auth";
import { productionOnlySecret } from "./preview-secrets";

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

test("une preview ignore un secret de production", () => {
  withVercelEnv("preview", () => {
    assert.equal(productionOnlySecret("secret-value"), "");
    assert.equal(productionOnlySecret("  secret-value  "), "");
  });
});

test("la production et le local conservent le secret", () => {
  withVercelEnv("production", () => {
    assert.equal(productionOnlySecret("  secret-value  "), "secret-value");
  });
  withVercelEnv(undefined, () => {
    assert.equal(productionOnlySecret("secret-value"), "secret-value");
  });
});

test("le cron d’une preview n’a pas de secret", () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "secret-value";
  try {
    withVercelEnv("preview", () => {
      assert.equal(cronSecret(), "");
    });
    withVercelEnv("production", () => {
      assert.equal(cronSecret(), "secret-value");
    });
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
