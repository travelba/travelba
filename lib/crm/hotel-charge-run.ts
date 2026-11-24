/**
 * Un paiement hôtel à la fois, sur Vercel ou en local.
 * Le numéro de carte n’est pas écrit. 3DS, montant ou devise : arrêt.
 * Le reste reprend tout seul.
 */

import { listOpenChargeDebits, reconcileHotelCharges } from "./hotel-auto-run";
import {
  chargeResultHasPan,
  chargeWorkerAllowed,
  isBufferCeiling,
  matchHotelChargeDebit,
  nextChargeStep,
  staleChargeClaim,
  type ChargeSessionResult,
  type PliantChargeDebit,
} from "./hotel-auto";
import { chargeStayInBrowser } from "./hotel-charge-browser";
import { uploadCrmFile } from "./files";
import { lockPliantCard, readPliantCardSecrets, setPliantCardLimit } from "./pliant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

type Job = {
  id: string;
  booking_id: string | null;
  arrival_id: string | null;
  payment_url: string;
  amount_cents: number;
  card_limit_cents: number | null;
  pliant_card_id: string | null;
  attempts: number;
  status: string;
  claimed_at: string | null;
};

export async function runDueHotelCharge(
  admin: Admin,
  deps: {
    now?: Date;
    workerEnabled?: boolean;
    charge?: (input: { url: string; secrets: { pan: string; expiry: string; cvc: string }; stayCents: number; ceilingCents: number }) => Promise<ChargeSessionResult>;
    readCard?: (cardId: string) => Promise<{ pan: string; expiry: string; cvc: string }>;
    setLimit?: (cardId: string, cents: number) => Promise<void>;
    lock?: (cardId: string) => Promise<void>;
    debits?: (cardIds: string[]) => Promise<PliantChargeDebit[]>;
    storeProof?: (bookingId: string, jobId: string, bytes: Uint8Array) => Promise<string | null>;
  } = {}
) {
  if (deps.workerEnabled !== true && !chargeWorkerAllowed(process.env.HOTEL_CHARGE_WORKER)) {
    return { skipped: true as const, reason: "worker" };
  }
  const now = deps.now || new Date();
  await releaseStaleClaims(admin, now);
  const job = await nextJob(admin, now);
  if (!job) return { skipped: true as const, reason: "vide" };
  const claimed = await admin
    .from("crm_hotel_charge_jobs")
    .update({ status: "running", claimed_at: now.toISOString(), attempts: (job.attempts || 0) + 1 })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id");
  const rows = claimed.data as { id: string }[] | null;
  if (!Array.isArray(rows) || rows.length === 0) return { skipped: true as const, reason: "verrou" };
  const attempts = (job.attempts || 0) + 1;
  const debits = deps.debits || ((ids) => listOpenChargeDebits(admin as never, ids));
  if (job.pliant_card_id) {
    const seen = await debits([job.pliant_card_id]);
    const match = matchHotelChargeDebit(
      { pliantCardId: job.pliant_card_id, amountCents: job.amount_cents, status: "submitted" },
      seen
    );
    if (match === "paid") {
      await reconcileHotelCharges(admin, seen, deps.lock || lockPliantCard);
      return { skipped: false as const, status: "paid" as const, id: job.id };
    }
  }
  let ceiling = job.card_limit_cents;
  if (job.pliant_card_id && ceiling != null && isBufferCeiling(job.amount_cents, ceiling)) {
    const setLimit = deps.setLimit || ((cardId: string, cents: number) => setPliantCardLimit(cardId, { value: cents, currency: "EUR" }, null));
    await setLimit(job.pliant_card_id, job.amount_cents);
    ceiling = job.amount_cents;
    await admin.from("crm_hotel_charge_jobs").update({ card_limit_cents: ceiling }).eq("id", job.id);
    if (job.arrival_id) {
      await admin.from("crm_hotel_arrivals").update({ card_limit_cents: ceiling }).eq("id", job.arrival_id);
    }
  }
  if (!job.pliant_card_id || ceiling == null) {
    return finish(admin, job, attempts, now, { status: "needs_agent", reason: "carte", note: "La carte d’arrivée n’est pas prête.", screenshot: null });
  }
  const readCard = deps.readCard || readPliantCardSecrets;
  const secrets = await readCard(job.pliant_card_id);
  const charge = deps.charge || chargeStayInBrowser;
  let result: ChargeSessionResult;
  try {
    result = await charge({
      url: job.payment_url,
      secrets,
      stayCents: job.amount_cents,
      ceilingCents: ceiling,
    });
  } catch {
    result = { status: "needs_agent", reason: "erreur", note: "Le navigateur n’a pas ouvert la page.", screenshot: null };
  }
  if (chargeResultHasPan(result, secrets.pan)) {
    result = { status: "needs_agent", reason: "erreur", note: "Preuve refusée.", screenshot: null };
  }
  return finish(admin, job, attempts, now, result, deps.storeProof);
}

async function finish(
  admin: Admin,
  job: Job,
  attempts: number,
  now: Date,
  result: ChargeSessionResult,
  storeProof?: (bookingId: string, jobId: string, bytes: Uint8Array) => Promise<string | null>
) {
  const step = nextChargeStep({
    submitted: result.status === "submitted",
    reason: result.reason,
    attempts,
    nowMs: now.getTime(),
  });
  let screenshotPath: string | null = null;
  if (result.screenshot && job.booking_id && step.status === "submitted") {
    const store =
      storeProof ||
      (async (bookingId: string, jobId: string, bytes: Uint8Array) =>
        uploadCrmFile(`bookings/${bookingId}/hotel-charge/${jobId}.jpg`, Buffer.from(bytes), "image/jpeg", { upsert: true }).catch(
          () => null
        ));
    screenshotPath = await store(job.booking_id, job.id, result.screenshot);
  }
  await admin
    .from("crm_hotel_charge_jobs")
    .update({
      status: step.status,
      reason: result.note,
      attempts,
      screenshot_path: screenshotPath,
      next_attempt_at: step.nextAttemptMs ? new Date(step.nextAttemptMs).toISOString() : null,
      alerted_at: step.alert ? now.toISOString() : null,
    })
    .eq("id", job.id);
  if (step.status === "submitted" && job.arrival_id) {
    await admin.from("crm_hotel_arrivals").update({ status: "paying", task_note: result.note, task_open: false }).eq("id", job.arrival_id);
  }
  if (step.status === "needs_agent" && job.arrival_id) {
    await admin
      .from("crm_hotel_arrivals")
      .update({ status: "blocked", blocked_reason: "payment", task_open: true, task_note: result.note })
      .eq("id", job.arrival_id);
  }
  if (step.alert) {
    await admin.from("crm_agency_alerts").insert({
      kind: "hotel_booking",
      summary: (step.status === "needs_agent"
        ? `Paiement hôtel à la main. ${result.note}`
        : `Paiement hôtel repris après plusieurs essais. ${result.note}`
      ).slice(0, 240),
      staff_id: null,
      entity_type: "dossier",
      entity_id: job.booking_id,
    });
  }
  await admin.from("crm_agency_journal").insert({
    staff_id: null,
    action: "update",
    entity_type: "dossier",
    entity_id: job.booking_id,
    summary: `Paiement hôtel · ${step.status}`.slice(0, 240),
    canonical: `hotel-charge|${job.id}|${attempts}|${step.status}`,
    row_hash: "pending",
  });
  return { skipped: false as const, status: step.status, id: job.id };
}

async function releaseStaleClaims(admin: Admin, now: Date) {
  const { data } = await admin.from("crm_hotel_charge_jobs").select("id, claimed_at, status").eq("status", "running").limit(5);
  for (const row of (data || []) as { id: string; claimed_at: string | null }[]) {
    if (!staleChargeClaim(row.claimed_at, now.getTime())) continue;
    await admin
      .from("crm_hotel_charge_jobs")
      .update({ status: "queued", next_attempt_at: now.toISOString(), reason: "Reprise après un passage interrompu." })
      .eq("id", row.id)
      .eq("status", "running");
  }
}

async function nextJob(admin: Admin, now: Date): Promise<Job | null> {
  const { data, error } = await admin
    .from("crm_hotel_charge_jobs")
    .select("id, booking_id, arrival_id, payment_url, amount_cents, card_limit_cents, pliant_card_id, attempts, status, claimed_at, next_attempt_at")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(8);
  if (error || !data) return null;
  const due = (data as (Job & { next_attempt_at?: string | null })[]).find((row) => {
    if (!row.next_attempt_at) return true;
    const at = Date.parse(row.next_attempt_at);
    return !Number.isFinite(at) || at <= now.getTime();
  });
  return due || null;
}
