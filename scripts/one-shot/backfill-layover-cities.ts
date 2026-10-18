/**
 * Retire les escales pures du titre et de la destination des dossiers.
 * Une ville est une escale quand on y arrive et qu’on en repart en avion
 * en moins de 24 h (TRAVELBA_LAYOVER_MAX_HOURS), sans hôtel ni autre service sur place.
 * Un nom choisi (« 40 ans ») n’est pas réécrit.
 *
 *   npx tsx scripts/one-shot/backfill-layover-cities.ts
 *   npx tsx scripts/one-shot/backfill-layover-cities.ts --apply
 *
 * Sans --apply, rien n’est écrit. Aucun message client.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { layoverDossierDiff } from "../../lib/crm/staff-stay";
import { layoverMaxHours, type TripStep } from "../../lib/crm/layover";

function loadEnv() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

type BookingRow = { id: string; reference: string; title: string | null; destination: string | null };

async function loadPage<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
) {
  const rows: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function quote(value: string) {
  return value ? `« ${value} »` : "« »";
}

async function main() {
  const apply = process.argv.includes("--apply");
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase n’est pas configuré.");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const bookings = await loadPage<BookingRow>((from, to) =>
    admin
      .from("crm_bookings")
      .select("id, reference, title, destination")
      .order("reference")
      .range(from, to)
  );
  const items = await loadPage<TripStep & { booking_id: string }>((from, to) =>
    admin
      .from("crm_booking_items")
      .select("id, booking_id, kind, title, start_at, end_at, sort_order, lifecycle, details")
      .order("id")
      .range(from, to)
  );
  const byBooking = new Map<string, TripStep[]>();
  for (const item of items) {
    const list = byBooking.get(item.booking_id) || [];
    list.push(item);
    byBooking.set(item.booking_id, list);
  }

  console.log(`${apply ? "Écriture" : "Simulation"} — fenêtre d’escale : ${layoverMaxHours()} h.`);
  let writes = 0;
  let custom = 0;
  for (const booking of bookings) {
    const diff = layoverDossierDiff(booking.title, booking.destination, byBooking.get(booking.id) || []);
    if (!diff) continue;
    const lines = [`${booking.reference}`];
    if (diff.title) lines.push(`  titre : ${quote(diff.title.from)} → ${quote(diff.title.to)}`);
    else if (diff.customTitle) lines.push(`  titre choisi, laissé : ${quote(booking.title || "")}`);
    if (diff.destination) {
      lines.push(`  destination : ${quote(diff.destination.from)} → ${quote(diff.destination.to)}`);
    } else if (diff.customDestination) {
      lines.push(`  destination choisie, laissée : ${quote(booking.destination || "")}`);
    }
    lines.push(`  escales : ${diff.layovers.join(", ") || "—"}`);
    console.log(lines.join("\n"));
    if (diff.customTitle || diff.customDestination) custom += 1;
    if (!diff.title && !diff.destination) continue;
    writes += 1;
    if (!apply) continue;
    const patch: { title?: string; destination?: string } = {};
    if (diff.title) patch.title = diff.title.to;
    if (diff.destination) patch.destination = diff.destination.to;
    const { error } = await admin.from("crm_bookings").update(patch).eq("id", booking.id);
    if (error) throw new Error(`${booking.reference} : ${error.message}`);
  }
  console.log(
    `${writes} dossier${writes > 1 ? "s" : ""} à corriger, ${custom} avec un nom choisi laissé. ${
      apply ? "Écrit." : "Rien n’a été écrit."
    }`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Rattrapage impossible.");
  process.exit(1);
});
