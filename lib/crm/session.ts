export const SET_PASSWORD_PATH = "/connexion/mot-de-passe";
export const MIN_PASSWORD_LENGTH = 8;

export function mustSetPassword(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  return user.app_metadata?.must_set_password === true;
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

export function pathAfterPassword(phone: string | null | undefined) {
  return phone?.trim() ? "/mon-compte" : "/mon-compte/profil";
}

export function isStaffRole(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  const role = user.app_metadata?.crm_role;
  return role === "admin" || role === "agent";
}
