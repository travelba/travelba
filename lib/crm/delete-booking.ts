import { createServiceClient } from "@/lib/supabase/admin";
import { clearBookingCharges } from "@/lib/crm/bookings";
import { listCrmFiles, removeCrmFiles } from "@/lib/crm/files";
import { bookingFilePrefixes, exclusiveStoragePaths, isUuid } from "@/lib/crm/ids";
import { pliantIdFromStayState } from "@/lib/crm/le-stay-card";

export class BookingDeleteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const PLIANT_NOT_FROZEN =
  "La carte Pliant n’est pas gelée. Gelez-la avant de supprimer le dossier.";

type CardStatus = { pliant_card_id: string | null; status: string | null };

/**
 * Une carte liée au dossier, au registre ou au séjour « payé par l’agence ».
 * Gelée seulement si chaque source qui la connaît est gelée ou supprimée.
 * Un séjour encore « issued » ne compte pas si la carte du dossier est déjà gelée.
 */
export function linkedPliantCards(input: {
  bookingCards: CardStatus[];
  registry: CardStatus[];
  stays: { state: unknown }[];
}): { id: string; frozen: boolean }[] {
  const flags = new Map<string, { dossier?: string; registry?: string; stay?: boolean }>();
  const touch = (id: string | null | undefined) => {
    const clean = (id || "").trim();
    if (!clean) return null;
    const current = flags.get(clean) || {};
    flags.set(clean, current);
    return current;
  };
  for (const card of input.bookingCards) {
    const row = touch(card.pliant_card_id);
    if (row) row.dossier = (card.status || "active").toLowerCase();
  }
  for (const card of input.registry) {
    const row = touch(card.pliant_card_id);
    if (row) row.registry = (card.status || "active").toLowerCase();
  }
  for (const stay of input.stays) {
    const row = touch(pliantIdFromStayState(stay.state));
    if (!row) continue;
    const pliant = stay.state && typeof stay.state === "object" ? (stay.state as { pliant?: unknown }).pliant : null;
    if (row.stay !== false) row.stay = pliant === "locked";
  }
  return [...flags.entries()].map(([id, row]) => {
    const dossierOpen = row.dossier != null && row.dossier !== "locked" && row.dossier !== "terminated";
    const registryOpen = row.registry != null && row.registry !== "locked";
    const onlyStay = row.dossier == null && row.registry == null;
    const frozen = !dossierOpen && !registryOpen && (onlyStay ? row.stay === true : true);
    return { id, frozen };
  });
}

export async function deleteMistakenBooking(bookingId: string, admin = createServiceClient()) {
  if (!isUuid(bookingId)) throw new BookingDeleteError("Identifiant invalide");
  const { data: booking, error: loadError } = await admin
    .from("crm_bookings")
    .select("id, reference")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadError) throw new BookingDeleteError(loadError.message, 500);
  if (!booking) throw new BookingDeleteError("Réservation introuvable", 404);

  const [{ data: bookingCards }, { data: registry }, { data: stays }] = await Promise.all([
    admin.from("crm_booking_cards").select("pliant_card_id, status").eq("booking_id", bookingId),
    admin.from("crm_pliant_cards").select("pliant_card_id, status").eq("booking_id", bookingId),
    admin.from("crm_hotel_direct_stays").select("id, le_booking_id, state").eq("booking_id", bookingId),
  ]);
  const stayRows = (stays || []) as { id: string; le_booking_id: number | null; state: unknown }[];
  const linked = linkedPliantCards({
    bookingCards: (bookingCards || []) as CardStatus[],
    registry: (registry || []) as CardStatus[],
    stays: stayRows,
  });
  if (linked.some((card) => !card.frozen)) throw new BookingDeleteError(PLIANT_NOT_FROZEN, 409);

  try {
    await clearBookingCharges(admin, bookingId);
  } catch (err) {
    throw new BookingDeleteError(err instanceof Error ? err.message : "Écritures non retirées");
  }

  if (stayRows.length) {
    const { error } = await admin.from("crm_hotel_direct_stays").delete().eq("booking_id", bookingId);
    if (error) throw new BookingDeleteError(error.message, 500);
  }
  const leIds = stayRows.map((row) => row.le_booking_id).filter((id): id is number => Number.isInteger(id));
  const { error: leByDossier } = await admin.from("crm_le_bookings").delete().eq("crm_booking_id", bookingId);
  if (leByDossier) throw new BookingDeleteError(leByDossier.message, 500);
  if (leIds.length) {
    const { error } = await admin.from("crm_le_bookings").delete().in("le_booking_id", leIds);
    if (error) throw new BookingDeleteError(error.message, 500);
  }

  const removed = await deleteBookingById(bookingId);
  return { ...removed, sejours: stayRows.length, reservations_le: leIds.length };
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

  for (const prefix of bookingFilePrefixes(bookingId)) {
    paths.push(...(await listCrmFiles(prefix)));
  }

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
