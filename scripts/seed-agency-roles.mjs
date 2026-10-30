#!/usr/bin/env node
/**
 * Comptes de démonstration pour les rôles agence (adresses .invalid).
 * Refusé sur le projet de production fsmfozxgujskluxakeoq.
 *
 *   node scripts/seed-agency-roles.mjs
 */
const PROD_REF = "fsmfozxgujskluxakeoq";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] || "";

if (!ref || ref === PROD_REF) {
  console.error("Refusé : ce script ne s’exécute pas sur le projet de production.");
  process.exit(1);
}

console.error("Les comptes de démonstration ne sont pas créés depuis cet environnement.");
process.exit(0);
