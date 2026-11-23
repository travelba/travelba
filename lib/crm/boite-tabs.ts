/** Onglets de la Boîte de réception (`/admin/boite?onglet=`) et alias des anciennes pages. */

export const BOITE_TAB_IDS = ["fournisseurs", "hotels", "whatsapp", "messages"] as const;
export type BoiteTab = (typeof BOITE_TAB_IDS)[number];

export const BOITE_TAB_LABELS: Record<BoiteTab, string> = {
  fournisseurs: "Fournisseurs",
  hotels: "Hôtels",
  whatsapp: "WhatsApp",
  messages: "Messages",
};

export const BOITE_TAB_HELP: Record<BoiteTab, string> = {
  fournisseurs:
    "E-mails des fournisseurs et réservations Little Emperors sans dossier. Un fil, une carte : la proposition dit le client et le dossier. Rien n’est déposé ni montré au client sans votre clic.",
  hotels:
    "Courriers hôtel, une ligne par séjour : paiement à faire, réponses, envois sans réponse. Rien ne part sans confirmation.",
  whatsapp: "Conversations WhatsApp, reprise du Concierge et messages à approuver. Rien ne part sans votre clic.",
  messages: "Messages de l’application TBA. Vous répondez ici. Le client est prévenu sur son téléphone.",
};

const TAB_ALIASES: Record<string, BoiteTab> = {
  emails: "fournisseurs",
  mails: "fournisseurs",
  "little-emperors": "fournisseurs",
  hotel: "hotels",
  reponses: "hotels",
  wa: "whatsapp",
  message: "messages",
  app: "messages",
};

export function boiteTabFromParam(raw: string | string[] | undefined): BoiteTab {
  const value = (Array.isArray(raw) ? raw[0] : raw) || "";
  if ((BOITE_TAB_IDS as readonly string[]).includes(value)) return value as BoiteTab;
  return TAB_ALIASES[value] || "fournisseurs";
}

export function boiteHref(tab: BoiteTab, params: Record<string, string | number | null | undefined> = {}) {
  const search = new URLSearchParams({ onglet: tab });
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === 0) continue;
    search.set(key, String(value));
  }
  return `/admin/boite?${search.toString()}`;
}

/** Vues de Fournisseurs : la file, puis ce qui a été déposé (24 h), puis ce qui a été classé. */
export const FOURNISSEURS_VIEWS = ["file", "rattaches", "classes"] as const;
export type FournisseursView = (typeof FOURNISSEURS_VIEWS)[number];
export const FOURNISSEURS_VIEW_LABELS: Record<FournisseursView, string> = {
  file: "À traiter",
  rattaches: "Déposés (24 h)",
  classes: "Classés",
};
const FOURNISSEURS_ALIASES: Record<string, FournisseursView> = { appliques: "rattaches", ignores: "classes" };

export function fournisseursViewFromParam(raw: string | string[] | undefined): FournisseursView {
  const value = (Array.isArray(raw) ? raw[0] : raw) || "";
  if ((FOURNISSEURS_VIEWS as readonly string[]).includes(value)) return value as FournisseursView;
  return FOURNISSEURS_ALIASES[value] || "file";
}

/** Vues d’Hôtels : la file des courriers, et les demandes de séjour de l’espace client. */
export const HOTELS_VIEWS = ["reponses", "demandes"] as const;
export type HotelsView = (typeof HOTELS_VIEWS)[number];
export const HOTELS_VIEW_LABELS: Record<HotelsView, string> = {
  reponses: "Courriers",
  demandes: "Demandes hôtels",
};

export function hotelsViewFromParam(raw: string | string[] | undefined): HotelsView {
  const value = (Array.isArray(raw) ? raw[0] : raw) || "";
  if (value === "sans-reponse") return "reponses";
  return (HOTELS_VIEWS as readonly string[]).includes(value) ? (value as HotelsView) : "reponses";
}

/** Anciennes pages → onglet (et vue). `/admin/little-emperors` reste la page des partenaires MyLER. */
export const LEGACY_BOITE_ROUTES: Record<string, { tab: BoiteTab; params?: Record<string, string> }> = {
  "/admin/emails": { tab: "fournisseurs" },
  "/admin/little-emperors": { tab: "fournisseurs", params: { source: "little-emperors" } },
  "/admin/hotels-demandes": { tab: "hotels", params: { vue: "demandes" } },
  "/admin/whatsapp": { tab: "whatsapp" },
};

/** Le fil WhatsApp d’un numéro, dans la Boîte. */
export function whatsappThreadHref(key: string) {
  return boiteHref("whatsapp", { fil: key });
}
