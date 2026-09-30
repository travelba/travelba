import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { fetchPliantTransactions, pliantConfigured } from "./pliant";
import { mapPliantTransaction } from "./pliant-tx";

export async function syncPliantAccount() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const fetched = await fetchPliantTransactions();
  const admin = createServiceClient();
  let stored = 0;
  for (const payload of fetched) {
    const row = mapPliantTransaction(payload);
    if (!row) continue;
    const { error } = await admin.from("crm_pliant_transactions").upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: "pliant_transaction_id" }
    );
    if (error) throw new Error("Les transactions Pliant n’ont pas pu être enregistrées.");
    stored += 1;
  }
  return { fetched: fetched.length, stored };
}
