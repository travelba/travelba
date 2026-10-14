import { revalidatePath } from "next/cache";

/** Écrans qui lisent les coûts : dossier, Pliant, Revolut, comptabilité. */
export function revalidateTripAccounting(bookingId: string | null) {
  if (bookingId) revalidatePath(`/admin/reservations/${bookingId}`);
  revalidatePath("/admin/pliant");
  revalidatePath("/admin/revolut");
  revalidatePath("/admin/comptabilite");
}
