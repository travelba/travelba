/**
 * Rend visible la carte hôtel d’un séjour déjà confirmé.
 * Idempotent : un second passage ne change rien si la carte est déjà visible.
 * N’envoie ni e-mail ni WhatsApp. N’écrit pas de migration.
 *
 *   npx tsx scripts/show-le-hotel-item.ts TB-2026-0142
 *
 * Lit NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
 * (environnement, sinon .env.local). Ne les affiche pas.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServiceClient } from "../lib/supabase/admin";

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]?.trim()) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  const reference = (process.argv[2] || "").trim();
  if (!/^TB-\d{4}-\d+$/.test(reference)) {
    console.error("Indiquez la référence, par exemple TB-2026-0142.");
    process.exit(1);
  }
  loadLocalEnv();
  const admin = createServiceClient();
  const { data: booking, error } = await admin
    .from("crm_bookings")
    .select("id, reference, visible_to_client, prices_visible")
    .eq("reference", reference)
    .maybeSingle();
  if (error || !booking) {
    console.error("Séjour introuvable.");
    process.exit(1);
  }
  const { data: items, error: itemsError } = await admin
    .from("crm_booking_items")
    .select("id, kind, visible_to_client, lifecycle")
    .eq("booking_id", booking.id)
    .eq("kind", "hotel");
  if (itemsError) {
    console.error("Cartes illisibles.");
    process.exit(1);
  }
  const hotels = (items || []).filter((row) => row.lifecycle !== "cancelled" && row.lifecycle !== "superseded");
  if (!hotels.length) {
    console.error("Aucune carte hôtel sur ce séjour.");
    process.exit(1);
  }
  const hidden = hotels.filter((row) => row.visible_to_client === false);
  if (!hidden.length && booking.visible_to_client && booking.prices_visible !== false) {
    console.log(`${reference} : la carte hôtel est déjà visible.`);
    return;
  }
  if (hidden.length) {
    const { error: showError } = await admin
      .from("crm_booking_items")
      .update({ visible_to_client: true })
      .in(
        "id",
        hidden.map((row) => row.id)
      );
    if (showError) {
      console.error("La carte n’a pas pu être montrée.");
      process.exit(1);
    }
  }
  if (!booking.visible_to_client || booking.prices_visible === false) {
    const { error: bookingError } = await admin
      .from("crm_bookings")
      .update({ visible_to_client: true, prices_visible: true, status: "confirmed" })
      .eq("id", booking.id);
    if (bookingError) {
      console.error("Le séjour n’a pas pu être montré.");
      process.exit(1);
    }
  }
  console.log(`${reference} : ${hidden.length || 0} carte(s) hôtel montrée(s). Aucun message envoyé.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "Échec.");
  process.exit(1);
});
