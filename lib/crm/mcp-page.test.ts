import assert from "node:assert/strict";
import test from "node:test";
import { MCP_PAGE_MAX, mcpPageMeta, mcpWindow } from "./mcp-page";

test("la page MCP a un défaut et n’empêche pas d’aller plus loin", () => {
  assert.deepEqual(mcpWindow(undefined, 20), { page: 1, limite: 20, from: 0 });
  assert.deepEqual(mcpWindow({ page: 4, limite: 25 }), { page: 4, limite: 25, from: 75 });
  assert.equal(mcpWindow({ page: 0, limite: 500 }).limite, MCP_PAGE_MAX);
  assert.equal(mcpWindow({ page: 2 }).from, 30);
  const page = mcpPageMeta(["a", "b", "c"], { page: 1, limite: 2 });
  assert.deepEqual(page.rows, ["a", "b"]);
  assert.equal(page.suite, true);
  assert.equal(page.page_suivante, 2);
  const last = mcpPageMeta(["a"], { page: 3, limite: 2 });
  assert.equal(last.suite, false);
  assert.equal(last.page_suivante, null);
});
