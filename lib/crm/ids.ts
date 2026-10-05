export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/** Fichiers d’un dossier : pièces et couverture, plus les photos de carte `agency-cards/` (résidu PAN). */
export function bookingFilePrefixes(bookingId: string) {
  return [`bookings/${bookingId}`, `agency-cards/${bookingId}`];
}

export function customerFilePrefixes(customerId: string, bookingIds: string[]) {
  return [`customers/${customerId}`, ...bookingIds.flatMap((id) => bookingFilePrefixes(id))];
}

/** Chemins de pièces voyage encore référencés ailleurs (coffre client) restent en place. */
export function exclusiveStoragePaths(candidates: string[], stillUsed: string[]) {
  const used = new Set(stillUsed.filter(Boolean));
  return [...new Set(candidates.filter((path) => path && !used.has(path)))];
}
