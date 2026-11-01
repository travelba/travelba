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
 * Session client, posée par le serveur.
 * `Expires` (date RFC) et `Max-Age` ensemble : un cookie qui n’a que `Max-Age`,
 * écrit par `document.cookie`, est traité comme un cookie de session par Safari
 * iOS dès que l’app ou l’onglet est fermé. Le mot de passe doit alors être ressaisi.
 */
export function clientAuthCookieOptions(secure: boolean, now = Date.now()) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true as const,
    secure,
    maxAge: AUTH_COOKIE_MAX_AGE,
    expires: new Date(now + AUTH_COOKIE_MAX_AGE * 1000),
  };
}
