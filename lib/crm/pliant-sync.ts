import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { autoMatchUnmatchedPliant } from "./pliant-match";
import { fetchPliantTransactions, pliantConfigured } from "./pliant";
import { mapPliantTransaction, type PliantTransactionRow } from "./pliant-tx";

export async function syncPliantAccount() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const fetched = await fetchPliantTransactions();
  const admin = createServiceClient();
  const updatedAt = new Date().toISOString();
  const rows = fetched.flatMap((payload) => {
    const row = mapPliantTransaction(payload);
    return row ? [persistRow(row, updatedAt)] : [];
  });
  const chunk = 100;
  for (let index = 0; index < rows.length; index += chunk) {
    const { error } = await admin.from("crm_pliant_transactions").upsert(rows.slice(index, index + chunk), {
      onConflict: "pliant_transaction_id",
    });
    if (error) throw new Error("Les transactions Pliant n’ont pas pu être enregistrées.");
  }
  let auto_matched = 0;
  try {
    auto_matched = (await autoMatchUnmatchedPliant()).matched;
  } catch (err) {
    console.error("[pliant] match", err instanceof Error ? err.message : "échec");
  }
  return { fetched: fetched.length, stored: rows.length, auto_matched };
}

/** Un passage API sans libellé ne doit pas effacer une carte déjà connue. */
function persistRow(row: PliantTransactionRow, updatedAt: string) {
  const next: Record<string, unknown> = { ...row, updated_at: updatedAt };
  if (!row.card_label) delete next.card_label;
  if (!row.card_last4) delete next.card_last4;
  if (!row.holder_name) delete next.holder_name;
  return next;
}
