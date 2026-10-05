export type ScanFlowInput = {
  variant: "admin" | "client";
  /** Le composant enregistre lui-même la pièce lue (fiche, compagnon). Faux : le parent remplit son formulaire. */
  persist: boolean;
  hasFile: boolean;
  identityCount: number;
  customerId?: string | null;
};

/** Le scan écrit quelque chose : la pièce du titulaire ou du compagnon, ou un import de plusieurs passeports. */
export function scanWouldPersist(input: ScanFlowInput) {
  if (!input.hasFile) return false;
  if (input.variant === "admin" && !input.customerId) return false;
  return (input.persist || input.identityCount > 1) && input.identityCount > 0;
}

/**
 * Côté client, rien ne part avant « Confirmer » : le parent ne reçoit le scan (onScan)
 * qu’à la confirmation, et « Annuler » doit lui dire d’oublier la pièce (onCancel).
 */
export function scanAwaitsConfirmation(input: ScanFlowInput) {
  return input.variant === "client" && scanWouldPersist(input);
}
