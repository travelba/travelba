/** Onglets de la fiche dossier : l’onglet courant vit dans l’URL (`?tab=`). */
export const BOOKING_TAB_IDS = ["voyage", "cartes", "todo", "argent", "transactions", "client", "interface"] as const;

export type BookingTabId = (typeof BOOKING_TAB_IDS)[number];

/** Valeur lisible dans l’URL pour chaque onglet. */
export const BOOKING_TAB_SLUGS: Record<BookingTabId, string> = {
  voyage: "voyage",
  cartes: "carte",
  todo: "a-faire",
  argent: "argent",
  transactions: "transactions",
  client: "client",
  interface: "interface",
};

export const BOOKING_TAB_LABELS: Record<BookingTabId, string> = {
  voyage: "Le voyage",
  cartes: "Carte",
  todo: "À faire",
  argent: "L’argent",
  transactions: "Transactions",
  client: "Le client",
  interface: "Interface client",
};

/** `?tab=a-faire` → `todo`. Inconnu ou absent → `voyage`. L’ancien id interne est accepté. */
export function bookingTabFromParam(value: string | null | undefined): BookingTabId {
  if (!value) return "voyage";
  const slug = value.trim().toLowerCase();
  for (const id of BOOKING_TAB_IDS) {
    if (BOOKING_TAB_SLUGS[id] === slug || id === slug) return id;
  }
  return "voyage";
}

/**
 * Nouvelle query string avec l’onglet. Les autres paramètres restent, sauf `?hotel=` : il a servi à
 * ouvrir le bureau de l’hôtel au chargement et ne doit pas le rouvrir à chaque retour sur Le voyage.
 */
export function bookingTabQuery(current: string, tab: BookingTabId) {
  const params = new URLSearchParams(current);
  params.delete("hotel");
  params.set("tab", BOOKING_TAB_SLUGS[tab]);
  return params.toString();
}

/** Onglet suivant au clavier (flèches, Début, Fin), en bouclant. */
export function nextBookingTab(
  tabs: readonly BookingTabId[],
  current: BookingTabId,
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End"
): BookingTabId {
  if (!tabs.length) return current;
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs[tabs.length - 1];
  const index = Math.max(0, tabs.indexOf(current));
  const delta = key === "ArrowRight" ? 1 : -1;
  return tabs[(index + delta + tabs.length) % tabs.length];
}

/** Ancre d’une étape dans la liste des cartes. */
export function bookingStepAnchor(itemId: string) {
  return `step-${itemId}`;
}
