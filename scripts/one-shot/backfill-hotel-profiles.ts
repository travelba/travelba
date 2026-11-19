/**
 * Rattrapage : fiche hôtel pour les cartes actives qui ne sont pas chez Little Emperors,
 * puis champs vides de ces cartes. Une fiche par nom et par ville, ou par nom et
 * site ou adresse quand la ville diffère. Une carte sans ville est cherchée par le nom
 * et signalée dans la sortie.
 *
 * Sec par défaut. Rien n’est écrit, Perplexity n’est pas appelé.
 *   npx tsx scripts/one-shot/backfill-hotel-profiles.ts
 *   npx tsx scripts/one-shot/backfill-hotel-profiles.ts --dry-run
 *   npx tsx scripts/one-shot/backfill-hotel-profiles.ts --ecrire
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  fillCardFromProfile,
  hotelBackfillLine,
  planHotelBackfill,
  runHotelEnrichment,
  type HotelBackfillCard,
} from "../../lib/crm/hotel-enrich";

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

async function loadPages<T>(admin: SupabaseClient, table: string, columns: string, orderBy: string) {
  const rows: T[] = [];
  for (let from = 0; from < 20000; from += 500) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    const batch = (data || []) as T[];
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

async function main() {
  const write = process.argv.includes("--ecrire") && !process.argv.includes("--dry-run");
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase n'est pas configuré.");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const cards = await loadPages<HotelBackfillCard>(
    admin,
    "crm_booking_items",
    "id, kind, title, supplier, lifecycle, details",
    "id"
  );
  const hotels = cards.filter((card) => card.kind === "hotel");
  const leRows = await loadPages<{ hotel_name: string; city: string; country: string }>(
    admin,
    "crm_le_hotels",
    "hotel_name, city, country",
    "le_hotel_id"
  );
  const plan = planHotelBackfill(hotels, leRows);
  console.log(`${write ? "Écriture" : "Simulation"} : ${plan.length} hôtel${plan.length > 1 ? "s" : ""}.`);
  for (const group of plan) {
    console.log(`- ${hotelBackfillLine(group)}`);
  }
  if (!write) {
    console.log("Rien n’a été écrit. Relancer avec --ecrire pour remplir les fiches et les champs vides.");
    return;
  }
  for (const group of plan) {
    const primary = group.ids[0];
    if (group.gaps.length) {
      const enriched = await runHotelEnrichment(admin, primary, group.ville_absente ? { nomSeul: true } : undefined);
      console.log(`  ${group.name} : ${enriched.message}`);
    }
    for (const id of group.ids.slice(1)) {
      const filled = await fillCardFromProfile(admin, id, group.key);
      if (filled.rempli.length) console.log(`  carte ${id.slice(0, 8)} : ${filled.message}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "echec");
  process.exit(1);
});
