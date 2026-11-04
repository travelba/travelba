import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { fetchRevolutTransactions, upsertRevolutInbox, type RevolutTx } from "@/lib/crm/revolut";
import {
  REVOLUT_FIRST_LOOKBACK_MS,
  REVOLUT_OVERLAP_MS,
  revolutStoredMatches,
  syncSinceIso,
  type RevolutStoredRow,
} from "@/lib/crm/sync-delta";
import { SYNC_WATERMARK, readSyncWatermark, writeSyncWatermark } from "@/lib/crm/sync-watermark";

const COLUMNS =
  "revolut_transaction_id, amount, currency, direction, counterparty_name, counterparty_iban, reference, booked_at, raw";

/**
 * Retire les mouvements déjà enregistrés tels quels.
 * La boucle d’écriture de upsertRevolutInbox n’est pas réécrite : elle ne reçoit que le delta.
 * En cas de lecture impossible, on garde la liste entière (aucun virement n’est perdu).
 */
export async function changedRevolutTransactions(txs: RevolutTx[]) {
  const ids = [...new Set(txs.map((tx) => tx.id).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return txs;
  const stored = new Map<string, RevolutStoredRow>();
  try {
    const admin = createServiceClient();
    for (let index = 0; index < ids.length; index += 100) {
      const slice = ids.slice(index, index + 100);
      const { data, error } = await admin.from("crm_revolut_transactions").select(COLUMNS).in("revolut_transaction_id", slice);
      if (error) return txs;
      for (const row of data || []) {
        const id = String((row as { revolut_transaction_id?: string }).revolut_transaction_id || "");
        if (id) stored.set(id, row as RevolutStoredRow);
      }
    }
  } catch {
    return txs;
  }
  return txs.filter((tx) => !revolutStoredMatches(tx.id ? stored.get(tx.id) || null : null, tx));
}

/** Depuis le curseur, avec deux jours de recouvrement. Sans curseur : la fenêtre demandée (14 ou 30 jours). */
export async function syncRevolutWindow(
  firstLookbackMs = REVOLUT_FIRST_LOOKBACK_MS,
  opts?: { stripeRefresh?: boolean }
) {
  const now = Date.now();
  const cursor = await readSyncWatermark(SYNC_WATERMARK.revolut);
  const from = syncSinceIso({
    cursor,
    now,
    overlapMs: REVOLUT_OVERLAP_MS,
    firstLookbackMs,
  });
  const txs = await fetchRevolutTransactions(from);
  const fresh = await changedRevolutTransactions(txs);
  const inserted = await upsertRevolutInbox(fresh, opts);
  await writeSyncWatermark(SYNC_WATERMARK.revolut, new Date(now).toISOString());
  return { fetched: txs.length, inserted, from, written: fresh.length };
}
