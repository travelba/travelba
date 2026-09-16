export const SET_PASSWORD_PATH = "/connexion/mot-de-passe";
export const MIN_PASSWORD_LENGTH = 8;

export function mustSetPassword(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  return user.app_metadata?.must_set_password === true;
}

export function isStaffRole(user: {
  app_metadata?: Record<string, unknown> | null;
}) {
  const role = user.app_metadata?.crm_role;
  return role === "admin" || role === "agent";
}
