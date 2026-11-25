import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pliantAlertSeen } from "./agency-log";

const text = "Little Emperors a annulé le séjour 90992810. La carte a été gelée.";

test("une alerte Pliant identique dans les six heures est déjà vue", () => {
  const now = Date.parse("2026-11-20T12:00:00.000Z");
  assert.equal(pliantAlertSeen([{ summary: text, created_at: "2026-11-20T11:00:00.000Z" }], text, now), true);
  assert.equal(pliantAlertSeen([{ summary: text, created_at: "2026-11-20T05:00:00.000Z" }], text, now), false);
  assert.equal(pliantAlertSeen([{ summary: "autre texte", created_at: "2026-11-20T11:30:00.000Z" }], text, now), false);
  const src = readFileSync(new URL("./agency-log.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function recordPliantAlert"), src.indexOf("const PAY_ALERT_WINDOW_MS"));
  assert.match(fn, /\.eq\("summary", text\)/);
  assert.match(fn, /\.gte\("created_at", since\)/);
  assert.doesNotMatch(fn, /\.limit\(20\)/);
});

test("un séjour annulé déjà gelé ne redemande pas le gel", () => {
  const src = readFileSync(new URL("./little-emperors-sync.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function freezeCancelledLeStay"), src.indexOf("const LE_STORED_COLUMNS"));
  assert.match(fn, /phase === "cancelled"/);
  assert.match(fn, /markedLocked/);
  assert.match(fn, /if \(row\?\.phase === "cancelled"\) return/);
});
