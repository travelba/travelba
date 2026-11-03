/**
 * Rafraîchissements d’écran qui rechargent le CRM.
 * Plus lents qu’avant, et seulement tant que l’onglet est visible.
 * Les alertes hôtel restent en arrière-plan : un écran verrouillé doit encore les voir.
 */
export const PAGE_POLL_MS = {
  whatsappInbox: 60_000,
  whatsappDock: 60_000,
  visaJourney: 20_000,
  etaIl: 8_000,
  ratehawk: 15_000,
  esta: 20_000,
} as const;

export function pollRunsWhileVisible(visibilityState: string) {
  return visibilityState === "visible";
}
