/** Onglets de la fiche dossier : l’onglet courant vit dans l’URL (`?tab=`). */
export const BOOKING_TAB_IDS = ["client", "whatsapp", "voyage", "todo", "cartes", "argent", "interface"] as const;

export type BookingTabId = (typeof BOOKING_TAB_IDS)[number];

/** Valeur lisible dans l’URL pour chaque onglet. */
export const BOOKING_TAB_SLUGS: Record<BookingTabId, string> = {
  client: "client",
  whatsapp: "whatsapp",
  voyage: "voyage",
  todo: "a-faire",
  cartes: "carte",
  argent: "reglement",
  interface: "interface",
};

export const BOOKING_TAB_LABELS: Record<BookingTabId, string> = {
  client: "Client",
  whatsapp: "WhatsApp",
  voyage: "Le voyage",
  todo: "À faire",
  cartes: "Carte",
  argent: "Règlement",
  interface: "Interface client",
};

/** Anciens slugs : Pliant est la carte, Transactions et Argent sont le règlement. */
const BOOKING_TAB_ALIASES: Record<string, BookingTabId> = {
  pliant: "cartes",
  transactions: "argent",
  argent: "argent",
};

/** `?tab=a-faire` → `todo`. Inconnu ou absent → `voyage`. L’ancien id interne est accepté. */
export function bookingTabFromParam(value: string | null | undefined): BookingTabId {
  if (!value) return "voyage";
  const slug = value.trim().toLowerCase();
  const alias = BOOKING_TAB_ALIASES[slug];
  if (alias) return alias;
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
