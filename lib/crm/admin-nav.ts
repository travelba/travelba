/** Menu de l’espace agence : groupes repliables, badges, entrée active, barre basse mobile. */

export type AdminBadgeKey = "revolut" | "stripe" | "emails" | "le" | "pieces";

export type AdminNavCounts = Record<AdminBadgeKey, number>;

export const EMPTY_NAV_COUNTS: AdminNavCounts = { revolut: 0, stripe: 0, emails: 0, le: 0, pieces: 0 };

export type AdminNavItem = {
  href: string;
  label: string;
  /** Nom d’icône de `components/crm/icons.tsx`. */
  icon: string;
  exact?: boolean;
  badge?: AdminBadgeKey;
  /** Ouvre dans un autre onglet (aperçu client). */
  newTab?: boolean;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export function adminNavGroups(input: { role?: "admin" | "agent" | "partner" | ""; showExample?: boolean }): AdminNavGroup[] {
  if (input.role === "partner") {
    return [
      {
        id: "boites",
        label: "Little Emperors",
        items: [{ href: "/admin/little-emperors", label: "Little Emperors", icon: "hotel", exact: true }],
      },
    ];
  }
  const groups: AdminNavGroup[] = [
    {
      id: "activite",
      label: "Activité",
      items: [{ href: "/admin", label: "Tableau de bord", icon: "dashboard", exact: true }],
    },
    {
      id: "clients",
      label: "Clients",
      items: [
        { href: "/admin/clients", label: "Clients", icon: "group" },
        { href: "/admin/clients?pieces=echeance", label: "Pièces à échéance", icon: "id_card", badge: "pieces" },
      ],
    },
    {
      id: "dossiers",
      label: "Dossiers",
      items: [
        { href: "/admin/reservations", label: "Réservations", icon: "luggage" },
        { href: "/admin/formalites", label: "Formalités", icon: "shield_check" },
        { href: "/admin/services", label: "Services à confirmer", icon: "headset" },
      ],
    },
    {
      id: "argent",
      label: "Argent",
      items: [
        { href: "/admin/transactions", label: "Transactions", icon: "landmark" },
        { href: "/admin/revolut", label: "Revolut", icon: "sync_alt" },
        { href: "/admin/stripe", label: "Stripe", icon: "credit_card" },
        { href: "/admin/pliant", label: "Pliant", icon: "credit_card" },
      ],
    },
    {
      id: "boites",
      label: "Boîtes de réception",
      items: [
        { href: "/admin/emails", label: "E-mails", icon: "mail", badge: "emails" },
        { href: "/admin/little-emperors", label: "Little Emperors", icon: "hotel", badge: "le" },
      ],
    },
    {
      id: "outils",
      label: "Outils",
      items: [
        { href: "/admin/outils/whatsapp", label: "Messages types WhatsApp", icon: "forum" },
        { href: "/admin/outils/mails", label: "E-mails au client", icon: "mail" },
        { href: "/admin/outils/gmail", label: "Diagnostic Gmail", icon: "activity" },
        ...(input.showExample
          ? [{ href: "/exemple", label: "Aperçu espace client", icon: "eye", newTab: true } satisfies AdminNavItem]
          : []),
      ],
    },
  ];
  if (input.role === "admin") {
    groups.push({
      id: "equipe",
      label: "Équipe",
      items: [{ href: "/admin/equipe", label: "Équipe", icon: "user_cog" }],
    });
  }
  return groups;
}

function splitHref(href: string) {
  const [withoutHash] = href.split("#");
  const [path, query = ""] = withoutHash.split("?");
  return { path, query: new URLSearchParams(query), hash: href.includes("#") };
}

/**
 * L’entrée active : le chemin le plus long qui préfixe la page, la requête (`?pieces=echeance`) l’emportant
 * sur l’entrée sans requête. Une ancre ne s’allume jamais. Null hors menu.
 */
export function activeAdminNavHref(groups: AdminNavGroup[], pathname: string, search = ""): string | null {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  let best: { href: string; score: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      const { path, query, hash } = splitHref(item.href);
      if (hash) continue;
      const matchesPath = item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
      if (!matchesPath) continue;
      let queryMatch = true;
      for (const [key, value] of query.entries()) {
        if (current.get(key) !== value) queryMatch = false;
      }
      if (!queryMatch) continue;
      const score = path.length * 10 + [...query.keys()].length;
      if (!best || score > best.score) best = { href: item.href, score };
    }
  }
  return best?.href ?? null;
}

export function adminNavBadge(item: Pick<AdminNavItem, "badge">, counts: AdminNavCounts) {
  if (!item.badge) return null;
  const value = counts[item.badge] || 0;
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

/** Barre basse téléphone : cinq entrées, « Plus » ouvre la feuille. */
export type AdminMobileTab = {
  id: "accueil" | "clients" | "dossiers" | "argent" | "plus";
  label: string;
  icon: string;
  href?: string;
  /** Chemins qui allument l’onglet. */
  paths: string[];
  badges: AdminBadgeKey[];
};

export const ADMIN_MOBILE_TABS: AdminMobileTab[] = [
  { id: "accueil", label: "Accueil", icon: "home", href: "/admin", paths: ["/admin"], badges: [] },
  { id: "clients", label: "Clients", icon: "group", href: "/admin/clients", paths: ["/admin/clients"], badges: [] },
  {
    id: "dossiers",
    label: "Dossiers",
    icon: "luggage",
    href: "/admin/reservations",
    paths: ["/admin/reservations", "/admin/formalites", "/admin/services"],
    badges: [],
  },
  {
    id: "argent",
    label: "Argent",
    icon: "landmark",
    href: "/admin/transactions",
    paths: ["/admin/transactions", "/admin/revolut", "/admin/stripe", "/admin/pliant"],
    badges: [],
  },
  {
    id: "plus",
    label: "Plus",
    icon: "more_horiz",
    paths: ["/admin/emails", "/admin/little-emperors", "/admin/outils", "/admin/equipe"],
    badges: ["emails", "le"],
  },
];

export function mobileTabActive(tab: AdminMobileTab, pathname: string) {
  return tab.paths.some((path) => (path === "/admin" ? pathname === path : pathname === path || pathname.startsWith(`${path}/`)));
}

export function mobileTabBadge(tab: AdminMobileTab, counts: AdminNavCounts) {
  const total = tab.badges.reduce((sum, key) => sum + (counts[key] || 0), 0);
  return total > 0 ? total : null;
}

/** Titre court de l’en-tête téléphone : l’entrée du menu, sinon la page connue, sinon « Espace agence ». */
export function adminPageTitle(groups: AdminNavGroup[], pathname: string, search = "") {
  if (pathname === "/admin/reservations/nouveau") return "Nouveau dossier";
  if (/^\/admin\/reservations\/[^/]+/.test(pathname)) return "Dossier";
  if (/^\/admin\/clients\/[^/]+/.test(pathname)) return "Fiche client";
  if (pathname.startsWith("/admin/transactions/client/")) return "Transactions du client";
  if (pathname === "/admin/recherche") return "Recherche";
  const active = activeAdminNavHref(groups, pathname, search);
  const item = groups.flatMap((group) => group.items).find((entry) => entry.href === active);
  return item?.label || "Espace agence";
}

/** Groupes de la feuille « Plus » du téléphone : ce que la barre basse ne porte pas. */
export const MORE_SHEET_GROUP_IDS = ["boites", "outils", "equipe"] as const;

export function moreSheetGroups(groups: AdminNavGroup[]) {
  return groups.filter((group) => (MORE_SHEET_GROUP_IDS as readonly string[]).includes(group.id));
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
