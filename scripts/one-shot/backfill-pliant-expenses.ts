/**
 * Rattrapage : les dépenses Pliant déjà rattachées à un dossier **sur le montant du séjour**
 * (coût sans ligne, `booking_item_id` vide) reçoivent leur ligne Dépense, comme le fait
 * désormais chaque nouveau rattachement. Une ligne par transaction Pliant ; un second passage n’écrit rien.
 *
 * Ne touche pas : les coûts posés par l’agence sur une carte existante (hôtel, vol…), les remboursements,
 * les dossiers annulés ou archivés, ni la transaction Pliant elle-même.
 *
 * Chaque ligne créée est un débit client dès que le séjour est Visible : par défaut le script simule.
 *
 *   npx tsx scripts/one-shot/backfill-pliant-expenses.ts            # simulation
 *   APPLY=1 npx tsx scripts/one-shot/backfill-pliant-expenses.ts    # écrit
 *   REFERENCE=TB-2026-0042 … pour un seul dossier
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { refreshBookingLedger } from "../../lib/crm/bookings";
import { findPliantExpenseItem, pliantExpenseDraft } from "../../lib/crm/pliant-expense";

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

type CostRow = {
  id: string;
  booking_id: string;
  source_id: string;
  amount_eur: number | string;
  supplier: string | null;
  occurred_on: string | null;
};

type ItemRow = {
  id: string;
  booking_id: string;
  kind: string | null;
  lifecycle: string | null;
  details: unknown;
  sort_order: number | null;
};

async function main() {
  loadEnv();
  const apply = process.env.APPLY === "1";
  const onlyReference = (process.env.REFERENCE || "").trim();
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: costRows, error: costError } = await admin
    .from("crm_trip_costs")
    .select("id, booking_id, source_id, amount_eur, supplier, occurred_on")
    .eq("source", "pliant")
    .is("booking_item_id", null);
  if (costError) throw new Error(costError.message);
  const costs = (costRows || []) as CostRow[];
  if (!costs.length) {
    console.log("Aucun coût Pliant sans ligne : rien à faire.");
    return;
  }

  const bookingIds = [...new Set(costs.map((row) => row.booking_id))];
  const { data: bookingRows, error: bookingError } = await admin
    .from("crm_bookings")
    .select("id, reference, status, archived_at, visible_to_client")
    .in("id", bookingIds);
  if (bookingError) throw new Error(bookingError.message);
  const bookings = new Map(
    ((bookingRows || []) as { id: string; reference: string; status: string | null; archived_at: string | null; visible_to_client: boolean | null }[]).map(
      (row) => [row.id, row]
    )
  );
  const { data: itemRows, error: itemError } = await admin
    .from("crm_booking_items")
    .select("id, booking_id, kind, lifecycle, details, sort_order")
    .in("booking_id", bookingIds);
  if (itemError) throw new Error(itemError.message);
  const itemsByBooking = new Map<string, ItemRow[]>();
  for (const item of (itemRows || []) as ItemRow[]) {
    const list = itemsByBooking.get(item.booking_id) || [];
    list.push(item);
    itemsByBooking.set(item.booking_id, list);
  }

  let created = 0;
  let linked = 0;
  let skipped = 0;
  const touched = new Set<string>();
  for (const cost of costs) {
    const booking = bookings.get(cost.booking_id);
    if (!booking || (onlyReference && booking.reference !== onlyReference)) {
      skipped += 1;
      continue;
    }
    if (booking.status === "cancelled" || booking.archived_at) {
      console.log(`${booking.reference} · dossier annulé ou archivé : ignoré`);
      skipped += 1;
      continue;
    }
    const draft = pliantExpenseDraft({
      sourceId: cost.source_id,
      amountEur: Number(cost.amount_eur),
      supplier: cost.supplier,
      occurredOn: cost.occurred_on,
    });
    if (!draft) {
      console.log(`${booking.reference} · remboursement ou montant nul : ignoré`);
      skipped += 1;
      continue;
    }
    const items = itemsByBooking.get(cost.booking_id) || [];
    const existing = findPliantExpenseItem(items, cost.source_id);
    const visibility = booking.visible_to_client ? "séjour Visible, débit client" : "séjour caché, pas de débit";
    if (existing) {
      console.log(`${booking.reference} · ${draft.title} · ${draft.amount} € · ligne déjà là, on la relie`);
      linked += 1;
      if (apply) {
        const { error } = await admin.from("crm_trip_costs").update({ booking_item_id: existing.id }).eq("id", cost.id);
        if (error) throw new Error(error.message);
      }
      continue;
    }
    console.log(`${booking.reference} · ${draft.title} · ${draft.amount} € · ${draft.start_at || "sans date"} · ${visibility}`);
    created += 1;
    if (!apply) continue;
    const maxSort = items.reduce((max, row) => Math.max(max, Number(row.sort_order || 0)), -1);
    const { data: inserted, error: insertError } = await admin
      .from("crm_booking_items")
      .insert({
        booking_id: cost.booking_id,
        kind: "expense",
        title: draft.title,
        amount: draft.amount,
        start_at: draft.start_at,
        include_in_ledger: true,
        sort_order: maxSort + 1,
        details: draft.details,
        visible_to_client: false,
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error(insertError?.message || "Dépense non créée");
    items.push({ id: String(inserted.id), booking_id: cost.booking_id, kind: "expense", lifecycle: "active", details: draft.details, sort_order: maxSort + 1 });
    const { error: linkError } = await admin.from("crm_trip_costs").update({ booking_item_id: inserted.id }).eq("id", cost.id);
    if (linkError) throw new Error(linkError.message);
    touched.add(cost.booking_id);
  }
  if (apply) {
    for (const bookingId of touched) await refreshBookingLedger(admin, bookingId);
  }
  console.log(
    `${apply ? "Écrit" : "Simulation"} : ${created} ligne(s) à créer, ${linked} coût(s) à relier à une ligne existante, ${skipped} ignoré(s).${
      apply ? "" : " APPLY=1 pour écrire."
    }`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
