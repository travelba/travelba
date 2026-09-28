import { siteConfig } from "../site";

/** App Store unlisted : le modèle TBA est l’invitation, pas la recherche publique. */
export const ESPACE_DISTRIBUTION = "unlisted" as const;
export const ESPACE_PLATFORMS = ["iphone"] as const;
export const ESPACE_BUNDLE_ID = "fr.travelba.espace";
export const ESPACE_SCHEME = "travelba";
export const ESPACE_APP_GROUP = "group.fr.travelba.espace";
export const ESPACE_DISPLAY_NAME = "TBA";
export const ESPACE_STORE_NAME = "TBA — Travel Business Agency";

export type EspaceDistribution = typeof ESPACE_DISTRIBUTION;
export type EspacePlatform = (typeof ESPACE_PLATFORMS)[number];

export function appleTeamId(env: NodeJS.ProcessEnv = process.env) {
  return (env.APPLE_TEAM_ID || "").trim();
}

export function appleAppId(teamId = appleTeamId()) {
  if (!teamId) return "";
  return `${teamId}.${ESPACE_BUNDLE_ID}`;
}

export const ESPACE_UNIVERSAL_PATHS = [
  "/e/*",
  "/e/c/*",
  "/auth/callback",
  "/auth/callback/*",
  "/mon-compte",
  "/mon-compte/*",
  "/connexion",
  "/connexion/*",
] as const;

export function associatedDomainHost(siteUrl = siteConfig.url) {
  try {
    return new URL(siteUrl).host;
  } catch {
    return "travelba.fr";
  }
}

export function appleAppSiteAssociation(teamId = appleTeamId()) {
  const appID = appleAppId(teamId);
  const apps = appID ? [appID] : [];
  const details = appID
    ? [
        {
          appID,
          paths: [...ESPACE_UNIVERSAL_PATHS],
        },
      ]
    : [];
  return {
    applinks: {
      apps: [] as string[],
      details,
    },
    webcredentials: {
      apps,
    },
    activitycontinuation: {
      apps,
    },
  };
}

export function privacyPolicyPath(locale: "fr" | "en" = "fr") {
  return `/${locale}/confidentialite`;
}

export function privacyPolicyUrl(origin = siteConfig.url, locale: "fr" | "en" = "fr") {
  return `${origin.replace(/\/$/, "")}${privacyPolicyPath(locale)}`;
}

export function appStoreReviewNotes() {
  return [
    "Application réservée aux clients invités par Travel Business Agency.",
    "Pas d’inscription publique. Compte reviewer fourni dans App Store Connect.",
    "Après connexion : Accueil (prochain séjour), Réservations, Transactions, Mon compte.",
    "Un séjour déjà publié doit être visible. Ne pas inventer d’horaires.",
    "WhatsApp ouvre l’agence (pas une messagerie interne).",
    "Pas d’encaissement carte dans l’app.",
  ].join(" ");
}

export function espaceStoreListing() {
  return {
    distribution: ESPACE_DISTRIBUTION,
    platforms: [...ESPACE_PLATFORMS],
    bundleId: ESPACE_BUNDLE_ID,
    scheme: ESPACE_SCHEME,
    displayName: ESPACE_DISPLAY_NAME,
    name: ESPACE_STORE_NAME,
    subtitle: "Votre carnet TBA",
    promotionalText: "Le carnet de voyage publié par l’agence, hors ligne, sur iPhone.",
    description: [
      "TBA est l’espace client de Travel Business Agency.",
      "Retrouvez votre prochain séjour, les cartes vol et hôtel, les pièces et l’encours.",
      "L’agence publie le carnet. Vous le consultez, même en avion.",
      "Écrivez-nous sur WhatsApp, 24/7.",
    ].join("\n\n"),
    keywords: "voyage,carnet,agence,TBA,itinéraire",
    supportUrl: siteConfig.url,
    marketingUrl: siteConfig.url,
    privacyUrl: privacyPolicyUrl(),
    copyright: `© ${new Date().getUTCFullYear()} ${siteConfig.legal.legalName}`,
    ageRating: "12+",
    reviewNotes: appStoreReviewNotes(),
    primaryLocale: "fr-FR",
  };
}

export function isEspaceUniversalPath(pathname: string) {
  const path = pathname.split("?")[0];
  if (path === "/e" || path.startsWith("/e/")) return true;
  if (path === "/auth/callback" || path.startsWith("/auth/callback/")) return true;
  if (path === "/mon-compte" || path.startsWith("/mon-compte/")) return true;
  if (path === "/connexion" || path.startsWith("/connexion/")) return true;
  return false;
}

export function espaceDeepLink(path: string, origin = siteConfig.url) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${origin.replace(/\/$/, "")}${clean}`;
}

export function espaceSchemeLink(path: string) {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${ESPACE_SCHEME}://${clean}`;
}
