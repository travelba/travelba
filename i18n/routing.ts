import { defineRouting } from "next-intl/routing";

/**
 * Sans `maxAge`, next-intl pose `NEXT_LOCALE` comme cookie de session (aucune date).
 * Sur l’iPhone, un cookie de session à côté du cookie de connexion fait perdre
 * la session dès que Safari ou l’icône de l’écran d’accueil se ferme.
 */
export const LOCALE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  localeCookie: {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
  },
});
