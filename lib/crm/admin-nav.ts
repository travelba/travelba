/** Menu de l’espace agence : cinq entrées et Réglages, badges, entrée active, barre basse téléphone. */

export type AdminBadgeKey = "revolut" | "stripe" | "emails" | "le" | "pieces" | "whatsapp" | "hotels" | "costs";

export type AdminNavCounts = Record<AdminBadgeKey, number>;

export const EMPTY_NAV_COUNTS: AdminNavCounts = {
  revolut: 0,
  stripe: 0,
  emails: 0,
  le: 0,
  pieces: 0,
  whatsapp: 0,
  hotels: 0,
  costs: 0,
};

export type AdminNavItem = {
  href: string;
  label: string;
  /** Nom d’icône de `components/crm/icons.tsx`. */
  icon: string;
  exact?: boolean;
  /** Un compteur, ou la somme de plusieurs (À encaisser = Revolut + Stripe). */
  badge?: AdminBadgeKey | AdminBadgeKey[];
  /** Ouvre dans un autre onglet (aperçu client). */
  newTab?: boolean;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  /** Titre de la page quand les entrées du groupe sont ses onglets (`?onglet=`). Sinon l’entrée active. */
  title?: string;
  items: AdminNavItem[];
};

export const ADMIN_ROUTES = {
  accueil: "/admin",
  dossiers: "/admin/reservations",
  clients: "/admin/clients",
  boite: "/admin/boite",
  argent: "/admin/argent",
  reglages: "/admin/reglages",
} as const;

/** Les cinq entrées du menu, puis Réglages. Le libellé de l’entrée est le H1 de la page. */
export function adminNavGroups(input: { role?: "admin" | "agent" | "partner" | ""; showExample?: boolean }): AdminNavGroup[] {
  if (input.role === "partner") {
    return [
      {
        id: "boite",
        label: "Little Emperors",
        items: [{ href: "/admin/little-emperors", label: "Little Emperors", icon: "hotel", exact: true }],
      },
    ];
  }
  const admin = input.role === "admin";
  return [
    {
      id: "accueil",
      label: "Accueil",
      items: [{ href: ADMIN_ROUTES.accueil, label: "Accueil", icon: "home", exact: true }],
    },
    {
      id: "dossiers",
      label: "Dossiers",
      title: "Dossiers",
      items: [
        { href: ADMIN_ROUTES.dossiers, label: "Dossiers", icon: "luggage" },
        { href: "/admin/restaurants", label: "Restaurants", icon: "restaurant" },
        { href: `${ADMIN_ROUTES.dossiers}?vue=formalites`, label: "Formalités", icon: "shield_check" },
        { href: `${ADMIN_ROUTES.dossiers}?vue=services`, label: "Services à confirmer", icon: "headset" },
      ],
    },
    {
      id: "clients",
      label: "Clients",
      title: "Clients",
      items: [
        { href: ADMIN_ROUTES.clients, label: "Clients", icon: "group" },
        { href: `${ADMIN_ROUTES.clients}?filtre=echeance`, label: "Pièces à échéance", icon: "id_card", badge: "pieces" },
      ],
    },
    {
      id: "boite",
      label: "Boîte de réception",
      title: "Boîte de réception",
      items: [
        { href: `${ADMIN_ROUTES.boite}?onglet=fournisseurs`, label: "Fournisseurs", icon: "inbox", badge: ["emails", "le"] },
        { href: `${ADMIN_ROUTES.boite}?onglet=hotels`, label: "Hôtels", icon: "hotel", badge: "hotels" },
        { href: `${ADMIN_ROUTES.boite}?onglet=whatsapp`, label: "WhatsApp", icon: "forum", badge: "whatsapp" },
      ],
    },
    {
      id: "argent",
      label: "Argent",
      title: "Argent",
      items: [
        { href: `${ADMIN_ROUTES.argent}?onglet=a-encaisser`, label: "À encaisser", icon: "payments", badge: ["revolut", "stripe"] },
        { href: `${ADMIN_ROUTES.argent}?onglet=a-pointer`, label: "À pointer", icon: "receipt_long", badge: "costs" },
        { href: `${ADMIN_ROUTES.argent}?onglet=grand-livre`, label: "Grand livre", icon: "landmark" },
        { href: `${ADMIN_ROUTES.argent}?onglet=comptes`, label: "Comptes", icon: "account_balance" },
      ],
    },
    {
      id: "reglages",
      label: "Réglages",
      items: admin
        ? [
            { href: ADMIN_ROUTES.reglages, label: "Réglages", icon: "build", exact: true },
            { href: "/admin/equipe", label: "Équipe", icon: "user_cog" },
            { href: `${ADMIN_ROUTES.reglages}/whatsapp`, label: "Modèles WhatsApp", icon: "chat" },
            { href: `${ADMIN_ROUTES.reglages}/mails`, label: "E-mails au client", icon: "mail" },
            { href: "/admin/concierge", label: "Savoir du Concierge", icon: "menu_book" },
            { href: `${ADMIN_ROUTES.reglages}/hotels`, label: "Accès Hôtels", icon: "lock" },
            { href: `${ADMIN_ROUTES.reglages}/gmail`, label: "Diagnostic Gmail", icon: "activity" },
            ...(input.showExample
              ? [{ href: "/exemple", label: "Aperçu espace client", icon: "eye", newTab: true } satisfies AdminNavItem]
              : []),
          ]
        : [
            { href: `${ADMIN_ROUTES.reglages}/whatsapp`, label: "Modèles WhatsApp", icon: "chat" },
            { href: `${ADMIN_ROUTES.reglages}/mails`, label: "E-mails au client", icon: "mail" },
          ],
    },
  ];
}

function splitHref(href: string) {
  const [withoutHash] = href.split("#");
  const [path, query = ""] = withoutHash.split("?");
  return { path, query: new URLSearchParams(query), hash: href.includes("#") };
}

/**
 * L’entrée active : le chemin le plus long qui préfixe la page, la requête (`?onglet=`, `?vue=`, `?filtre=echeance`)
 * l’emportant sur l’entrée sans requête. Une page à onglets sans `?onglet=` allume son premier onglet.
 * Une ancre ne s’allume jamais. Null hors menu.
 */
export function activeAdminNavHref(groups: AdminNavGroup[], pathname: string, search = ""): string | null {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let best = null as { href: string; score: number } | null;
  for (const group of groups) {
    group.items.forEach((item, index) => {
      const { path, query, hash } = splitHref(item.href);
      if (hash) return;
      const matchesPath = item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
      if (!matchesPath) return;
      let queryMatch = true;
      let defaultTab = false;
      for (const [key, value] of query.entries()) {
        if (current.get(key) === value) continue;
        if (key === "onglet" && index === 0 && !current.has("onglet")) {
          defaultTab = true;
          continue;
        }
        queryMatch = false;
      }
      if (!queryMatch) return;
      const score = path.length * 10 + (defaultTab ? 0 : [...query.keys()].length);
      if (!best || score > best.score) best = { href: item.href, score };
    });
  }
  return best?.href ?? null;
}

export function adminNavBadge(item: Pick<AdminNavItem, "badge">, counts: AdminNavCounts) {
  if (!item.badge) return null;
  const keys = Array.isArray(item.badge) ? item.badge : [item.badge];
  const value = keys.reduce((sum, key) => sum + (counts[key] || 0), 0);
  return value > 0 ? value : null;
}

/** Groupes à montrer ouverts : ceux que l’agent n’a pas repliés, et toujours celui de la page courante. */
export function openAdminNavGroups(groups: AdminNavGroup[], collapsed: Iterable<string>, activeHref: string | null) {
  const closed = new Set(collapsed);
  return groups.filter((group) => !closed.has(group.id) || group.items.some((item) => item.href === activeHref)).map((group) => group.id);
}

export function parseCollapsedGroups(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function toggleCollapsedGroup(collapsed: string[], groupId: string) {
  return collapsed.includes(groupId) ? collapsed.filter((id) => id !== groupId) : [...collapsed, groupId];
}

/** Barre basse téléphone : les cinq entrées du menu. Réglages est dans le menu utilisateur. */
export type AdminMobileTab = {
  id: "accueil" | "dossiers" | "clients" | "boite" | "argent";
  label: string;
  icon: string;
  href: string;
  /** Chemins qui allument l’onglet. */
  paths: string[];
  badges: AdminBadgeKey[];
};

export const ADMIN_MOBILE_TABS: AdminMobileTab[] = [
  { id: "accueil", label: "Accueil", icon: "home", href: ADMIN_ROUTES.accueil, paths: ["/admin"], badges: [] },
  {
    id: "dossiers",
    label: "Dossiers",
    icon: "luggage",
    href: ADMIN_ROUTES.dossiers,
    paths: ["/admin/reservations", "/admin/restaurants", "/admin/formalites", "/admin/services"],
    badges: [],
  },
  { id: "clients", label: "Clients", icon: "group", href: ADMIN_ROUTES.clients, paths: ["/admin/clients"], badges: [] },
  {
    id: "boite",
    label: "Boîte",
    icon: "inbox",
    href: ADMIN_ROUTES.boite,
    paths: ["/admin/boite", "/admin/emails", "/admin/whatsapp", "/admin/little-emperors", "/admin/hotels-demandes"],
    badges: ["emails", "le", "whatsapp", "hotels"],
  },
  {
    id: "argent",
    label: "Argent",
    icon: "payments",
    href: ADMIN_ROUTES.argent,
    paths: ["/admin/argent", "/admin/transactions", "/admin/revolut", "/admin/stripe", "/admin/pliant", "/admin/comptabilite"],
    badges: ["revolut", "stripe", "costs"],
  },
];

export function mobileTabActive(tab: AdminMobileTab, pathname: string) {
  return tab.paths.some((path) => (path === "/admin" ? pathname === path : pathname === path || pathname.startsWith(`${path}/`)));
}

export function mobileTabBadge(tab: AdminMobileTab, counts: AdminNavCounts) {
  const total = tab.badges.reduce((sum, key) => sum + (counts[key] || 0), 0);
  return total > 0 ? total : null;
}

/** Titre court de l’en-tête téléphone : l’entrée du menu (ou le titre de sa page à onglets), sinon la page connue. */
export function adminPageTitle(groups: AdminNavGroup[], pathname: string, search = "") {
  if (pathname === "/admin/reservations/nouveau") return "Nouveau dossier";
  if (/^\/admin\/reservations\/[^/]+/.test(pathname)) return "Dossier";
  if (/^\/admin\/clients\/[^/]+/.test(pathname)) return "Fiche client";
  if (pathname.startsWith("/admin/transactions/client/")) return "Transactions du client";
  if (pathname === "/admin/restaurants/catalogue") return "Catalogue";
  if (pathname === "/admin/restaurants/aujourdhui" || pathname === "/admin/restaurants") return "Restaurants";
  if (pathname === "/admin/recherche") return "Recherche";
  if (pathname === "/admin/reglages" || pathname.startsWith("/admin/reglages/")) return "Réglages";
  const active = activeAdminNavHref(groups, pathname, search);
  for (const group of groups) {
    const item = group.items.find((entry) => entry.href === active);
    if (item) return group.title || item.label;
  }
  return "Espace agence";
}

/** Initiales de l’agent pour l’avatar : « VB », sinon « TB ». */
export function staffInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "TB"
  );
}
