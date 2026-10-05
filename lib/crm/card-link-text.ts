/**
 * Partie du lien carte sans dépendance serveur : importable par les modules partagés avec le
 * navigateur (hotel-desk.ts). La génération et l’empreinte du code vivent dans card-link.ts.
 */

export const CARD_LINK_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Douze signes : 60 bits, l’URL reste lisible dans un e-mail. */
export const CARD_LINK_CODE_LENGTH = 12;

const LINK_PATTERN = new RegExp(
  `https?://[^\\s/]+/k/[${CARD_LINK_ALPHABET}]{${CARD_LINK_CODE_LENGTH}}(?![${CARD_LINK_ALPHABET}])`,
  "g"
);

/** Copie gardée au dossier, réponse d’hôtel qui cite le courrier : le lien n’y reste jamais. */
export function redactCardLinks(text: string) {
  return text.replace(LINK_PATTERN, "[lien carte sécurisé]");
}
