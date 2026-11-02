export type Detail = { kicker: string; title: string; text: string };

/** Faits illustratifs. Aucun client nommé. */
export const DETAILS: Record<string, Detail> = {
  application: {
    kicker: "Exemple",
    title: "Un vol change : le carnet est déjà à jour.",
    text: "Nouvelle place, voiture et hôtel alignés.",
  },
  club: {
    kicker: "Le Club",
    title: "Petit-déjeuner, surclassement, jusqu’à 200 $ de crédit par séjour.",
    text: "Selon l’hôtel. Confirmé avant l’arrivée.",
  },
  "sur-mesure": {
    kicker: "Sur mesure",
    title: "La table est demandée, même un soir complet.",
    text: "Vol, voiture, accueil et conseiller 24h/24 autour.",
  },
  kids: {
    kicker: "Famille",
    title: "Le siège enfant est déjà dans la voiture.",
    text: "Dès l’aéroport. Nounou confirmée avant le départ, si vous la demandez.",
  },
  seminaires: {
    kicker: "Groupe",
    title: "Chambres, salle et retours sont écrits avant le jour.",
    text: "Un vol bouge : un seul interlocuteur reprend la place.",
  },
  professionnels: {
    kicker: "Entreprise",
    title: "La règle d’abord, le déplacement ensuite.",
    text: "Cabines, hôtels, facture société. Réservation tenue par l’agence, 24h/24.",
  },
  "a-deux": {
    kicker: "À deux",
    title: "Chambre, table, attention dans la suite.",
    text: "Préparés avant l’arrivée. Le programme reste court.",
  },
  ski: {
    kicker: "Ski",
    title: "La voiture attend en bas de la vallée.",
    text: "Skis et sièges enfants confirmés. Cours et table du soir dans le carnet.",
  },
  "jet-prive": {
    kicker: "Jet privé",
    title: "L’avion part seulement une fois confirmé.",
    text: "À l’arrivée : quelqu’un, une voiture, l’hôtel si vous passez la nuit.",
  },
  chauffeur: {
    kicker: "Chauffeur",
    title: "La voiture est à l’heure dite.",
    text: "Aéroport, table, hôtel. Siège enfant déjà installé, s’il a été demandé.",
  },
  "accueil-vip": {
    kicker: "Accueil",
    title: "Quelqu’un vous attend à la porte de l’avion.",
    text: "Passage, salon si l’aéroport l’ouvre, puis la voiture.",
  },
  restaurants: {
    kicker: "Table",
    title: "La table est confirmée, pas promise.",
    text: "Les adresses complètes se demandent. L’heure est dans le carnet.",
  },
  hotels: {
    kicker: "Hôtel",
    title: "La chambre est demandée par son nom.",
    text: "Petit-déjeuner, horaires, surclassement et crédit : seulement si l’hôtel confirme.",
  },
  clubs: {
    kicker: "Club",
    title: "L’entrée est demandée avant la soirée.",
    text: "La voiture connaît l’heure. Pas de file le soir même.",
  },
  celebrations: {
    kicker: "Célébration",
    title: "Le soir est tenu, et le lendemain matin aussi.",
    text: "Maison, table, arrivées des invités. Un conseiller pendant la journée.",
  },
  anniversaire: {
    kicker: "Anniversaire",
    title: "Chambre, attention, table : prêts avant vous.",
    text: "Rien à réorganiser à l’arrivée.",
  },
  evg: {
    kicker: "EVG",
    title: "Chambres, voitures, table : le groupe sait où aller.",
    text: "Un vol bouge : la maison sait qui manque.",
  },
  prestige: {
    kicker: "Prestige",
    title: "L’accès se demande. La nuit et la voiture aussi.",
    text: "Roland-Garros, Formule 1, gala : l’hôtel et le retour sont tenus avec la place.",
  },
  evenements: {
    kicker: "Événement",
    title: "Lieu, chambres, heures, départ.",
    text: "Un seul interlocuteur, du brief au dernier départ.",
  },
};
