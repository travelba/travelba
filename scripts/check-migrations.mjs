#!/usr/bin/env node
/**
 * Garde-fou des migrations Supabase (sans dépendance) :
 *   - nom `YYYYMMDDHHMMSS_slug.sql` (slug en minuscules, chiffres, underscore) ;
 *   - un seul fichier par version (la CLI Supabase utilise l'horodatage comme clé
 *     de `supabase_migrations.schema_migrations` : deux fichiers de même version
 *     s'appliquent dans un ordre ambigu, ou un seul).
 *
 *   node scripts/check-migrations.mjs
 */
import { readdirSync } from "node:fs";
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

if (errors.length) {
  console.error(`[migrations] ${errors.length} problème(s) :`);
  for (const line of errors) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`[migrations] ${files.length} fichiers, ${byVersion.size} versions, OK`);
