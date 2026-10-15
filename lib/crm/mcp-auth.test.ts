import assert from "node:assert/strict";
import test from "node:test";
import { mcpAccessFromAuthorization, mcpAuthorized, mcpSecret } from "./mcp-auth";

function withEnv(
  vercel: string | undefined,
  token: string | undefined,
  run: () => void,
  passport?: string
) {
  const previousVercel = process.env.VERCEL_ENV;
  const previousToken = process.env.TRAVELBA_MCP_TOKEN;
  const previousPassport = process.env.TRAVELBA_MCP_PASSPORT_TOKENS;
  if (vercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercel;
  if (token === undefined) delete process.env.TRAVELBA_MCP_TOKEN;
  else process.env.TRAVELBA_MCP_TOKEN = token;
  if (passport === undefined) delete process.env.TRAVELBA_MCP_PASSPORT_TOKENS;
  else process.env.TRAVELBA_MCP_PASSPORT_TOKENS = passport;
  try {
    run();
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercel;
    if (previousToken === undefined) delete process.env.TRAVELBA_MCP_TOKEN;
    else process.env.TRAVELBA_MCP_TOKEN = previousToken;
    if (previousPassport === undefined) delete process.env.TRAVELBA_MCP_PASSPORT_TOKENS;
    else process.env.TRAVELBA_MCP_PASSPORT_TOKENS = previousPassport;
  }
}

test("mcp refuses a missing token", () => {
  withEnv(undefined, "", () => {
    assert.equal(mcpAuthorized("Bearer anything"), false);
    assert.equal(mcpAuthorized(null), false);
  });
  withEnv(undefined, undefined, () => {
    assert.equal(mcpSecret(), "");
  });
});

test("mcp accepts only the exact bearer token", () => {
  withEnv(undefined, "secret", () => {
    assert.equal(mcpAuthorized("Bearer secret"), true);
    assert.equal(mcpAuthorized("Bearer other"), false);
    assert.equal(mcpAuthorized("secret"), false);
    assert.equal(mcpAuthorized(null), false);
  });
});

test("mcp preview ignores a production token", () => {
  withEnv("preview", "secret", () => {
    assert.equal(mcpSecret(), "");
    assert.equal(mcpAuthorized("Bearer secret"), false);
  });
  withEnv("preview", "general-token-value", () => {
    assert.equal(mcpAccessFromAuthorization("Bearer ticketing-token-ok"), null);
  }, "amadeus:ticketing-token-ok");
});

test("a named passport token is a separate grant", () => {
  withEnv(undefined, "general-token-value", () => {
    assert.deepEqual(mcpAccessFromAuthorization("Bearer ticketing-token-ok"), {
      actor: "amadeus",
      passport: true,
    });
    assert.deepEqual(mcpAccessFromAuthorization("Bearer general-token-value"), {
      actor: "mcp",
      passport: false,
    });
    assert.equal(mcpAuthorized("Bearer ticketing-token-ok"), true);
    assert.equal(mcpAccessFromAuthorization("Bearer nope"), null);
    assert.deepEqual(mcpAccessFromAuthorization("Bearer second-token-value!"), {
      actor: "billets",
      passport: true,
    });
  }, "Amadeus:ticketing-token-ok, billets:second-token-value!");
});

test("passport grants ignore a short secret, the name mcp, and the general token", () => {
  withEnv(undefined, "general-token-value", () => {
    assert.equal(mcpAccessFromAuthorization("Bearer short"), null);
    assert.equal(mcpAccessFromAuthorization("Bearer ticketing-token-ok"), null);
    assert.deepEqual(mcpAccessFromAuthorization("Bearer general-token-value"), {
      actor: "mcp",
      passport: false,
    });
  }, "amadeus:short,mcp:ticketing-token-ok,copie:general-token-value");
});
