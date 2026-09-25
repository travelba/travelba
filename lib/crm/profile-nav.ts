/** Onglets réels de /mon-compte/profil. Pas de cartes. */
export const CLIENT_PROFILE_NAV = [
  { href: "/mon-compte/profil", label: "Vous", exact: true },
  { href: "/mon-compte/profil/documents", label: "Pièces", exact: false },
  { href: "/mon-compte/profil/compagnons", label: "Voyageurs", exact: false },
  { href: "/mon-compte/profil/facturation", label: "Facturation", exact: false },
] as const;
