import { revalidatePath } from "next/cache";

/** Écrans qui lisent les coûts : le dossier et la page Argent (À pointer, Comptes). */
export function revalidateTripAccounting(bookingId: string | null) {
  if (bookingId) revalidatePath(`/admin/reservations/${bookingId}`);
  revalidatePath("/admin/argent");
  revalidatePath("/admin");
}
