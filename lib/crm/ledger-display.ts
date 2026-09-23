type LedgerKindRow = {
  direction: string;
  kind: string;
  external_id: string | null;
};

type LedgerRow = LedgerKindRow & {
  booking_id: string | null;
};

/** Débit unique du montant du séjour, pas une dépense (vol, hôtel, frais). */
export function isStayRollupDebit(row: LedgerKindRow) {
  return row.direction === "debit" && row.kind === "booking" && !row.external_id;
}

/**
 * Masque le montant global du séjour dès qu’une dépense du même dossier est déjà au livre.
 */
export function visibleLedgerRows<T extends LedgerRow>(rows: T[]): T[] {
  const covered = new Set(
    rows
      .filter((row) => row.booking_id && !isStayRollupDebit(row))
      .map((row) => row.booking_id as string)
  );
  return rows.filter((row) => {
    if (!row.booking_id || !isStayRollupDebit(row)) return true;
    return !covered.has(row.booking_id);
  });
}

export function reservationContextLabel(
  booking: {
    title?: string | null;
    destination?: string | null;
    reference: string;
  } | null | undefined
) {
  if (!booking) return null;
  return (booking.title || "").trim() || (booking.destination || "").trim() || booking.reference || null;
}

/** Le montant global du séjour s’affiche comme une dépense, pas comme « Réservation … ». */
export function ledgerMovementTitle(
  row: LedgerKindRow & { label: string | null; booking_id?: string | null },
  fallback: string
) {
  if (isStayRollupDebit(row)) return "Séjour";
  return (row.label || "").trim() || fallback;
}
