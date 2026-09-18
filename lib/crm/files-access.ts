/** Chemin storage acceptable : relatif, sans remontée, sans segment vide. */
export function isSafeCrmPath(path: string): boolean {
  if (!path || path.length > 512) return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  if (path.split("/").some((segment) => segment.length === 0)) return false;
  return true;
}

export type CustomerPathScope =
  | { kind: "own" }
  | { kind: "booking"; bookingId: string }
  | { kind: "denied" };

/**
 * Ce qu’un client connecté a le droit de demander via /api/files :
 * ses propres fichiers `customers/{id}/…`, ou un fichier de dossier `bookings/{bookingId}/…`
 * (vérifié ensuite : dossier à lui + couverture ou document publié).
 */
export function customerPathScope(path: string, customerId: string): CustomerPathScope {
  if (!isSafeCrmPath(path)) return { kind: "denied" };
  if (path.startsWith(`customers/${customerId}/`)) return { kind: "own" };
  if (path.startsWith("bookings/")) {
    const bookingId = path.split("/")[1] ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return { kind: "denied" };
    return { kind: "booking", bookingId };
  }
  return { kind: "denied" };
}
