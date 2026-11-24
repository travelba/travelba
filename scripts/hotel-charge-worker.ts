/**
 * Paiement d’un lien hôtel. Une machine avec Chrome, pas une fonction Vercel.
 *   HOTEL_CHARGE_WORKER=1 npx tsx scripts/hotel-charge-worker.ts
 * Sans ce drapeau, le script ne lit aucune carte et n’ouvre aucune page.
 */

import { chargeResultHasPan, chargeWorkerAllowed } from "../lib/crm/hotel-auto";
import { chargeWithLocalChrome } from "../lib/crm/hotel-charge-browser";
import { uploadCrmFile } from "../lib/crm/files";
import { readPliantCardSecrets } from "../lib/crm/pliant";
import { createServiceClient } from "../lib/supabase/admin";

async function main() {
  if (!chargeWorkerAllowed(process.env.HOTEL_CHARGE_WORKER)) {
    console.log("Paiement hôtel inactif. Il tourne sur une machine avec Chrome, HOTEL_CHARGE_WORKER=1.");
    return;
  }
  const admin = createServiceClient();
  const { data } = await admin
    .from("crm_hotel_charge_jobs")
    .select("id, booking_id, payment_url, amount_cents, card_limit_cents, pliant_card_id, attempts, status")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const job = data as {
    id: string;
    booking_id: string | null;
    payment_url: string;
    amount_cents: number;
    card_limit_cents: number | null;
    pliant_card_id: string | null;
    attempts: number;
  } | null;
  if (!job?.pliant_card_id || job.card_limit_cents == null) return;
  const claimed = await admin
    .from("crm_hotel_charge_jobs")
    .update({ status: "running", claimed_at: new Date().toISOString(), attempts: (job.attempts || 0) + 1 })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id");
  if (!claimed.data?.length) return;
  const secrets = await readPliantCardSecrets(job.pliant_card_id);
  const result = await chargeWithLocalChrome({
    url: job.payment_url,
    secrets,
    stayCents: job.amount_cents,
    ceilingCents: job.card_limit_cents,
  });
  if (chargeResultHasPan(result, secrets.pan)) {
    await admin
      .from("crm_hotel_charge_jobs")
      .update({ status: "needs_agent", reason: "Preuve refusée.", screenshot_path: null })
      .eq("id", job.id);
    return;
  }
  let screenshotPath: string | null = null;
  if (result.screenshot && job.booking_id) {
    screenshotPath = await uploadCrmFile(
      `bookings/${job.booking_id}/hotel-charge/${job.id}.jpg`,
      Buffer.from(result.screenshot),
      "image/jpeg",
      { upsert: true }
    ).catch(() => null);
  }
  await admin
    .from("crm_hotel_charge_jobs")
    .update({
      status: result.status,
      reason: result.note,
      screenshot_path: screenshotPath,
    })
    .eq("id", job.id);
  if (result.status === "needs_agent") {
    await admin.from("crm_agency_alerts").insert({
      kind: "hotel_booking",
      summary: `Paiement hôtel à la main. ${result.note}`.slice(0, 240),
      staff_id: null,
      entity_type: "dossier",
      entity_id: job.booking_id,
    });
  }
}

main().catch((error) => {
  const text = error instanceof Error ? error.message : "échec";
  console.error("[hotel-charge]", text.replace(/(?:\d[ -]?){13,19}/g, "••••").slice(0, 120));
  process.exitCode = 1;
});
