import { createServiceClient } from "@/lib/supabase/admin";
import { clearBookingCharges } from "@/lib/crm/bookings";
import { listCrmFiles, removeCrmFiles } from "@/lib/crm/files";
import { exclusiveStoragePaths, isUuid } from "@/lib/crm/ids";

export class BookingDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function deleteBookingById(bookingId: string) {
  if (!isUuid(bookingId)) throw new BookingDeleteError("Identifiant invalide");
  const admin = createServiceClient();

  const { data: booking, error: loadError } = await admin
    .from("crm_bookings")
    .select("id, reference, title, cover_image_path")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadError) throw new BookingDeleteError(loadError.message, 500);
  if (!booking) throw new BookingDeleteError("Réservation introuvable", 404);

  const paths: string[] = [];
  if (booking.cover_image_path) paths.push(booking.cover_image_path);

  const { data: docs } = await admin
    .from("crm_booking_documents")
    .select("storage_path")
    .eq("booking_id", bookingId);
  for (const row of docs || []) {
    if (row.storage_path) paths.push(row.storage_path);
  }

  const { data: tripDocs } = await admin
    .from("crm_travel_documents")
    .select("storage_path")
    .eq("booking_id", bookingId);
  const tripPaths = (tripDocs || [])
    .map((row) => row.storage_path as string | null)
    .filter((path): path is string => Boolean(path));

  paths.push(...(await listCrmFiles(`bookings/${bookingId}`)));

  try {
    await clearBookingCharges(admin, bookingId);
  } catch (err) {
    throw new BookingDeleteError(err instanceof Error ? err.message : "Écritures non retirées");
  }

  const { error: delError } = await admin.from("crm_bookings").delete().eq("id", bookingId);
  if (delError) throw new BookingDeleteError(delError.message);

  let tripExclusive: string[] = [];
  if (tripPaths.length) {
    const { data: remaining } = await admin
      .from("crm_travel_documents")
      .select("storage_path")
      .in("storage_path", tripPaths);
    const stillUsed = (remaining || [])
      .map((row) => row.storage_path as string | null)
      .filter((path): path is string => Boolean(path));
    tripExclusive = exclusiveStoragePaths(tripPaths, stillUsed);
  }

  await removeCrmFiles([...paths, ...tripExclusive]);

  return { ok: true as const, reference: booking.reference as string };
}
