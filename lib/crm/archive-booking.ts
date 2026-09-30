import "server-only";

import { archiveBookingPatch, isBookingArchived, restoreBookingPatch } from "@/lib/crm/booking-lifecycle";
import { clearBookingCharges, syncBookingLedger } from "@/lib/crm/bookings";
import { isUuid } from "@/lib/crm/ids";
import type { CrmBooking } from "@/lib/crm/types";
import { createServiceClient } from "@/lib/supabase/admin";

export class BookingActionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function archiveBookingById(bookingId: string) {
  if (!isUuid(bookingId)) throw new BookingActionError("Identifiant invalide");
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new BookingActionError(error.message, 500);
  if (!data) throw new BookingActionError("Réservation introuvable", 404);
  const booking = data as CrmBooking;
  if (isBookingArchived(booking)) {
    return { ok: true as const, archived: true as const, reference: booking.reference };
  }
  const patch = archiveBookingPatch(booking, new Date().toISOString());
  const { data: updated, error: updateError } = await admin
    .from("crm_bookings")
    .update(patch)
    .eq("id", bookingId)
    .select("*")
    .single();
  if (updateError) throw new BookingActionError(updateError.message);
  try {
    await clearBookingCharges(admin, bookingId);
  } catch (err) {
    throw new BookingActionError(err instanceof Error ? err.message : "Écritures non retirées");
  }
  return {
    ok: true as const,
    archived: true as const,
    reference: (updated as CrmBooking).reference,
  };
}

export async function restoreBookingById(bookingId: string) {
  if (!isUuid(bookingId)) throw new BookingActionError("Identifiant invalide");
  const admin = createServiceClient();
  const { data, error } = await admin.from("crm_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (error) throw new BookingActionError(error.message, 500);
  if (!data) throw new BookingActionError("Réservation introuvable", 404);
  const booking = data as CrmBooking;
  if (!isBookingArchived(booking)) throw new BookingActionError("Ce dossier n’est pas archivé.");
  const patch = restoreBookingPatch(booking);
  const { data: updated, error: updateError } = await admin
    .from("crm_bookings")
    .update(patch)
    .eq("id", bookingId)
    .select("*")
    .single();
  if (updateError || !updated) throw new BookingActionError(updateError?.message || "Réactivation impossible");
  try {
    await syncBookingLedger(admin, updated as CrmBooking);
  } catch (err) {
    throw new BookingActionError(err instanceof Error ? err.message : "Écritures non rétablies");
  }
  return { ok: true as const, booking: updated as CrmBooking };
}
