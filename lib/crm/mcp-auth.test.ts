import assert from "node:assert/strict";
import test from "node:test";
import { mcpAuthorized, mcpSecret } from "./mcp-auth";

function withEnv(vercel: string | undefined, token: string | undefined, run: () => void) {
  const previousVercel = process.env.VERCEL_ENV;
  const previousToken = process.env.TRAVELBA_MCP_TOKEN;
  if (vercel === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercel;
  if (token === undefined) delete process.env.TRAVELBA_MCP_TOKEN;
  else process.env.TRAVELBA_MCP_TOKEN = token;
  try {
    run();
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercel;
    if (previousToken === undefined) delete process.env.TRAVELBA_MCP_TOKEN;
    else process.env.TRAVELBA_MCP_TOKEN = previousToken;
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
});
