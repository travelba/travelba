/**
 * Remet une seule dépense Pliant à proposer.
 * Portée : MISTAKEN_PLIANT_LINK (Phulay Bay, carte ····7171, dossier TB-2026-0098).
 * Idempotent. N’efface pas la dépense, ni la ligne du séjour, ni une autre transaction.
 *
 *   npx tsx scripts/unlink-pliant-spend.ts
 *   npx tsx scripts/unlink-pliant-spend.ts --dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MISTAKEN_PLIANT_LINK, planPliantUnlink, pliantUnlinkGuardOk } from "../lib/crm/pliant-link";

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

type Spend = {
  id: string;
  merchant: string | null;
  status: string | null;
  card_last4: string | null;
  billing_cents: number | null;
  match_status: string | null;
  link_released: boolean | null;
  booking_id: string | null;
};

type Cost = {
  id: string;
  booking_id: string;
  booking_item_id: string | null;
  amount_eur: number | string | null;
  reference: string | null;
};

function publicSpend(row: Spend, costs: Cost[]) {
  return {
    id: row.id,
    merchant: row.merchant,
    status: row.status,
    last4: row.card_last4,
    billing_cents: row.billing_cents,
    match_status: row.match_status,
    link_released: row.link_released === true,
    booking_id: row.booking_id,
    costs: costs.map((cost) => ({
      id: cost.id,
      reference: cost.reference,
      booking_id: cost.booking_id,
      item_id: cost.booking_item_id,
      amount_eur: cost.amount_eur,
    })),
  };
}

async function loadCosts(admin: SupabaseClient, spendId: string) {
  const { data, error } = await admin
    .from("crm_trip_costs")
    .select("id, booking_id, booking_item_id, amount_eur, source, source_id")
    .eq("source", "pliant")
    .eq("source_id", spendId);
  if (error) throw new Error(error.message);
  const rows = (data || []) as { id: string; booking_id: string; booking_item_id: string | null; amount_eur: number | string | null }[];
  if (!rows.length) return [] as Cost[];
  const { data: bookings, error: bookingError } = await admin
    .from("crm_bookings")
    .select("id, reference")
    .in("id", rows.map((row) => row.booking_id));
  if (bookingError) throw new Error(bookingError.message);
  const references = new Map(((bookings || []) as { id: string; reference: string | null }[]).map((row) => [row.id, row.reference]));
  return rows.map((row) => ({ ...row, reference: references.get(row.booking_id) || null }));
}

async function main() {
  loadLocalEnv();
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY manquent.");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const spendId = MISTAKEN_PLIANT_LINK.spendId;

  const { count: phulayBefore, error: countError } = await admin
    .from("crm_pliant_transactions")
    .select("id", { count: "exact", head: true })
    .ilike("merchant", "%phulay%");
  if (countError) throw new Error(countError.message);

  const { data: spendRow, error: spendError } = await admin
    .from("crm_pliant_transactions")
    .select("id, merchant, status, card_last4, billing_cents, match_status, link_released, booking_id")
    .eq("id", spendId)
    .maybeSingle();
  if (spendError) throw new Error(spendError.message);
  const spend = spendRow as Spend | null;
  if (!spend) {
    console.error("Dépense introuvable.");
    process.exit(1);
  }
  if (!pliantUnlinkGuardOk({
    merchant: spend.merchant,
    last4: spend.card_last4,
    billingCents: spend.billing_cents,
    status: spend.status,
  })) {
    console.error("Garde refusée : cette ligne n’est pas la dépense Phulay comptabilisée sur ····7171.");
    process.exit(2);
  }

  const costs = await loadCosts(admin, spendId);
  const plan = planPliantUnlink(
    {
      spendId: spend.id,
      matchStatus: spend.match_status,
      bookingId: spend.booking_id,
      costs: costs.flatMap((cost) => (cost.reference ? [{ id: cost.id, reference: cost.reference }] : [])),
    },
    MISTAKEN_PLIANT_LINK
  );
  const before = publicSpend(spend, costs);
  console.log(JSON.stringify({ step: "before", dryRun, phulayCount: phulayBefore, plan, spend: before }));

  if (!plan.changed) {
    console.log(JSON.stringify({ step: "after", changed: false, reason: plan.reason, spend: before }));
    return;
  }
  if (dryRun) {
    console.log(JSON.stringify({ step: "after", changed: false, reason: "dry-run", plan }));
    return;
  }

  const bookingId = costs.find((cost) => cost.reference === MISTAKEN_PLIANT_LINK.bookingReference)?.booking_id || null;
  if (plan.dropCostIds.length) {
    if (!bookingId) throw new Error("Dossier cible introuvable.");
    const { error, count } = await admin
      .from("crm_trip_costs")
      .delete({ count: "exact" })
      .in("id", plan.dropCostIds)
      .eq("source", "pliant")
      .eq("source_id", spendId)
      .eq("booking_id", bookingId);
    if (error) throw new Error(error.message);
    if ((count || 0) !== plan.dropCostIds.length) {
      throw new Error(`Suppression inattendue : ${count} ligne(s).`);
    }
  }

  const left = await loadCosts(admin, spendId);
  if (left.some((cost) => cost.reference === MISTAKEN_PLIANT_LINK.bookingReference)) {
    throw new Error("Le coût est encore sur le dossier.");
  }
  if (left.length) throw new Error("Un autre coût est apparu : arrêt.");

  const { error: updateError } = await admin
    .from("crm_pliant_transactions")
    .update({
      match_status: "unmatched",
      matched_customer_id: null,
      matched_transaction_id: null,
      booking_id: null,
      link_released: true,
    })
    .eq("id", spendId);
  if (updateError) throw new Error(updateError.message);

  const fromCost = costs.find((cost) => plan.dropCostIds.includes(cost.id)) || null;
  const { data: existingEvent, error: eventReadError } = await admin
    .from("crm_trip_cost_events")
    .select("id")
    .eq("source", "pliant")
    .eq("source_id", spendId)
    .eq("action", "correction")
    .limit(1);
  if (eventReadError) throw new Error(eventReadError.message);
  if (!existingEvent?.length) {
    const { error: eventError } = await admin.from("crm_trip_cost_events").insert({
      actor: "Correction",
      action: "correction",
      source: "pliant",
      source_id: spendId,
      from_booking_id: fromCost?.booking_id || null,
      from_item_id: fromCost?.booking_item_id || null,
      from_reference: MISTAKEN_PLIANT_LINK.bookingReference,
      note: "Coût retiré. La dépense revient à proposer.",
    });
    if (eventError) throw new Error(eventError.message);
  }

  const { data: afterRow, error: afterError } = await admin
    .from("crm_pliant_transactions")
    .select("id, merchant, status, card_last4, billing_cents, match_status, link_released, booking_id")
    .eq("id", spendId)
    .maybeSingle();
  if (afterError) throw new Error(afterError.message);
  const afterSpend = afterRow as Spend;
  const afterCosts = await loadCosts(admin, spendId);
  const { count: phulayAfter, error: afterCountError } = await admin
    .from("crm_pliant_transactions")
    .select("id", { count: "exact", head: true })
    .ilike("merchant", "%phulay%");
  if (afterCountError) throw new Error(afterCountError.message);

  const after = publicSpend(afterSpend, afterCosts);
  if (after.match_status !== "unmatched" || after.costs.length || after.link_released !== true) {
    throw new Error("L’état final n’est pas à proposer.");
  }
  if (phulayAfter !== phulayBefore) throw new Error("Le nombre de dépenses Phulay a changé.");
  console.log(JSON.stringify({ step: "after", changed: true, phulayCount: phulayAfter, spend: after }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Échec.");
  process.exit(1);
});
