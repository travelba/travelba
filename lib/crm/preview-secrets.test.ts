import assert from "node:assert/strict";
import test from "node:test";
import { cronSecret } from "./cron-auth";
import { productionOnlySecret, stagingPreviewServiceRole } from "./preview-secrets";

function jwt(payload: Record<string, string>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${body}.sig`;
}

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

test("la preview staging n’accepte que le service role de sa branche", () => {
  const staging = jwt({ role: "service_role", ref: "lnygnjbvuzgarseqfjlm" });
  const production = jwt({ role: "service_role", ref: "fsmfozxgujskluxakeoq" });
  const anon = jwt({ role: "anon", ref: "lnygnjbvuzgarseqfjlm" });
  const stagingEnv = {
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: "https://lnygnjbvuzgarseqfjlm.supabase.co",
  };
  assert.equal(stagingPreviewServiceRole(staging, stagingEnv), staging);
  assert.equal(productionOnlySecret(staging, stagingEnv), staging);
  assert.equal(productionOnlySecret(production, stagingEnv), "");
  assert.equal(productionOnlySecret(anon, stagingEnv), "");
  assert.equal(productionOnlySecret("sb_secret_production", stagingEnv), "");
  assert.equal(
    productionOnlySecret(staging, {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co",
    }),
    "",
  );
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
