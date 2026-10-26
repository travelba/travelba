import { shot } from "./photos";

export type ServiceSplit = {
  title: string;
  text: string;
  image: string;
  alt: string;
  href?: string;
  more?: string;
};

export type PreviewService = {
  slug: string;
  /** Clé du site actuel, ou ski pour la page déjà demandée. */
  siteKey: string | null;
  menu: string;
  description: string;
  universe: string;
  wa: string;
  heroTitle: string;
  heroEm: string;
  image: string;
  alt: string;
  manifesto: string;
  splits: [ServiceSplit, ServiceSplit, ServiceSplit];
  proseTitle: string;
  prose: string;
};

const carnet = {
  href: "/preview-refonte/espace-client",
  more: "Le carnet du séjour",
} as const;

export const previewServices: PreviewService[] = [
  {
    slug: "jet-prive",
    siteKey: "jet",
    menu: "Jet privé",
    description:
      "Affrètement d’avions privés, optimisation des itinéraires et confort absolu, du décollage à l’atterrissage.",
    universe: "jet",
    wa: "Bonjour, je souhaite parler d’un affrètement de jet privé avec Travel BA.",
    heroTitle: "Jet privé,",
    heroEm: "confirmé.",
    image: shot.jet,
    alt: "Avion d’affaires au sol, ciel clair",
    manifesto: "L’appareil et l’itinéraire se confirment avec la maison. Rien n’est promis avant cet accord.",
    splits: [
      {
        title: "L’itinéraire.",
        text: "Le trajet se dessine autour de l’agenda. L’agence confirme l’appareil. Le confort va du décollage à l’atterrissage.",
        image: shot.wing,
        alt: "Aile d’avion au-dessus des nuages",
      },
      {
        title: "Le dernier kilomètre.",
        text: "Chauffeur, transfert, accueil en aéroport. Le jet ne s’arrête pas à la piste : la maison tient aussi le sol.",
        image: shot.car,
        alt: "Berline sombre, profil",
      },
      {
        title: "Dans le carnet.",
        text: "Agence accréditée IATA 20291655. L’émission, lorsqu’il y a un billet, reste dans le carnet. L’heure n’est pas inventée ici.",
        image: shot.suite,
        alt: "Chambre claire, linge blanc",
        ...carnet,
      },
    ],
    proseTitle: "Autour du vol.",
    prose: "Séminaire, événement ou séjour sur mesure : le jet est un service parmi les autres, tenu par la même équipe.",
  },
  {
    slug: "seminaires",
    siteKey: "seminars",
    menu: "Séminaires",
    description: "Organisation complète de vos séminaires d’entreprise : lieux d’exception, logistique et animation.",
    universe: "seminaire",
    wa: "Bonjour, je prépare un séminaire et je souhaite en parler avec Travel BA.",
    heroTitle: "Séminaires,",
    heroEm: "tenus.",
    image: "photo-1540575467063-178a50c2df87",
    alt: "Salle de réunion, lumière du jour",
    manifesto: "Lieux, logistique, animation. Le groupe est un voyage d’entreprise, composé comme un séjour privé.",
    splits: [
      {
        title: "Le lieu.",
        text: "Salles et maisons d’exception. Marrakech en est une, parmi d’autres. Le choix se fait avec vous, pas dans un catalogue.",
        image: shot.koutoubia,
        alt: "Minaret et ciel clair",
      },
      {
        title: "La logistique.",
        text: "Arrivées, chambres, temps de travail, dîners. Chaque détail est coordonné. Rien n’est ajouté qui ne soit demandé.",
        image: shot.majorelle,
        alt: "Jardin bleu et ocre",
      },
      {
        title: "L’animation.",
        text: "La journée, puis le soir. Le carnet du groupe s’ouvre dans l’espace. La maison reste joignable à toute heure.",
        image: shot.lanterns,
        alt: "Ruelle le soir, lanternes",
        ...carnet,
      },
    ],
    proseTitle: "Entreprises et comités.",
    prose: "Basée à Levallois-Perret, la maison orchestre ces séjours pour les entreprises comme pour les particuliers exigeants.",
  },
  {
    slug: "evenements",
    siteKey: "events",
    menu: "Événements sur mesure",
    description: "Conception et production d’événements privés et corporate à la hauteur de vos ambitions.",
    universe: "evenement",
    wa: "Bonjour, je prépare un événement et je souhaite en parler avec Travel BA.",
    heroTitle: "L’événement,",
    heroEm: "composé.",
    image: "photo-1511795409834-ef04bbd61622",
    alt: "Table de réception, lumière basse",
    manifesto: "Privé ou corporate. La conception, le calendrier et la production sont tenus par la même équipe.",
    splits: [
      {
        title: "Le privé.",
        text: "Une célébration, un dîner, une maison. L’événement se pense autour des personnes, pas d’une formule.",
        image: shot.table,
        alt: "Table dressée, lumière basse",
      },
      {
        title: "Le corporate.",
        text: "Lancement, comité, soirée d’entreprise. La logistique suit le même soin que le séjour : arrivées, salles, retour.",
        image: shot.suite,
        alt: "Intérieur clair, lumière du matin",
      },
      {
        title: "Le calendrier.",
        text: "Les prestataires sont coordonnés par la maison. Le fil reste ouvert jusqu’au dernier détail, à toute heure.",
        image: shot.lanterns,
        alt: "Allée le soir",
        ...carnet,
      },
    ],
    proseTitle: "À la hauteur du projet.",
    prose: "Aucune offre standardisée : l’événement est conçu pour vous, avec un interlocuteur unique.",
  },
  {
    slug: "prestige",
    siteKey: "prestige",
    menu: "Événements de prestige",
    description:
      "Accès VIP aux plus grands rendez-vous : Roland-Garros, Formule 1, Coupe du monde, festivals et galas.",
    universe: "prestige",
    wa: "Bonjour, je souhaite un accès pour un événement de prestige et en parler avec Travel BA.",
    heroTitle: "Le rendez-vous,",
    heroEm: "tenu.",
    image: "photo-1554068865-24cecd4e34b8",
    alt: "Court de tennis, lumière du jour",
    manifesto: "Roland-Garros, Formule 1, Coupe du monde, festivals, galas. L’accès se demande. La maison le confirme.",
    splits: [
      {
        title: "Le grand rendez-vous.",
        text: "Le jour, le lieu, les personnes. L’accès VIP se prépare avec l’agenda, pas au dernier moment improvisé.",
        image: "photo-1554068865-24cecd4e34b8",
        alt: "Court et gradins, ciel clair",
      },
      {
        title: "Autour.",
        text: "Hôtel, table, chauffeur, accueil. Le rendez-vous n’est pas une place isolée : c’est un séjour court, entier.",
        image: shot.car,
        alt: "Berline, profil",
      },
      {
        title: "La discrétion.",
        text: "Confidentialité au cœur de la prestation. Le carnet ne montre que ce qui vous est destiné.",
        image: shot.suite,
        alt: "Chambre, linge blanc",
        ...carnet,
      },
    ],
    proseTitle: "Le même soin qu’un voyage.",
    prose: "Festivals et galas suivent la même chaîne : brief, organisation, et quelqu’un de joignable pendant l’événement.",
  },
  {
    slug: "hotels",
    siteKey: "hotels",
    menu: "Hôtels & hébergements",
    description: "Accès privilégié aux meilleurs palaces, villas et adresses confidentielles partout dans le monde.",
    universe: "hotel",
    wa: "Bonjour, je cherche un hôtel ou une maison et je souhaite en parler avec Travel BA.",
    heroTitle: "La maison,",
    heroEm: "choisie.",
    image: "photo-1566073771259-6a8506099945",
    alt: "Façade d’hôtel et piscine, lumière du jour",
    manifesto: "Palaces, villas, adresses plus discrètes. L’accès se confirme avec vous, avant l’arrivée.",
    splits: [
      {
        title: "Le palace.",
        text: "Lorsque le séjour appelle un grand hôtel. Les avantages du tarif — petit-déjeuner, surclassement, crédit — seulement s’ils sont prévus, et une fois confirmés.",
        image: shot.suite,
        alt: "Chambre claire, lumière du matin",
      },
      {
        title: "La villa.",
        text: "Une maison pour le groupe ou la famille. Les nuits, les heures et l’adresse tiennent dans le carnet.",
        image: shot.maldives,
        alt: "Eau claire et ponton",
      },
      {
        title: "L’adresse confidentielle.",
        text: "Moins visible, même exigence. La maison reste l’interlocuteur. Le séjour s’ouvre dans l’espace.",
        image: shot.kyoto,
        alt: "Allée calme, lumière douce",
        ...carnet,
      },
    ],
    proseTitle: "Partout, le même geste.",
    prose: "L’hébergement fait partie de la chaîne, avec le vol, la table et le transfert. Un interlocuteur unique.",
  },
  {
    slug: "restaurants",
    siteKey: "restaurants",
    menu: "Restaurants & tables",
    description: "Réservations dans les meilleures tables et adresses étoilées, même complètes, partout dans le monde.",
    universe: "restaurant",
    wa: "Bonjour, je souhaite une table et en parler avec Travel BA.",
    heroTitle: "La table,",
    heroEm: "demandée.",
    image: "photo-1517248135467-4c7edcad34c4",
    alt: "Salle de restaurant, lumière chaude",
    manifesto: "La demande part à la maison. Rien n’est réservé seul. Une table complète se tente, elle se confirme.",
    splits: [
      {
        title: "L’adresse.",
        text: "Tables et maisons étoilées, le soir du séjour. Le choix se fait avec vous, selon la ville où l’on reste.",
        image: shot.table,
        alt: "Table dressée",
      },
      {
        title: "Même complète.",
        text: "La demande est portée par l’agence. La confirmation revient avant que le carnet ne l’écrive.",
        image: "photo-1414235077428-338989a2e8c0",
        alt: "Assiette et lumière basse",
      },
      {
        title: "Avec le séjour.",
        text: "La table suit l’hôtel, l’événement ou le voyage. Elle n’est pas un service à part de la maison.",
        image: shot.lanterns,
        alt: "Rue le soir",
        ...carnet,
      },
    ],
    proseTitle: "Partout dans le monde.",
    prose: "La réservation reste un geste de la maison, au même titre que l’hôtel ou le chauffeur.",
  },
  {
    slug: "clubs",
    siteKey: "clubs",
    menu: "Clubs & vie nocturne",
    description: "Accès aux clubs les plus privés, tables VIP et soirées d’exception, sans file d’attente.",
    universe: "club",
    wa: "Bonjour, je souhaite une soirée ou un club et en parler avec Travel BA.",
    heroTitle: "Le soir,",
    heroEm: "ouvert.",
    image: "photo-1470225620780-dba8ba36b745",
    alt: "Salle et lumières, la nuit",
    manifesto: "Clubs privés, tables, soirées. Sur demande, et avec la discrétion du reste du séjour.",
    splits: [
      {
        title: "L’accès.",
        text: "La maison porte la demande. L’entrée se confirme. La file n’est pas le chemin prévu.",
        image: "photo-1566737236500-c8ac43014a67",
        alt: "Piste et lumières",
      },
      {
        title: "La table.",
        text: "Le nombre, l’heure, le lieu. Rien n’est ajouté qui ne soit demandé.",
        image: shot.table,
        alt: "Table, lumière basse",
      },
      {
        title: "Le retour.",
        text: "Le chauffeur ramène. Le carnet garde la soirée avec le reste du voyage.",
        image: shot.car,
        alt: "Voiture, la nuit suggérée par la carrosserie",
        ...carnet,
      },
    ],
    proseTitle: "Dans le séjour.",
    prose: "La vie nocturne suit l’événement, le séminaire ou le voyage sur mesure. Même équipe, même fil.",
  },
  {
    slug: "chauffeur",
    siteKey: "chauffeur",
    menu: "Chauffeur privé",
    description: "Flotte premium et chauffeurs d’expérience pour tous vos trajets, en toute discrétion.",
    universe: "chauffeur",
    wa: "Bonjour, je souhaite un chauffeur et en parler avec Travel BA.",
    heroTitle: "Le trajet,",
    heroEm: "discret.",
    image: shot.car,
    alt: "Berline sombre, profil",
    manifesto: "Tous les trajets, en discrétion. Le devis part après l’accord de la maison.",
    splits: [
      {
        title: "La voiture.",
        text: "Flotte premium, chauffeur d’expérience. L’heure et l’adresse sont celles du séjour, pas une estimation.",
        image: "photo-1449965408869-eaa3f722e40d",
        alt: "Route et tableau de bord, lumière du jour",
      },
      {
        title: "D’un seuil à l’autre.",
        text: "Aéroport, hôtel, table, rendez-vous. Le transfert et le chauffeur tiennent le sol du voyage.",
        image: shot.wing,
        alt: "Aile et ciel",
      },
      {
        title: "Dans le carnet.",
        text: "Le trajet s’écrit avec le reste. La maison confirme avant de le montrer.",
        image: shot.suite,
        alt: "Intérieur calme",
        ...carnet,
      },
    ],
    proseTitle: "En toute discrétion.",
    prose: "Confidentialité au cœur du trajet, comme pour le reste des prestations.",
  },
  {
    slug: "accueil-vip",
    siteKey: "vip",
    menu: "Accueil VIP aéroport",
    description: "Fast-track, salons privés et assistance dédiée pour un passage en aéroport sans friction.",
    universe: "accueil",
    wa: "Bonjour, je souhaite un accueil VIP en aéroport et en parler avec Travel BA.",
    heroTitle: "L’aéroport,",
    heroEm: "franchi.",
    image: "photo-1556388158-158ea5ccacbd",
    alt: "Hall d’aéroport, lumière haute",
    manifesto: "Fast-track, salon, assistance. À l’arrivée comme au départ. Sur demande, confirmé par la maison.",
    splits: [
      {
        title: "Le passage.",
        text: "Le fast-track et le salon privé raccourcissent le hall. L’assistance est dédiée, le temps du passage.",
        image: "photo-1556388158-158ea5ccacbd",
        alt: "Terminal, verrière",
      },
      {
        title: "Avant le vol.",
        text: "L’enregistrement se prépare. La formalité du pays, lorsqu’elle existe, est engagée avant le départ.",
        image: shot.wing,
        alt: "Aile au-dessus des nuages",
      },
      {
        title: "Après la piste.",
        text: "Le chauffeur attend. Le carnet a déjà le nom de la ville où l’on séjourne.",
        image: shot.car,
        alt: "Berline",
        ...carnet,
      },
    ],
    proseTitle: "Sans friction.",
    prose: "L’accueil en aéroport fait partie de la chaîne, avec le jet, le billet et le chauffeur.",
  },
  {
    slug: "sur-mesure",
    siteKey: "bespoke",
    menu: "Voyages sur mesure",
    description: "Itinéraires d’exception entièrement personnalisés, pensés autour de vos envies et de votre agenda.",
    universe: "sur-mesure",
    wa: "Bonjour, je souhaite composer un voyage sur mesure avec Travel BA.",
    heroTitle: "Autour",
    heroEm: "de vous.",
    image: shot.amalfi,
    alt: "Côte et mer, fin de jour",
    manifesto: "L’itinéraire suit vos envies et votre agenda. La phrase du séjour dit les villes où l’on reste.",
    splits: [
      {
        title: "Où l’on reste.",
        text: "Hôtels, villas, adresses. Le départ et l’escale n’entrent pas dans le titre.",
        image: shot.seychelles,
        alt: "Plage et eau claire",
      },
      {
        title: "Comment l’on y va.",
        text: "Billet, jet, train ou bateau lorsque le voyage l’appelle. L’heure reste celle du carnet.",
        image: shot.jet,
        alt: "Avion d’affaires au sol",
      },
      {
        title: "Ce qui entoure.",
        text: "Table, club, chauffeur, accueil, formalité. Tout tient dans un seul carnet.",
        image: shot.kyoto,
        alt: "Allée, lumière douce",
        ...carnet,
      },
    ],
    proseTitle: "Aucune offre standardisée.",
    prose: "Chaque voyage est conçu pour vous. L’agence envoie la proposition. Le Concierge pose les questions, il ne réserve pas seul.",
  },
  {
    slug: "ski",
    siteKey: null,
    menu: "Ski",
    description: "Chalets et palaces. La semaine en altitude, tenue comme les autres séjours.",
    universe: "ski",
    wa: "Bonjour, je cherche une semaine de ski, en chalet ou en palace, et je souhaite en parler avec Travel BA.",
    heroTitle: "La semaine,",
    heroEm: "en altitude.",
    image: shot.peaks,
    alt: "Crêtes enneigées, lumière dorée",
    manifesto: "Courchevel, Megève, Zermatt, St. Moritz : des noms de vallées. La maison se choisit avec vous.",
    splits: [
      {
        title: "Le chalet.",
        text: "Bois, feu, table longue. Nuits et avantages du tarif lorsqu’ils sont prévus, confirmés avant l’arrivée.",
        image: shot.chalet,
        alt: "Intérieur de bois, lumière chaude",
      },
      {
        title: "Le palace.",
        text: "Lorsque la semaine appelle un palace. Même carnet, mêmes transferts, même conciergerie.",
        image: shot.suite,
        alt: "Chambre claire",
      },
      {
        title: "La route, puis la piste.",
        text: "Transfert ou chauffeur jusqu’à la station. Les horaires restent ceux du carnet.",
        image: shot.slope,
        alt: "Piste damée",
        ...carnet,
      },
    ],
    proseTitle: "Au même titre.",
    prose: "Le ski suit la même chaîne que les autres services : brief, maison, transfert, carnet.",
  },
];

export function serviceBySlug(slug: string) {
  return previewServices.find((service) => service.slug === slug) ?? null;
}
