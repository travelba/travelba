import { ADMIN_ROUTES } from "./admin-nav";

/** Vues de la liste Dossiers : `?vue=`. La semaine est la vue par défaut. */
export const DOSSIERS_VIEWS = ["semaine", "liste", "formalites", "services"] as const;

export type DossiersView = (typeof DOSSIERS_VIEWS)[number];

export const DOSSIERS_VIEW_LABELS: Record<DossiersView, string> = {
  semaine: "La semaine",
  liste: "Liste",
  formalites: "Formalités",
  services: "Services à confirmer",
};

export const DOSSIERS_VIEW_HELP: Record<DossiersView, string> = {
  semaine: "Enregistrez le dossier, puis montrez-le au client. Enregistrer ne le rend pas visible.",
  liste: "Tous les dossiers, avec la recherche, l’état et le tri.",
  formalites: "Refus et messages qui n’ont pas abouti, ESTA et ETA encore ouverts.",
  services: "Chauffeur, accueil et enregistrement encore ouverts.",
};

/** `?vue=formalites` → `formalites`. Inconnu ou absent → `semaine`. */
export function dossiersViewFromParam(value: string | null | undefined): DossiersView {
  const slug = (value || "").trim().toLowerCase();
  return (DOSSIERS_VIEWS as readonly string[]).includes(slug) ? (slug as DossiersView) : "semaine";
}

/** Lien vers une vue de Dossiers. La semaine est l’URL nue. */
export function dossiersHref(view: DossiersView) {
  return view === "semaine" ? ADMIN_ROUTES.dossiers : `${ADMIN_ROUTES.dossiers}?vue=${view}`;
}

/** Anciennes pages : chacune est une vue de Dossiers. */
export const LEGACY_DOSSIERS_ROUTES: Record<string, DossiersView> = {
  "/admin/formalites": "formalites",
  "/admin/services": "services",
};
