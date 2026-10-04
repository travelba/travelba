import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ACTION_NETWORK_ERROR, adminAction, adminActionStatusMessage } from "./admin-action";

function reply(status: number, body: unknown) {
  return async () => new Response(body === undefined ? "" : JSON.stringify(body), { status });
}

test("une réponse ok rend les données, sans lever", async () => {
  const result = await adminAction<{ booking: { id: string } }>(
    "/api/x",
    { method: "POST", body: { a: 1 } },
    reply(200, { booking: { id: "b1" } })
  );
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.data?.booking.id, "b1");
});

test("l’erreur et les points bloquants du serveur sont lus", async () => {
  const withIssues = await adminAction(
    "/api/x",
    { method: "DELETE" },
    reply(400, { error: "2 points", issues: [{ field: "travelers", message: "Déjà sur le séjour." }, { nope: true }] })
  );
  assert.equal(withIssues.ok, false);
  assert.equal(withIssues.error, "2 points");
  assert.deepEqual(withIssues.issues, [{ field: "travelers", message: "Déjà sur le séjour." }]);

  const onlyIssues = await adminAction("/api/x", { method: "POST" }, reply(400, { issues: [{ field: "a", message: "A." }] }));
  assert.equal(onlyIssues.error, "A.");

  const silent = await adminAction("/api/x", { method: "POST" }, reply(500, undefined));
  assert.equal(silent.ok, false);
  assert.equal(silent.error, adminActionStatusMessage(500));
  assert.equal(silent.issues, undefined);
});

test("réseau coupé → message français, status 0", async () => {
  const result = await adminAction("/api/x", { method: "POST" }, async () => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.equal(result.error, ADMIN_ACTION_NETWORK_ERROR);
});

test("formData part sans en-tête JSON, le corps JSON avec", async () => {
  const seen: RequestInit[] = [];
  const fetcher = async (_url: string, init?: RequestInit) => {
    seen.push(init || {});
    return new Response("{}", { status: 200 });
  };
  const form = new FormData();
  form.set("file", "x");
  await adminAction("/api/x", { method: "POST", formData: form }, fetcher);
  await adminAction("/api/x", { method: "PATCH", body: { ok: true } }, fetcher);
  assert.equal((seen[0].headers as Record<string, string>)["Content-Type"], undefined);
  assert.ok(seen[0].body instanceof FormData);
  assert.equal((seen[1].headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal(seen[1].body, '{"ok":true}');
});
