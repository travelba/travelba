/** Phrases de l’attente hôtels. Une seule liste, pour la recherche et la fiche. */

export const HOTEL_WAIT_LINES = [
  "On s’occupe de vous.",
  "Nous cherchons le meilleur tarif pour vous.",
  "Vous êtes un client VIP.",
  "Une sélection d’hôtels réservée à nos clients.",
  "Nos conseillers comparent les tarifs en temps réel.",
] as const;

export function hotelWaitLine(index: number) {
  const count = HOTEL_WAIT_LINES.length;
  const at = ((index % count) + count) % count;
  return HOTEL_WAIT_LINES[at];
}
