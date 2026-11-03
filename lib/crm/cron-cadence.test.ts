import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CRON_CADENCE } from "./cron-cadence";

test("vercel.json reprend chaque cadence, et les minutes ne se rejoignent plus", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  assert.equal(vercel.crons.length, CRON_CADENCE.length);
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  for (const cron of CRON_CADENCE) {
    assert.equal(byPath.get(cron.path), cron.schedule, cron.path);
    assert.ok(cron.reason.length > 40, cron.path);
  }
  const minutes = CRON_CADENCE.map((cron) => cron.schedule.split(" ")[0]);
  assert.equal(new Set(minutes).size, minutes.length);
  assert.equal(minutes.includes("*/15"), false);
  assert.equal(minutes.includes("*"), false);
});

test("la liste Little Emperors de l’API MCP n’est pas filtrée par date", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const source = readFileSync(join(root, "lib/crm/little-emperors.ts"), "utf8");
  assert.match(source, /export async function listLittleEmperorsBookings\(fetchImpl\?: typeof fetch\)/);
  const mcp = readFileSync(join(root, "lib/crm/mcp-le.ts"), "utf8");
  assert.match(mcp, /listLittleEmperorsBookings\(\)/);
});
