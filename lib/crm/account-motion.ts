export type AccountMotion = "nav-forward" | "nav-back" | "nav-fade";

const TAB_SUFFIXES = ["", "/reservations", "/hotels", "/transactions", "/profil"] as const;

/** Index de l’onglet (Accueil → Réservations → Hôtels → Transactions → Mon compte). -1 si hors espace. */
export function accountTabIndex(pathname: string, basePath: string) {
  const path = (pathname.split("?")[0] || "/").replace(/\/$/, "") || "/";
  const base = basePath.replace(/\/$/, "") || "/";
  if (path !== base && !path.startsWith(`${base}/`)) return -1;
  const rest = path === base ? "" : path.slice(base.length);
  let best = -1;
  let bestLen = -1;
  TAB_SUFFIXES.forEach((suffix, index) => {
    const matches =
      suffix === ""
        ? rest === ""
        : rest === suffix || rest.startsWith(`${suffix}/`);
    if (matches && suffix.length >= bestLen) {
      best = index;
      bestLen = suffix.length;
    }
  });
  return best;
}

/**
 * Sens du glissement. Vers un onglet à droite, le contenu entre par la droite.
 * Quitter un détail pour la racine de son onglet est un retour. Même endroit : fondu.
 */
export function accountTabDirection(pathname: string, targetHref: string, basePath: string): AccountMotion {
  const from = accountTabIndex(pathname, basePath);
  const to = accountTabIndex(targetHref, basePath);
  if (from < 0 || to < 0) return "nav-fade";
  if (from === to) {
    const current = (pathname.split("?")[0] || "").replace(/\/$/, "");
    const target = (targetHref.split("?")[0] || "").replace(/\/$/, "");
    if (current !== target && current.startsWith(`${target}/`)) return "nav-back";
    return "nav-fade";
  }
  return to > from ? "nav-forward" : "nav-back";
}

/** Nom stable pour le morphing de la couverture. Les identifiants CSS n’acceptent pas tout. */
export function stayTransitionName(reference: string) {
  const safe = reference.replace(/[^A-Za-z0-9_-]/g, "");
  return safe ? `stay-${safe}` : "stay";
}
