/**
 * Même passage que le cron Vercel `/api/cron/hotel-charge`.
 *   HOTEL_CHARGE_WORKER=1 npx tsx scripts/hotel-charge-worker.ts
 * Sans ce drapeau, aucune carte n’est lue et aucune page n’est ouverte.
 */

import { chargeWorkerAllowed } from "../lib/crm/hotel-auto";
import { runDueHotelCharge } from "../lib/crm/hotel-charge-run";
import { createServiceClient } from "../lib/supabase/admin";

async function main() {
  if (!chargeWorkerAllowed(process.env.HOTEL_CHARGE_WORKER)) {
    console.log("Paiement hôtel inactif. HOTEL_CHARGE_WORKER=1 sur Vercel ou en local.");
    return;
  }
  const result = await runDueHotelCharge(createServiceClient(), { workerEnabled: true });
  console.log(JSON.stringify({ skipped: result.skipped, status: "status" in result ? result.status : null }));
}

main().catch((error) => {
  const text = error instanceof Error ? error.message : "échec";
  console.error("[hotel-charge]", text.replace(/(?:\d[ -]?){13,19}/g, "••••").slice(0, 120));
  process.exitCode = 1;
});
