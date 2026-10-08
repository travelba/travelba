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
 * Rien n’est écrit tant que la pièce n’est pas relue.
 * Le parent ne reçoit le scan qu’à ce moment-là ; « Annuler » oublie la pièce.
 * Le formulaire d’un nouvel accompagnateur (un seul passeport, pas encore enregistré)
 * remplit ses champs tout de suite : ce n’est pas une écriture.
 */
export function scanAwaitsConfirmation(input: ScanFlowInput) {
  return scanWouldPersist(input);
}

export function passportConfirmCopy(input: {
  variant: "admin" | "client";
  identityCount: number;
  companion: boolean;
  firstName?: string | null;
}) {
  if (input.variant === "admin") {
    return {
      question:
        input.identityCount > 1
          ? `Enregistrer ces ${input.identityCount} passeports ?`
          : "Enregistrer cette pièce ?",
      confirm: "Enregistrer",
      hint: "Relisez chaque champ. Rien n’est écrit avant.",
    };
  }
  return {
    question:
      input.identityCount > 1
        ? `Importer ces ${input.identityCount} passeports ?`
        : input.companion
          ? `C’est bien la pièce de ${input.firstName || "ce voyageur"} ?`
          : "C’est bien votre pièce ?",
    confirm: "Confirmer",
    hint: null as string | null,
  };
}
