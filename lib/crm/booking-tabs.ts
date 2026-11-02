/** Onglets de la fiche dossier : l’onglet courant vit dans l’URL (`?tab=`). */
export const BOOKING_TAB_IDS = ["voyage", "client", "todo", "argent", "historique"] as const;

export type BookingTabId = (typeof BOOKING_TAB_IDS)[number];

/** Valeur lisible dans l’URL pour chaque onglet. */
export const BOOKING_TAB_SLUGS: Record<BookingTabId, string> = {
  voyage: "voyage",
  client: "client",
  todo: "a-faire",
  argent: "argent",
  historique: "historique",
};

export const BOOKING_TAB_LABELS: Record<BookingTabId, string> = {
  voyage: "Voyage",
  client: "Client",
  todo: "À faire",
  argent: "Argent",
  historique: "Historique",
};

/** Ce que chaque onglet contient, en une ligne. */
export const BOOKING_TAB_HELP: Record<BookingTabId, string> = {
  voyage: "Lieu, dates, étapes, pièces et courriers hôtel.",
  client: "Le client, les voyageurs, le fil WhatsApp et le partage du carnet.",
  todo: "Formalités, enregistrement, services et pièces manquantes.",
  argent: "Qui règle, prix, coûts, facture, compte du client et carte Pliant.",
  historique: "Créé par, en charge, intervenants, et chaque geste sur le dossier : qui, quoi, quand.",
};

/**
 * Anciens slugs : WhatsApp et Interface client ont rejoint Client et Voyage ; Carte, Pliant,
 * Règlement et Transactions sont l’onglet Argent. Restaurants vit dans Voyage (le lien vers l’écran du soir).
 */
const BOOKING_TAB_ALIASES: Record<string, BookingTabId> = {
  whatsapp: "client",
  interface: "voyage",
  restaurants: "voyage",
  carte: "argent",
  cartes: "argent",
  pliant: "argent",
  reglement: "argent",
  transactions: "argent",
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
 * Nouvelle query string avec l’onglet. Les autres paramètres restent, sauf `?hotel=`, `?relance=` et `?repondre=` :
 * ils ont servi à ouvrir le bureau (et le brouillon) et ne doivent pas le rouvrir.
 */
export function bookingTabQuery(current: string, tab: BookingTabId) {
  const params = new URLSearchParams(current);
  params.delete("hotel");
  params.delete("relance");
  params.delete("repondre");
  params.set("tab", BOOKING_TAB_SLUGS[tab]);
  return params.toString();
}

/** Lien vers un onglet d’un dossier. */
export function bookingTabHref(bookingId: string, tab: BookingTabId) {
  return `/admin/reservations/${bookingId}?tab=${BOOKING_TAB_SLUGS[tab]}`;
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
