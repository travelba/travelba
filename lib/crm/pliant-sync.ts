import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { linkDossierPliantSpends } from "./pliant-dossier-run";
import { fetchPliantTransactions, pliantConfigured } from "./pliant";
import { mapPliantTransaction, type PliantTransactionRow } from "./pliant-tx";
import { PLIANT_OVERLAP_MS, pliantStoredMatches, syncSinceIso } from "./sync-delta";
import { SYNC_WATERMARK, readSyncWatermark, writeSyncWatermark } from "./sync-watermark";

const STORED_COLUMNS =
  "pliant_transaction_id, card_id, status, type, merchant, billing_cents, billing_currency, transaction_cents, transaction_currency, booked_at, card_label, card_last4, holder_name, category, comment";

export async function syncPliantAccount() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const now = Date.now();
  const cursor = await readSyncWatermark(SYNC_WATERMARK.pliant);
  const sinceMs = cursor
    ? Date.parse(syncSinceIso({ cursor, now, overlapMs: PLIANT_OVERLAP_MS, firstLookbackMs: 0 }))
    : null;
  const fetched = await fetchPliantTransactions({ sinceMs });
  const admin = createServiceClient();
  const updatedAt = new Date(now).toISOString();
  const rows = fetched.flatMap((payload) => {
    const row = mapPliantTransaction(payload);
    return row ? [persistRow(row, updatedAt)] : [];
  });
  const changed = await pliantRowsToWrite(admin, rows);
  const chunk = 100;
  for (let index = 0; index < changed.length; index += chunk) {
    const { error } = await admin.from("crm_pliant_transactions").upsert(changed.slice(index, index + chunk), {
      onConflict: "pliant_transaction_id",
    });
    if (error) throw new Error("Les transactions Pliant n’ont pas pu être enregistrées.");
  }
  await writeSyncWatermark(SYNC_WATERMARK.pliant, updatedAt);
  // Une carte émise depuis un dossier rattache sa dépense dès l’autorisation. Le client n’est pas débité.
  let linked = 0;
  try {
    linked = await linkDossierPliantSpends(admin);
  } catch (err) {
    console.error("[pliant] lien dossier", err instanceof Error ? err.message : "échec");
  }
  return { fetched: fetched.length, stored: changed.length, auto_matched: linked };
}

async function pliantRowsToWrite(
  admin: ReturnType<typeof createServiceClient>,
  rows: Record<string, unknown>[]
) {
  const stored = new Map<string, Record<string, unknown>>();
  const ids = rows.map((row) => String(row.pliant_transaction_id || "")).filter(Boolean);
  try {
    for (let index = 0; index < ids.length; index += 100) {
      const slice = ids.slice(index, index + 100);
      const { data, error } = await admin.from("crm_pliant_transactions").select(STORED_COLUMNS).in("pliant_transaction_id", slice);
      if (error) return rows;
      for (const row of data || []) {
        const id = String((row as { pliant_transaction_id?: string }).pliant_transaction_id || "");
        if (id) stored.set(id, row as Record<string, unknown>);
      }
    }
  } catch {
    return rows;
  }
  return rows.filter((row) => !pliantStoredMatches(stored.get(String(row.pliant_transaction_id || "")) || null, row));
}

/** Un passage API sans libellé ne doit pas effacer une carte déjà connue. */
function persistRow(row: PliantTransactionRow, updatedAt: string) {
  const next: Record<string, unknown> = { ...row, updated_at: updatedAt };
  if (!row.card_label) delete next.card_label;
  if (!row.card_last4) delete next.card_last4;
  if (!row.holder_name) delete next.holder_name;
  return next;
}
