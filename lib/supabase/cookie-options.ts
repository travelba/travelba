/** Durée maximale acceptée par Chrome. Au-delà, le navigateur raccourcit. */
export const AUTH_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/**
 * Cookies Auth de l’agence : 400 jours, SameSite=Lax, lisibles par le navigateur.
 * Ne pas durcir ici : le rafraîchissement staff reste celui du client Supabase.
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: AUTH_COOKIE_MAX_AGE,
};

/**
 * Session client. Posée par le serveur (HttpOnly, Secure) : Safari ne la plafonne pas
 * à 7 jours, contrairement à un cookie écrit par `document.cookie`.
 */
export function clientAuthCookieOptions(secure: boolean) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true as const,
    secure,
    maxAge: AUTH_COOKIE_MAX_AGE,
  };
}
