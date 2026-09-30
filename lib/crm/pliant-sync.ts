import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { fetchPliantTransactions, pliantConfigured } from "./pliant";
import { mapPliantTransaction } from "./pliant-tx";

export async function syncPliantAccount() {
  if (!pliantConfigured()) throw new Error("Pliant n’est pas branché.");
  const fetched = await fetchPliantTransactions();
  const admin = createServiceClient();
  const updatedAt = new Date().toISOString();
  const rows = fetched.flatMap((payload) => {
    const row = mapPliantTransaction(payload);
    return row ? [{ ...row, updated_at: updatedAt }] : [];
  });
  const chunk = 100;
  for (let index = 0; index < rows.length; index += chunk) {
    const { error } = await admin.from("crm_pliant_transactions").upsert(rows.slice(index, index + chunk), {
      onConflict: "pliant_transaction_id",
    });
    if (error) throw new Error("Les transactions Pliant n’ont pas pu être enregistrées.");
  }
  return { fetched: fetched.length, stored: rows.length };
}
