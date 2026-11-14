/** Seul le clic « Montrer au client » de l’écran agence révèle. */
export const HUMAN_SHOW_ONLY = "Seul l’écran de l’agence peut montrer au client.";

/**
 * Une carte déjà montrée le reste. Une carte nouvelle, ou encore cachée, reste cachée.
 * L’import, la fusion, le cron et les outils ne passent jamais de faux à vrai.
 */
export function visibilityAfterImport(existingVisible: boolean | null | undefined) {
  return existingVisible === true;
}

/** Voyageur posé par un import ou une fusion : le client ne le voit pas tant qu’il n’est pas validé. */
export function proposedTravelerFlag() {
  return { proposed: true as const };
}

export function travelerShownToClient(row: { proposed?: boolean | null }) {
  return row.proposed !== true;
}
