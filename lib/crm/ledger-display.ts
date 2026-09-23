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

/** Dépense libre : s’ajoute au livre sans remplacer le montant du séjour. */
export function isFreeExpenseDebit(row: { external_id?: string | null }) {
  return (row.external_id || "").includes(":expense:");
}

/** Une carte ou un frais du dossier couvre le montant global. Une dépense libre, non. */
export function coversStayRollup(row: LedgerKindRow & { booking_id?: string | null }) {
  if (!row.booking_id || row.direction !== "debit") return false;
  if (isStayRollupDebit(row)) return false;
  if (isFreeExpenseDebit(row)) return false;
  return true;
}

/**
 * Masque le montant global du séjour dès qu’une dépense du même dossier est déjà au livre.
 * La dépense libre reste à côté du séjour.
 */
export function visibleLedgerRows<T extends LedgerRow>(rows: T[]): T[] {
  const covered = new Set(
    rows.filter((row) => coversStayRollup(row)).map((row) => row.booking_id as string)
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

/** Retire la référence en fin de libellé : elle va dans le détail. */
export function ledgerSubjectTitle(label: string, reference: string | null | undefined) {
  const ref = (reference || "").trim();
  if (!ref) return label;
  const suffix = ` — ${ref}`;
  if (!label.endsWith(suffix)) return label;
  return label.slice(0, -suffix.length).trim() || label;
}

export function ledgerPlace(
  booking: { title?: string | null; destination?: string | null; reference: string } | null | undefined
) {
  if (!booking) return null;
  const destination = (booking.destination || "").trim();
  if (destination) return destination;
  const title = (booking.title || "").trim();
  if (title && title !== booking.reference) return title;
  return null;
}

/** Date du séjour et lieu, sous le sujet du mouvement. */
export function ledgerWhenWhere(dates: string | null | undefined, place: string | null | undefined) {
  return [dates, place].map((value) => (value || "").trim()).filter(Boolean).join(" · ") || null;
}

/** Le montant global du séjour s’affiche comme une dépense, pas comme « Réservation … ». */
export function ledgerMovementTitle(
  row: LedgerKindRow & { label: string | null; booking_id?: string | null },
  fallback: string
) {
  if (isStayRollupDebit(row)) return "Séjour";
  return (row.label || "").trim() || fallback;
}
