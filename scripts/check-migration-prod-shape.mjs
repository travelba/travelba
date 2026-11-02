#!/usr/bin/env node
/**
 * Rejoue les migrations sur un Postgres local au format de la production, puis la migration visée
 * deux fois (idempotence), dans une transaction par fichier comme la CLI Supabase.
 *
 * La production porte des objets créés hors migrations (`scripts/migration-fixtures/prod-drift.sql`) :
 * `public.crm_agency_settings` y est un registre clé/valeur. Une migration qui ferait
 * `create table if not exists crm_agency_settings (id …)` verrait sa création sautée, puis son insert
 * échouer, et serait annulée en bloc. Ce script le détecte avant la production.
 *
 *   MIGRATION_DB_URL=postgres://user:pass@localhost/postgres node scripts/check-migration-prod-shape.mjs [fichier.sql]
 *
 * Sans `MIGRATION_DB_URL` ni `psql`, le script s'arrête sans erreur : la vérification statique
 * (`scripts/check-migrations.mjs`) reste la garde de la CI.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "supabase", "migrations");
const fixtures = join(root, "scripts", "migration-fixtures");
const target = process.argv[2] || "20261030160000_agency_journal_metier.sql";
const url = process.env.MIGRATION_DB_URL;

if (!url) {
  console.log("[migration-prod] MIGRATION_DB_URL absent : rejeu sauté (la vérification statique suffit en CI).");
  process.exit(0);
}
if (spawnSync("psql", ["--version"]).status !== 0) {
  console.log("[migration-prod] psql introuvable : rejeu sauté.");
  process.exit(0);
}

const dbName = `migtest_${Date.now()}`;
const admin = new URL(url);
const test = new URL(url);
test.pathname = `/${dbName}`;

function psql(connection, args, { allowFail = false } = {}) {
  const result = spawnSync("psql", [connection.toString(), "-v", "ON_ERROR_STOP=1", "-q", ...args], {
    encoding: "utf8",
    env: { ...process.env, PGOPTIONS: "-c client_min_messages=warning" },
  });
  if (result.status !== 0 && !allowFail) {
    console.error(result.stderr || result.stdout);
    throw new Error(`psql a échoué : ${args.join(" ")}`);
  }
  return result;
}

function query(sql) {
  return execFileSync("psql", [test.toString(), "-At", "-c", sql], { encoding: "utf8" }).trim();
}

psql(admin, ["-c", `create database ${dbName}`]);
try {
  psql(test, ["-f", join(fixtures, "supabase-shim.sql")]);
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql") && name !== target).sort();
  const drift = [];
  for (const name of files) {
    // Les migrations déjà en production se rejouent au mieux : un socle Supabase nu n'a pas tout
    // (colonnes posées à la main en prod). On note, on continue : seule la migration visée doit passer.
    const result = psql(test, ["-1", "-f", join(dir, name)], { allowFail: true });
    if (result.status !== 0) drift.push(name);
  }
  if (drift.length) console.log(`[migration-prod] ${drift.length} migration(s) antérieure(s) incomplète(s) sur le socle nu : ${drift.join(", ")}`);
  psql(test, ["-f", join(fixtures, "prod-drift.sql")]);

  const before = query("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'crm_agency_settings'");

  psql(test, ["-1", "-f", join(dir, target)]);
  console.log(`[migration-prod] ${target} : premier passage OK`);
  psql(test, ["-1", "-f", join(dir, target)]);
  console.log(`[migration-prod] ${target} : second passage OK (idempotente)`);

  const after = query("select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public' and table_name = 'crm_agency_settings'");
  if (before !== after) throw new Error(`crm_agency_settings a changé : ${before} → ${after}`);
  const kv = query("select count(*) from public.crm_agency_settings");
  if (kv !== "0") throw new Error("crm_agency_settings (registre clé/valeur) n'est plus vide");

  const checks = [
    ["select count(*) from public.crm_agency_access_settings where id = 1", "1"],
    ["select count(*) from public.crm_role_permissions where permission in ('view_all_dossiers','view_assigned_dossiers')", "0"],
    ["select count(*) from public.crm_role_permissions where role = 'agent' and permission in ('edit_finances','pay_supplier','view_finances','view_margins') and allowed", "4"],
    ["select count(*) from public.crm_role_permissions where role = 'agent' and permission = 'reassign_dossier' and allowed", "0"],
    ["select count(*) from public.crm_staff where active is not true", "0"],
    ["select count(*) from public.crm_staff where role = 'admin'", "1"],
    ["select count(*) from public.crm_bookings where owner_staff_id is not null", "0"],
    ["select count(*) from information_schema.columns where table_name = 'crm_bookings' and column_name in ('owner_staff_id','created_by_staff_id')", "2"],
    ["select count(*) from information_schema.columns where table_name = 'crm_agency_access_settings' and column_name = 'pliant_agent_ceiling_cents'", "0"],
    ["select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_private' and p.proname = 'can_read_booking'", "0"],
    ["select to_regclass('public.crm_booking_assignees') is null", "t"],
  ];
  for (const [sql, expected] of checks) {
    const got = query(sql);
    if (got !== expected) throw new Error(`attendu ${expected}, obtenu ${got} : ${sql}`);
  }

  // Les nouveaux rôles passent la contrainte ; les droits en base suivent la grille par défaut.
  query("insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000003', 'agent@travelba.fr'), ('00000000-0000-4000-8000-000000000004', 'manager@travelba.fr') on conflict do nothing");
  query("insert into public.crm_staff (auth_user_id, role, full_name) values ('00000000-0000-4000-8000-000000000003', 'agent', 'Agent'), ('00000000-0000-4000-8000-000000000004', 'manager', 'Manager')");
  const rights = [
    ["00000000-0000-4000-8000-000000000001", "manage_users", "t"],
    ["00000000-0000-4000-8000-000000000003", "edit_finances", "t"],
    ["00000000-0000-4000-8000-000000000003", "pay_supplier", "t"],
    ["00000000-0000-4000-8000-000000000003", "view_margins", "t"],
    ["00000000-0000-4000-8000-000000000003", "reassign_dossier", "f"],
    ["00000000-0000-4000-8000-000000000004", "reassign_dossier", "t"],
    ["00000000-0000-4000-8000-000000000002", "edit_dossiers", "f"],
  ];
  for (const [sub, permission, expected] of rights) {
    const got = query(`select set_config('request.jwt.claim.sub', '${sub}', false); select crm_private.agency_allows('${permission}')`).split("\n").pop();
    if (got !== expected) throw new Error(`agency_allows(${permission}) pour ${sub} : attendu ${expected}, obtenu ${got}`);
  }

  // Le journal est scellé et append-only.
  query("insert into public.crm_agency_journal (action, entity_type, summary, row_hash) values ('create', 'dossier', 'Test 4242424242424242', 'pending')");
  const sealed = query("select summary || '|' || (prev_hash is null)::text || '|' || (row_hash <> 'pending')::text from public.crm_agency_journal order by seq desc limit 1");
  if (sealed !== "Test ••••|true|true") throw new Error(`journal non scellé : ${sealed}`);
  const refused = spawnSync("psql", [test.toString(), "-At", "-c", "delete from public.crm_agency_journal"], { encoding: "utf8" });
  if (refused.status === 0 || !/append-only/.test(refused.stderr)) throw new Error("le journal accepte une suppression");

  // Journal métier (20261030160000) : colonnes additives, sceau étendu, quatre chiffres au plus, droit view_activity.
  const metierColumns = query(
    "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_agency_journal' and column_name in ('kind','booking_id','amount_cents','currency','card_last4','actor_label')"
  );
  if (metierColumns !== "6") throw new Error(`colonnes du journal métier : attendu 6, obtenu ${metierColumns}`);
  const fkTarget = query(
    "select count(*) from information_schema.table_constraints tc join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name where tc.table_name = 'crm_agency_journal' and tc.constraint_type = 'FOREIGN KEY' and k.column_name = 'booking_id'"
  );
  if (fkTarget !== "1") throw new Error(`booking_id du journal sans clé étrangère vers crm_bookings (${fkTarget})`);
  query(
    "insert into public.crm_agency_journal (action, entity_type, summary, row_hash, kind, booking_id, amount_cents, currency, card_last4, actor_label) values ('create', 'card', 'Carte Pliant •••• 4821 émise, 2 450 €', 'pending', 'carte_emise', null, 245000, 'EUR', '4821', null)"
  );
  const metier = query(
    "select kind || '|' || amount_cents::text || '|' || currency || '|' || card_last4 || '|' || (canonical like '%|carte_emise|%|245000|EUR|4821|')::text from public.crm_agency_journal order by seq desc limit 1"
  );
  if (metier !== "carte_emise|245000|EUR|4821|true") throw new Error(`journal métier non scellé : ${metier}`);
  // Un numéro complet glissé dans card_last4 est retiré par le sceau avant d’être écrit ; la ligne reste.
  query(
    "insert into public.crm_agency_journal (action, entity_type, summary, row_hash, card_last4) values ('create', 'card', 'Carte 4242424242424242 ouverte', 'pending', '4242424242424242')"
  );
  const scrubbed = query("select coalesce(card_last4, 'null') || '|' || summary from public.crm_agency_journal order by seq desc limit 1");
  if (scrubbed !== "null|Carte •••• ouverte") throw new Error(`numéro complet non retiré : ${scrubbed}`);
  const activity = [
    ["00000000-0000-4000-8000-000000000001", "t"],
    ["00000000-0000-4000-8000-000000000003", "f"],
    ["00000000-0000-4000-8000-000000000004", "f"],
  ];
  for (const [sub, expected] of activity) {
    const got = query(`select set_config('request.jwt.claim.sub', '${sub}', false); select crm_private.agency_allows('view_activity')`).split("\n").pop();
    if (got !== expected) throw new Error(`agency_allows(view_activity) pour ${sub} : attendu ${expected}, obtenu ${got}`);
  }
  const olderChain = query("select count(*) from public.crm_agency_journal where prev_hash is null");
  if (olderChain !== "1") throw new Error(`la chaîne du journal a ${olderChain} débuts`);

  console.log("[migration-prod] OK : la table clé/valeur crm_agency_settings est intacte, les droits, le journal et le journal métier sont en place.");
} finally {
  psql(admin, ["-c", `drop database if exists ${dbName}`], { allowFail: true });
}
