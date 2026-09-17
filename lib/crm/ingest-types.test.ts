import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { bindGatewayAuth, openaiApiKey, preferAiGateway } from "./ingest-types";

const KEYS = [
  "OPENAI_API_KEY",
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "VERCEL",
] as const;

const snapshot = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("openaiApiKey", () => {
  it("accepts a real sk- key", () => {
    assert.equal(openaiApiKey("sk-proj-abcdefghijklmnopqrstuvwxyz"), "sk-proj-abcdefghijklmnopqrstuvwxyz");
  });

  it("extracts sk- from a pasted OPENAI_API_KEY= line", () => {
    assert.equal(
      openaiApiKey("OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz"),
      "sk-proj-abcdefghijklmnopqrstuvwxyz"
    );
  });

  it("strips quotes and Bearer", () => {
    assert.equal(openaiApiKey('"sk-proj-abcdefghijklmnopqrstuvwxyz"'), "sk-proj-abcdefghijklmnopqrstuvwxyz");
    assert.equal(openaiApiKey("Bearer sk-proj-abcdefghijklmnopqrstuvwxyz"), "sk-proj-abcdefghijklmnopqrstuvwxyz");
  });

  it("rejects placeholders that are not sk- keys", () => {
    assert.equal(openaiApiKey("OPENAI_API_KEY"), "");
    assert.equal(openaiApiKey("vck_not_an_openai_key_at_all_xxxxx"), "");
    assert.equal(openaiApiKey(""), "");
  });
});

describe("preferAiGateway", () => {
  it("forces Gateway on Vercel even if a sk- key is present", () => {
    process.env.VERCEL = "1";
    process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    assert.equal(preferAiGateway(), true);
  });

  it("uses OpenAI direct locally when a sk- key is present", () => {
    delete process.env.VERCEL;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.OPENAI_API_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz";
    assert.equal(preferAiGateway(), false);
  });
});

describe("bindGatewayAuth", () => {
  it("copies the Vercel OIDC request header into env", () => {
    delete process.env.VERCEL_OIDC_TOKEN;
    const request = new Request("https://travelba.fr/api/admin/travel-documents/scan", {
      headers: { "x-vercel-oidc-token": "oidc-test-token" },
    });
    bindGatewayAuth(request);
    assert.equal(process.env.VERCEL_OIDC_TOKEN, "oidc-test-token");
  });
});
