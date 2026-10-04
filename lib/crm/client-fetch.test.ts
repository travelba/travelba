import assert from "node:assert/strict";
import test from "node:test";
import { deleteJson, NETWORK_ERROR, postJson, sendForm } from "./client-fetch";

type Call = { url: string; init?: RequestInit };

function stubFetch(handler: (call: Call) => Response | Promise<Response> | never) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("postJson renvoie les données et ne lève jamais", async () => {
  const stub = stubFetch(() => Response.json({ customer: { id: "c1" } }));
  try {
    const result = await postJson<{ customer: { id: string } }>("/api/client/profile", { phone: "+33" }, { method: "PATCH" });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data?.customer.id, "c1");
    assert.equal(stub.calls[0].init?.method, "PATCH");
    assert.equal(stub.calls[0].init?.body, JSON.stringify({ phone: "+33" }));
  } finally {
    stub.restore();
  }
});

test("une coupure réseau devient un message, pas une exception", async () => {
  const stub = stubFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  try {
    const result = await postJson("/api/client/onboarding", {});
    assert.deepEqual(result, { ok: false, status: 0, error: NETWORK_ERROR });
  } finally {
    stub.restore();
  }
});

test("l’erreur de la route est reprise, sinon un repli lisible ; 401 parle de session", async () => {
  const stub = stubFetch(({ url }) => {
    if (url.endsWith("/a")) return Response.json({ error: "Téléphone invalide" }, { status: 400 });
    if (url.endsWith("/b")) return new Response("<html>502</html>", { status: 502 });
    return new Response("", { status: 401 });
  });
  try {
    const a = await sendForm("/api/x/a", new FormData());
    assert.equal(a.ok, false);
    assert.equal(a.status, 400);
    assert.equal(a.error, "Téléphone invalide");
    const b = await deleteJson("/api/x/b");
    assert.equal(b.ok, false);
    assert.equal(b.error, "La demande n’a pas abouti. Réessayez.");
    const c = await postJson("/api/x/c", {});
    assert.equal(c.status, 401);
    assert.match(c.error || "", /session a expiré/);
    assert.equal(stub.calls[2].init?.method, "POST");
  } finally {
    stub.restore();
  }
});
