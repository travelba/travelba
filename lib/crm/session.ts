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

export function shouldForcePasswordSetup(opts: {
  flagged: boolean;
  type: string | null;
  next: string;
}) {
  if (opts.flagged) return true;
  if (opts.type === "recovery" || opts.type === "invite") return true;
  const path = opts.next.split("?")[0];
  return path === SET_PASSWORD_PATH;
}

export function pathAfterPassword(
  _phone: string | null | undefined,
  audience: "client" | "staff" = "client"
) {
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
  const next = opts.next || "";
  const path = next.split("?")[0];
  if (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/admin") &&
    path !== SET_PASSWORD_PATH &&
    path !== "/connexion"
  ) {
    return next;
  }
  return "/mon-compte";
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
