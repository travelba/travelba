export type LedgerMovementRow = {
  id: string;
  credit: boolean;
  title: string;
  amountLabel: string;
  occurredLabel: string;
  kindLabel: string;
  whenWhere: string | null;
  reference: string | null;
  carnetHref: string | null;
  carnetLabel?: string | null;
  /** Facture MB3M de cette dépense. Le lien n’existe qu’une fois la facture émise. */
  mb3mLabel?: string | null;
  mb3mHref?: string | null;
  /** Séjour du mouvement, pour regrouper les cartes. Absent d’un virement. */
  bookingId?: string | null;
  /** Raison sociale, seulement si le compte a plusieurs sociétés. */
  companyLabel?: string | null;
};
