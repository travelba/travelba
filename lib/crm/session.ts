import { safeInternalPath } from "./safe-path";

export const SET_PASSWORD_PATH = "/connexion/mot-de-passe";
export const ONBOARDING_PATH = "/mon-compte/bienvenue";
export const MIN_PASSWORD_LENGTH = 8;

export function mustSetPassword(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  return user.app_metadata?.must_set_password === true;
}

/** Première entrée seulement : flag posé au mot de passe, retiré quand on passe ou qu’on termine. */
export function needsClientOnboarding(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  const meta = user.app_metadata;
  if (!meta || meta.client_onboarding_done === true) return false;
  return meta.client_onboarding_pending === true;
}

export function withOnboardingPending(meta: Record<string, unknown>): Record<string, unknown> {
  if (meta.client_onboarding_done === true) {
    return { ...meta, client_onboarding_pending: false };
  }
  return { ...meta, client_onboarding_pending: true };
}

export function withOnboardingDone(meta: Record<string, unknown>): Record<string, unknown> {
  return {
    ...meta,
    client_onboarding_pending: false,
    client_onboarding_done: true,
  };
}

/** Posé seulement par un lien d’invitation ou de récupération. Une visite de /connexion ne l’a pas. */
export const PASSWORD_SETUP_COOKIE = "tb_pw";

export function shouldForcePasswordSetup(opts: {
  flagged: boolean;
  type: string | null;
  next: string;
}) {
  if (opts.type === "magiclink") return false;
  if (opts.type === "recovery" || opts.type === "invite") return true;
  if (opts.type) return false;
  const path = opts.next.split("?")[0];
  return path === SET_PASSWORD_PATH;
}

/** Le mot de passe a déjà été choisi dans l’espace. Le drapeau peut rester à tort. */
export function hasChosenPassword(user: {
  app_metadata?: Record<string, unknown> | null;
} | null | undefined) {
  const stamp = user?.app_metadata?.password_set_at;
  return typeof stamp === "string" && stamp.length > 0;
}

/**
 * Visite de /connexion, hors lien. null = afficher le formulaire.
 * Le drapeau seul ne renvoie jamais vers « définir un mot de passe ».
 */
export function destinationForConnexionVisit(opts: {
  staff: boolean;
  mustSetPassword: boolean;
  needsOnboarding: boolean;
  hasPassword: boolean;
}) {
  if (!opts.staff && opts.mustSetPassword && !opts.hasPassword) return null;
  return signedInClientDestination({
    staff: opts.staff,
    mustSetPassword: false,
    needsOnboarding: opts.needsOnboarding,
  });
}

/**
 * Ouverte pendant le lien d’invitation (cookie), y compris pour un partenaire MyLER,
 * tant que le mot de passe n’est pas choisi. `staff` reste dans l’appel : le cookie décide.
 */
export function mayShowPasswordSetup(opts: {
  mustSetPassword: boolean;
  hasPassword: boolean;
  staff: boolean;
  setupCookie: boolean;
}) {
  void opts.staff;
  if (opts.hasPassword || !opts.mustSetPassword) return false;
  return opts.setupCookie;
}

export const PARTNER_ADMIN_HOME = "/admin/little-emperors";

export function pathAfterPassword(
  _phone: string | null | undefined,
  audience: "client" | "staff" | "partner" = "client"
) {
  if (audience === "partner") return PARTNER_ADMIN_HOME;
  if (audience === "staff") return "/admin";
  return "/mon-compte";
}

/** Après le mot de passe : bienvenue une fois, puis l’accueil. Le téléphone ne ferme pas le compte. */
export function destinationAfterPassword(
  meta: Record<string, unknown>,
  phone: string | null | undefined
) {
  if (needsClientOnboarding({ app_metadata: meta })) return ONBOARDING_PATH;
  return pathAfterPassword(phone);
}

export function signedInClientDestination(opts: {
  mustSetPassword: boolean;
  needsOnboarding: boolean;
  staff: boolean;
}) {
  if (opts.staff) return "/admin";
  if (opts.mustSetPassword) return SET_PASSWORD_PATH;
  if (opts.needsOnboarding) return ONBOARDING_PATH;
  return "/mon-compte";
}

/** Connexion par le mot de passe déjà choisi : ne jamais rouvrir la page de définition. */
export function pathAfterKnownPassword(opts: {
  staff: boolean;
  needsOnboarding: boolean;
  next?: string | null;
}) {
  if (opts.staff) return "/admin";
  if (opts.needsOnboarding) return ONBOARDING_PATH;
  const next = safeInternalPath(opts.next, "/mon-compte");
  const path = next.split("?")[0];
  if (path.startsWith("/admin") || path === SET_PASSWORD_PATH || path === "/connexion") {
    return "/mon-compte";
  }
  return next;
}

/** Retire le drapeau sans toucher au mot de passe ni au reste des métadonnées. */
export function withoutMustSetPassword(meta: Record<string, unknown>): Record<string, unknown> {
  if (meta.must_set_password !== true) return { ...meta };
  return { ...meta, must_set_password: false };
}

/** Redirection dans /mon-compte, ou null pour laisser passer. */
export function clientAreaRedirect(
  pathname: string,
  opts: { mustSetPassword: boolean; needsOnboarding: boolean }
) {
  if (opts.mustSetPassword) return SET_PASSWORD_PATH;
  if (opts.needsOnboarding && pathname !== ONBOARDING_PATH) return ONBOARDING_PATH;
  if (!opts.needsOnboarding && pathname === ONBOARDING_PATH) return "/mon-compte";
  return null;
}

export function isStaffRole(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  const role = user.app_metadata?.crm_role;
  return role === "admin" || role === "agent";
}

/** Hors de la page Little Emperors, le partenaire y est renvoyé. Null = la page est la sienne. */
export function partnerAdminDestination(pathname: string): string | null {
  if (pathname === PARTNER_ADMIN_HOME || pathname.startsWith(`${PARTNER_ADMIN_HOME}/`)) return null;
  return PARTNER_ADMIN_HOME;
}
