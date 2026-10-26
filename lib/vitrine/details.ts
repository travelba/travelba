export type Detail = { kicker: string; title: string; text: string };

/** Scènes illustratives. Aucun client nommé. */
export const DETAILS: Record<string, Detail> = {
  application: {
    kicker: "Le détail",
    title: "Le vol repris, avant l’appel.",
    text: "Un horaire bouge. Le conseiller reprend la place et met le carnet à jour. Le voyageur lit la nouvelle heure dans l’application, avec la voiture et l’hôtel déjà alignés.",
  },
  club: {
    kicker: "Le détail",
    title: "La chambre, demandée par son nom.",
    text: "Le conseiller demande la catégorie et, lorsqu’elle existe, la chambre. Le petit-déjeuner, l’arrivée anticipée, le départ tardif et le crédit, jusqu’à 200 dollars selon l’hôtel, n’entrent dans le carnet que s’ils sont confirmés.",
  },
  "sur-mesure": {
    kicker: "Le détail",
    title: "La table, le soir où tout affiche complet.",
    text: "La maison la demande tôt. Elle n’est inscrite que lorsqu’elle est tenue. Autour : le vol, la voiture, l’accueil à la sortie de l’avion, et un conseiller joignable à toute heure.",
  },
  kids: {
    kicker: "Le détail",
    title: "Le siège est déjà dans la voiture.",
    text: "Siège bébé ou sièges enfants, dès l’aéroport. Le club est choisi selon les âges. Une nounou, si vous la demandez, est confirmée avant le départ et apparaît dans le carnet comme un rendez-vous.",
  },
  seminaires: {
    kicker: "Le détail",
    title: "Les arrivées, déjà rangées.",
    text: "Chambres, salle, dîners et retours sont écrits avant le jour. Si un vol bouge, un seul interlocuteur reprend la place et prévient le groupe.",
  },
  professionnels: {
    kicker: "Le détail",
    title: "La politique, puis le déplacement.",
    text: "Cabines, maisons, facture au nom de la société : la règle est écrite avec l’entreprise. Le collaborateur ouvre son carnet. La réservation reste tenue par l’agence, de jour comme de nuit.",
  },
  "a-deux": {
    kicker: "Le détail",
    title: "Une attention, déjà dans la suite.",
    text: "Un anniversaire se prépare avec la maison : la chambre, la table, parfois une attention déposée avant l’arrivée. Le programme reste court. Les heures vides sont voulues.",
  },
  ski: {
    kicker: "Le détail",
    title: "La voiture attend au bas de la vallée.",
    text: "Train ou vol, puis le transfert. Les skis et les sièges des enfants se confirment. Les cours et la table du soir sont dans le carnet de la semaine.",
  },
  "jet-prive": {
    kicker: "Le détail",
    title: "L’appareil, puis le sol.",
    text: "Le vol privé ne part que lorsqu’il est confirmé. À l’autre piste, quelqu’un attend. La voiture est là. L’hôtel, s’il y a une nuit, est déjà demandé.",
  },
  chauffeur: {
    kicker: "Le détail",
    title: "La berline, à l’heure dite.",
    text: "Aéroport, table, hôtel, route entre deux maisons. Le chauffeur connaît l’étape suivante. Le siège enfant, s’il a été demandé, est déjà installé.",
  },
  "accueil-vip": {
    kicker: "Le détail",
    title: "Quelqu’un, à la porte de l’avion.",
    text: "Le nom, le passage, le salon lorsque l’aéroport le permet, puis la voiture. Le carnet montre l’heure et le point de rencontre.",
  },
  restaurants: {
    kicker: "Le détail",
    title: "La table tenue, pas promise.",
    text: "Les adresses réputées complètes se demandent. Elles n’apparaissent dans le séjour que lorsque la maison les a. L’heure est dans le carnet.",
  },
  hotels: {
    kicker: "Le détail",
    title: "La maison choisie de l’intérieur.",
    text: "Les conseillers connaissent les chambres, les ailes, les heures qui comptent. Le Club — petit-déjeuner, horaires, surclassement si une chambre est libre, crédit selon l’hôtel — se confirme avant l’arrivée.",
  },
  clubs: {
    kicker: "Le détail",
    title: "L’entrée, demandée à l’avance.",
    text: "La table ou l’accès se tient avant la soirée. La voiture connaît l’heure. Rien n’est laissé à la file du soir même.",
  },
  celebrations: {
    kicker: "Le détail",
    title: "Le jour, et le lendemain matin.",
    text: "La maison, la table, les arrivées des invités. Le petit-déjeuner du lendemain est déjà pensé. Un conseiller reste joignable pendant la journée.",
  },
  anniversaire: {
    kicker: "Le détail",
    title: "L’attention, préparée avant vous.",
    text: "La chambre demandée, une attention dans la suite, la table du soir. Le voyageur n’a pas à le réorganiser à l’arrivée.",
  },
  evg: {
    kicker: "Le détail",
    title: "Le groupe, tenu sans bruit.",
    text: "Chambres, horaires, voiture, table. Chacun sait où aller. La maison sait qui manque si un vol bouge.",
  },
  prestige: {
    kicker: "Le détail",
    title: "Autour de la place, le séjour.",
    text: "Roland-Garros, la Formule 1, un gala : l’accès se demande. La nuit d’avant, la voiture et le retour sont tenus avec lui.",
  },
  evenements: {
    kicker: "Le détail",
    title: "Le lieu, puis toute la logistique.",
    text: "Un événement privé ou d’entreprise se tient comme un séjour : arrivées, chambres, heures, départ. Un seul fil avec la maison.",
  },
};
