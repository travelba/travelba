/** Onglets de la page Argent (`/admin/argent?onglet=`) et alias des anciennes routes. */

export const ARGENT_TAB_IDS = ["a-encaisser", "a-pointer", "grand-livre", "comptes"] as const;
export type ArgentTab = (typeof ARGENT_TAB_IDS)[number];

export const ARGENT_TAB_LABELS: Record<ArgentTab, string> = {
  "a-encaisser": "À encaisser",
  "a-pointer": "À pointer",
  "grand-livre": "Grand livre",
  comptes: "Comptes",
};

export const ARGENT_TAB_HELP: Record<ArgentTab, string> = {
  "a-encaisser": "Virements Revolut et paiements Stripe reçus. Créditer {client} ou Refuser : rien n’entre au grand livre sans ce clic.",
  "a-pointer": "Sorties Pliant et Revolut. Chacune se pointe sur une étape d’un dossier (Rattacher), ou reste hors voyage. Le client ne voit ni coût ni marge.",
  "grand-livre": "Crédits comptabilisés, dépenses des dossiers et saisie d’un virement. Le nom d’un client ouvre ce qu’il voit dans son espace.",
  comptes: "Soldes Revolut, Stripe et Pliant, connexion des comptes et cartes émises.",
};

const ALIASES: Record<string, ArgentTab> = {
  encaisser: "a-encaisser",
  credits: "a-encaisser",
  revolut: "a-encaisser",
  stripe: "a-encaisser",
  pointer: "a-pointer",
  couts: "a-pointer",
  comptabilite: "a-pointer",
  pliant: "a-pointer",
  transactions: "grand-livre",
  ledger: "grand-livre",
  soldes: "comptes",
};

export function argentTabFromParam(raw: string | string[] | undefined): ArgentTab {
  const value = (Array.isArray(raw) ? raw[0] : raw) || "";
  if ((ARGENT_TAB_IDS as readonly string[]).includes(value)) return value as ArgentTab;
  return ALIASES[value] || "a-encaisser";
}

export function argentHref(tab: ArgentTab, params: Record<string, string | null | undefined> = {}) {
  const search = new URLSearchParams({ onglet: tab });
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return `/admin/argent?${search.toString()}`;
}

/** Anciennes pages → onglet. `/admin/revolut?connected=1` garde sa requête. */
export const LEGACY_ARGENT_ROUTES: Record<string, ArgentTab> = {
  "/admin/transactions": "grand-livre",
  "/admin/revolut": "a-encaisser",
  "/admin/stripe": "a-encaisser",
  "/admin/pliant": "a-pointer",
  "/admin/comptabilite": "a-pointer",
};

/** Vues de l’onglet À pointer : la file, puis toutes les dépenses Pliant, puis toutes les sorties Revolut. */
export const POINTER_VIEWS = ["file", "pliant", "revolut"] as const;
export type PointerView = (typeof POINTER_VIEWS)[number];
export const POINTER_VIEW_LABELS: Record<PointerView, string> = {
  file: "À pointer",
  pliant: "Toutes les dépenses Pliant",
  revolut: "Toutes les sorties Revolut",
};

export function pointerViewFromParam(raw: string | string[] | undefined): PointerView {
  const value = (Array.isArray(raw) ? raw[0] : raw) || "";
  return (POINTER_VIEWS as readonly string[]).includes(value) ? (value as PointerView) : "file";
}
