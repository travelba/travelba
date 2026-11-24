/** Listes du formulaire. Aucune dépendance serveur : le navigateur les importe. */

export const HEARD_ABOUT = [
  "Un proche",
  "Instagram",
  "Google",
  "Recommandation",
  "L’agence m’a écrit",
  "Autre",
] as const;

export const SIGNUP_COOKIE = "tb_signup";

export const TRAVEL_CLUB_NAME = "Travel Club TBA";
export const TRAVEL_CLUB_RANK = "Platinum";
/** Phrase client. Pas de montant. Pas de « votre gestionnaire ». */
export const TRAVEL_CLUB_OFFER =
  "Le Travel Club TBA a le plaisir de vous offrir l’adhésion Platinum jusqu’au 31 décembre 2026. Cette adhésion est nominative et réservée à vos propres réservations.";

/**
 * Attentions de l’invitation, reprises du catalogue Platinum.
 * Pas de montant, pas de pourcentage, pas de « votre gestionnaire ».
 */
export const TRAVEL_CLUB_PRIVILEGES = [
  "Un catalogue d’hôtels aux conditions qui vous sont réservées.",
  "Le petit-déjeuner est offert.",
  "Le surclassement est prioritaire, selon l’hôtel.",
  "L’arrivée peut être anticipée, le départ tardif, selon l’hôtel.",
  "Le transfert depuis l’aéroport, selon l’hôtel.",
] as const;
export const REFERRAL_CAP = 10;
export const CLUB_RENEWAL_NOTICE_DAYS = 45;
