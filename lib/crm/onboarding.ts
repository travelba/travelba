import { HOTEL_ACCESS_COPY } from "@/lib/crm/hotel-access";
import {
  HOTEL_ACCESS_LEVEL,
  HOTEL_ACCESS_LINES,
  HOTEL_ACCESS_PROMISE,
  HOTEL_ACCESS_RESERVE,
  HOTEL_ACCESS_UNTIL,
} from "@/lib/crm/hotel-search-home";

export const ONBOARDING_SKIP_LABEL = "Passer";
export const ONBOARDING_BACK_LABEL = "Retour";
export const ONBOARDING_NEXT_LABEL = "Suivant";
export const ONBOARDING_REPLAY_LABEL = "Revoir la visite";

/** Même date que la carte Club, dans la phrase de la bienvenue. */
function clubOfferedLegend() {
  const until = HOTEL_ACCESS_UNTIL.replace(/^Jusqu[’']/, "jusqu’");
  return `Votre carte est offerte ${until}.`;
}

/**
 * Une étape par capture de l’espace client, dans l’ordre des pages.
 * Le Club ferme la visite : les textes viennent du produit, sans avantage ajouté.
 */
export const CLIENT_ONBOARDING_STEPS = [
  {
    id: "connexion",
    image: "/onboarding/04-connexion.webp",
    title: "Un espace client privé, ouvert sur invitation",
    legend:
      "Chaque voyageur reçoit son accès par e-mail ou sur WhatsApp. Il retrouve ses voyages sur son téléphone comme sur son ordinateur, sans application à installer.",
  },
  {
    id: "accueil",
    image: "/onboarding/05-accueil.webp",
    title: "Tous les voyages de l’entreprise, d’un coup d’œil",
    legend:
      "Le prochain départ en tête : compte à rebours, météo de la destination et carte du prochain vol, à ajouter au calendrier.",
  },
  {
    id: "a-venir",
    image: "/onboarding/05-a-venir.webp",
    title: "Tous les voyages de l’entreprise, d’un coup d’œil",
    legend:
      "À venir et passés : chaque dossier avec sa référence, ses dates, son montant et la société qui le règle.",
  },
  {
    id: "a-jour",
    image: "/onboarding/05-a-jour.webp",
    title: "Tous les voyages de l’entreprise, d’un coup d’œil",
    legend:
      "Toujours à jour : l’agence publie et met à jour les carnets, le voyageur voit la dernière version.",
  },
  {
    id: "itineraire",
    image: "/onboarding/06-itineraire.webp",
    title: "Chaque étape du voyage, dans l’ordre, avec ses pièces",
    legend:
      "Vols, hôtels, transferts, chauffeurs, accueil VIP à l’aéroport, trains et activités, du départ au retour.",
  },
  {
    id: "pieces",
    image: "/onboarding/06-pieces.webp",
    title: "Chaque étape du voyage, dans l’ordre, avec ses pièces",
    legend:
      "Billets, confirmations d’hôtel et bons de transfert se consultent depuis le carnet. La page du voyage s’envoie en un geste.",
  },
  {
    id: "whatsapp",
    image: "/onboarding/07-whatsapp.webp",
    title: "L’espace client s’ouvre depuis WhatsApp",
    legend: "Le canal que vos collaborateurs consultent déjà, sans mot de passe à retenir.",
  },
  {
    id: "concierge",
    image: "/onboarding/08-concierge.webp",
    title: "Le Concierge suit chaque vol et répond à vos voyageurs",
    legend:
      "Le voyageur écrit au Concierge : l’heure du chauffeur, l’hôtel, le vol. La réponse s’appuie sur son carnet.",
  },
  {
    id: "encours",
    image: "/onboarding/09-encours.webp",
    title: "L’encours de chaque voyage, réglé en quelques secondes",
    legend:
      "Le reste à régler et le grand livre de chaque dossier : débits, virements et prélèvements reçus.",
  },
  {
    id: "paiement",
    image: "/onboarding/09-paiement.webp",
    title: "L’encours de chaque voyage, réglé en quelques secondes",
    legend:
      "Carte bancaire et Apple Pay via Stripe, prélèvement SEPA sur le compte de la société, ou virement.",
  },
  {
    id: "coffre",
    image: "/onboarding/10-coffre.webp",
    title: "Passeports, ESTA, ETA et visas : rien n’est oublié",
    legend:
      "Photo ou PDF : un ou plusieurs passeports sur le même fichier, chaque voyageur est importé avec ses dates de validité.",
  },
  {
    id: "hotels-catalogue",
    image: "/onboarding/11-hotels-catalogue.webp",
    title: "Vos hôtels, aux tarifs qui vous sont réservés",
    legend: HOTEL_ACCESS_PROMISE,
  },
  {
    id: "hotels-club",
    image: "/onboarding/12-hotels-club.webp",
    title: `Le Club Travel BA, niveau ${HOTEL_ACCESS_LEVEL}`,
    legend: clubOfferedLegend(),
  },
  {
    id: "hotels-avantages",
    image: "/onboarding/13-hotels-avantages.webp",
    title: "Les avantages réservés à nos clients",
    legend: `${HOTEL_ACCESS_LINES.join(". ")}. ${HOTEL_ACCESS_RESERVE}`,
  },
  {
    id: "hotels-parcours",
    image: "/onboarding/14-hotels-parcours.webp",
    title: "Vous choisissez, l’hôtel confirme",
    legend: `${HOTEL_ACCESS_COPY.benefits.join(". ")}.`,
  },
] as const;

export type OnboardingStepId = (typeof CLIENT_ONBOARDING_STEPS)[number]["id"];

export function onboardingCopyBlob() {
  const steps = CLIENT_ONBOARDING_STEPS.flatMap((step) => [step.title, step.legend]);
  return [
    ...steps,
    ONBOARDING_SKIP_LABEL,
    ONBOARDING_BACK_LABEL,
    ONBOARDING_NEXT_LABEL,
    ONBOARDING_REPLAY_LABEL,
  ].join("\n");
}
