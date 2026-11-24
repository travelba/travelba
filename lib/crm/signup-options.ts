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

/** Trois lignes de l’invitation. Pas de montant, pas de « votre gestionnaire ». */
export const TRAVEL_CLUB_PRIVILEGES = [
  {
    icon: "hotel",
    title: "Hôtels d’exception",
    note: "Un catalogue d’hôtels qui vous est réservé.",
  },
  {
    icon: "coffee",
    title: "Avantages membres",
    note: "Petit-déjeuner offert. Surclassement prioritaire, selon l’hôtel.",
  },
  {
    icon: "headset",
    title: "Conciergerie dédiée",
    note: "Le Concierge suit le séjour et répond.",
  },
] as const;
export const REFERRAL_CAP = 10;
export const CLUB_RENEWAL_NOTICE_DAYS = 45;
