/** Cookies Auth persistants (limite Chrome ~ 400 jours). */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 400 * 24 * 60 * 60,
};
