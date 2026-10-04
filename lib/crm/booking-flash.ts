/**
 * Message d’un geste (« Enregistré. ») qui doit survivre au remontage de la fiche
 * (`key={booking.updated_at}` après `router.refresh()`). Gardé quelques secondes en sessionStorage.
 */
export const BOOKING_FLASH_TTL_MS = 15_000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function bookingFlashKey(bookingId: string) {
  return `tba-booking-flash:${bookingId}`;
}

export function writeBookingFlash(storage: StorageLike | null, key: string, message: string, now = Date.now()) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ m: message, at: now }));
  } catch {
    // Pas de stockage : le message reste à l’écran jusqu’au remontage.
  }
}

/** Message encore frais, sinon null. Un message périmé est retiré. */
export function readBookingFlash(storage: StorageLike | null, key: string, now = Date.now()): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { m?: unknown; at?: unknown };
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    if (typeof parsed.m !== "string" || now - at > BOOKING_FLASH_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed.m;
  } catch {
    return null;
  }
}
