import assert from "node:assert/strict";
import test from "node:test";
import { holidaysFor } from "./holidays";

function fetchStub(byYear: Record<string, unknown>, calls: string[] = []) {
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const year = url.match(/PublicHolidays\/(\d{4})\//)?.[1] || "";
    const body = byYear[year];
    if (body === undefined) return new Response("", { status: 404 });
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("les fériés de l’année du check-in et de la précédente sont lus puis mémorisés", async () => {
  const { impl, calls } = fetchStub({
    "2025": [{ date: "2025-12-25" }],
    "2026": [{ date: "2026-01-01" }, { date: "2026-11-11" }, { date: "pas une date" }],
  });
  const cache = new Map<string, string[]>();
  const first = await holidaysFor("France", "2026-11-04", impl, cache);
  assert.deepEqual(first, ["2025-12-25", "2026-01-01", "2026-11-11"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/2025\/FR$/);
  assert.match(calls[1], /\/2026\/FR$/);
  const again = await holidaysFor("France", "2026-11-20", impl, cache);
  assert.equal(again, first);
  assert.equal(calls.length, 2, "le cache évite tout nouvel appel");
});

test("pays inconnu ou check-in sans année : aucune lecture", async () => {
  const { impl, calls } = fetchStub({ "2026": [{ date: "2026-01-01" }] });
  assert.deepEqual(await holidaysFor("Atlantide", "2026-11-04", impl, new Map()), []);
  assert.deepEqual(await holidaysFor("France", "", impl, new Map()), []);
  assert.deepEqual(await holidaysFor("France", "n/a", impl, new Map()), []);
  assert.equal(calls.length, 0);
});

test("une année en erreur ou en panne n’empêche pas l’autre", async () => {
  const { impl } = fetchStub({ "2025": new Error("réseau"), "2026": [{ date: "2026-05-01" }] });
  assert.deepEqual(await holidaysFor("Italie", "2026-05-02", impl, new Map()), ["2026-05-01"]);
  const { impl: missing } = fetchStub({ "2026": [{ date: "2026-05-01" }] });
  assert.deepEqual(await holidaysFor("IT", "2026-05-02", missing, new Map()), ["2026-05-01"]);
});
