#!/usr/bin/env node
/**
 * Garde-fou des migrations Supabase (sans dépendance) :
 *   - nom `YYYYMMDDHHMMSS_slug.sql` (slug en minuscules, chiffres, underscore) ;
 *   - un seul fichier par version (la CLI Supabase utilise l'horodatage comme clé
 *     de `supabase_migrations.schema_migrations` : deux fichiers de même version
 *     s'appliquent dans un ordre ambigu, ou un seul) ;
 *   - une table n'est créée que par une seule migration : un second
 *     `create table if not exists` du même nom serait sauté en silence, et les
 *     statements qui suivent (insert, index) échoueraient sur l'autre schéma ;
 *   - aucune migration ne touche une table qui existe en production hors
 *     migrations avec un autre schéma (`PRODUCTION_EXTERNAL_TABLES`).
 *
 *   node scripts/check-migrations.mjs
 *   MIGRATION_DB_URL=postgres://… node scripts/check-migrations.mjs   # + rejeu sur un Postgres au format prod
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const NAME = /^\d{14}_[a-z0-9_]+\.sql$/;

/**
 * Paires déjà appliquées en prod sous le même horodatage. On ne renomme pas une
 * migration poussée : elles sont tolérées telles quelles, et seulement elles.
 * Toute nouvelle collision échoue.
 */
const LEGACY_DUPLICATE_VERSIONS = new Set([
  "20260923180000", // booking_item_kind_checkin / booking_item_kind_expense
  "20260925120000", // billing_companies / whatsapp_concierge
  "20260925143000", // visa_request_accepted / whatsapp_opt_out
  "20260928150000", // booking_reference_service_role / crm_hotel_arrivals
  "20260929183000", // declined_services_staff_write / staff_card_code
  "20260930235000", // booking_archive_client_read / transaction_payer_kind
  "20261005100000", // card_links / crm_pliant_cards
  "20261006153000", // booking_items_order_custom / esta_checks
  "20261007183000", // billing_company_funding / companion_loyalty
]);

/**
 * Tables présentes dans le projet de production (fsmfozxgujskluxakeoq) sans migration dans ce dépôt,
 * avec un schéma différent de ce qu'une migration pourrait supposer. Une migration ne doit ni les créer
 * (`if not exists` sauterait la création), ni les modifier, ni y écrire. Choisir un autre nom.
 */
const PRODUCTION_EXTERNAL_TABLES = {
  crm_agency_settings:
    "registre clé/valeur (key text primary key, label, value jsonb, secret_configured, updated_by, updated_at), créé hors migrations",
};

const files = readdirSync(DIR).filter((name) => !name.startsWith("."));
const errors = [];
const byVersion = new Map();

for (const name of files) {
  if (!NAME.test(name)) {
    errors.push(`nom invalide : ${name} (attendu YYYYMMDDHHMMSS_slug.sql, slug [a-z0-9_])`);
    continue;
  }
  const version = name.slice(0, 14);
  const list = byVersion.get(version) || [];
  list.push(name);
  byVersion.set(version, list);
}

for (const [version, names] of byVersion) {
  if (names.length < 2) continue;
  if (LEGACY_DUPLICATE_VERSIONS.has(version) && names.length === 2) continue;
  errors.push(`version ${version} partagée par ${names.length} fichiers : ${names.join(", ")}`);
}

for (const version of LEGACY_DUPLICATE_VERSIONS) {
  if ((byVersion.get(version) || []).length !== 2) {
    errors.push(`liste blanche obsolète : ${version} n'a plus deux fichiers, retirer l'entrée`);
  }
}

/** Lignes SQL sans les commentaires `--` : un nom cité dans un commentaire ne compte pas. */
function sqlWithoutComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const TABLE_NAME = "(?:public\\.)?([a-z_][a-z0-9_]*)";
const CREATE_TABLE = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${TABLE_NAME}`, "gi");
const createdBy = new Map();

for (const name of files) {
  if (!NAME.test(name)) continue;
  const sql = sqlWithoutComments(readFileSync(join(DIR, name), "utf8"));
  for (const match of sql.matchAll(CREATE_TABLE)) {
    const table = match[1].toLowerCase();
    const list = createdBy.get(table) || [];
    list.push(name);
    createdBy.set(table, list);
  }
  for (const [table, shape] of Object.entries(PRODUCTION_EXTERNAL_TABLES)) {
    const touched = new RegExp(
      `\\b(?:table|into|from|update|on|truncate|only)\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?(?:public\\.)?${table}\\b(?!_)`,
      "i"
    );
    if (touched.test(sql)) {
      errors.push(
        `${name} touche public.${table}, qui existe en production hors migrations (${shape}) : la création serait sautée et la suite échouerait. Utiliser un autre nom.`
      );
    }
  }
}

for (const [table, names] of createdBy) {
  if (names.length < 2) continue;
  errors.push(
    `table ${table} créée par ${names.length} migrations (${names.join(", ")}) : le second « if not exists » serait sauté en silence`
  );
}

if (errors.length) {
  console.error(`[migrations] ${errors.length} problème(s) :`);
  for (const line of errors) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`[migrations] ${files.length} fichiers, ${byVersion.size} versions, ${createdBy.size} tables créées une seule fois, OK`);

// Rejeu sur un Postgres au format de la production quand une base est fournie (voir le script).
if (process.env.MIGRATION_DB_URL) {
  const replay = spawnSync(process.execPath, [join(process.cwd(), "scripts", "check-migration-prod-shape.mjs")], {
    stdio: "inherit",
    env: process.env,
  });
  if (replay.status !== 0) process.exit(replay.status ?? 1);
}
