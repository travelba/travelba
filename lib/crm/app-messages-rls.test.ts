import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261123180000_app_messages.sql"), "utf8");

test("la messagerie ne s’ouvre qu’au client du fil, et l’anonyme n’a rien", () => {
  assert.match(sql, /customer_id = crm_private\.customer_id\(\)/);
  assert.match(sql, /crm_private\.is_staff\(\)/);
  assert.match(sql, /revoke all on public\.crm_app_threads from anon, authenticated/);
  assert.match(sql, /revoke all on public\.crm_app_messages from anon, authenticated/);
  assert.match(sql, /grant select on public\.crm_app_threads to authenticated/);
  assert.match(sql, /grant select on public\.crm_app_messages to authenticated/);
  assert.equal(/for insert/i.test(sql), false);
  assert.equal(/for update/i.test(sql), false);
  assert.equal(/for delete/i.test(sql), false);
  assert.match(sql, /author_kind in \('customer', 'agency'\)/);
  assert.match(sql, /customers\/%\/messages\/%/);
  assert.match(sql, /push_messages boolean not null default true/);
  assert.match(sql, /enable row level security/);
});
