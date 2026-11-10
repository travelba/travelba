import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planEmailSteps, type EmailStepPreview, type StepCard } from "@/lib/crm/email-step-plan";
import { applyReplacementToBooking } from "@/lib/crm/ingest-booking";
import { isCancellationExtract, type BookingExtract } from "@/lib/crm/ingest-types";

export class EmailStepError extends Error {}

export async function previewBookingSteps(
  admin: SupabaseClient,
  bookingId: string,
  extract: BookingExtract | null | undefined
): Promise<EmailStepPreview> {
  if (!extract) throw new EmailStepError("Ce mail n’a pas d’étapes à lire.");
  if (isCancellationExtract(extract)) throw new EmailStepError("Une annulation ne met pas les étapes à jour.");
  const { data, error } = await admin
    .from("crm_booking_items")
    .select("id, kind, title, supplier, confirmation_ref, start_at, end_at, amount, lifecycle, details")
    .eq("booking_id", bookingId);
  if (error) throw new EmailStepError("Étapes du dossier illisibles.");
  return planEmailSteps((data || []) as StepCard[], extract);
}

/** Écrit les étapes après l’aperçu. Le prix de vente déjà saisi reste. Les pièces ne sont pas déposées ici. */
export async function applyBookingSteps(opts: {
  admin: SupabaseClient;
  bookingId: string;
  customerId: string;
  extract: BookingExtract;
  staffUserId?: string | null;
  emailIngestId?: string;
  visibleToClient: boolean;
}) {
  const preview = await previewBookingSteps(opts.admin, opts.bookingId, opts.extract);
  await applyReplacementToBooking({
    bookingId: opts.bookingId,
    customerId: opts.customerId,
    extract: opts.extract,
    staffUserId: opts.staffUserId || undefined,
    visibleToClient: opts.visibleToClient,
    emailIngestId: opts.emailIngestId,
  });
  return preview;
}
