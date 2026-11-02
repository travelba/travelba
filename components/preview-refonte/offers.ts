import { shot } from "./photos";

export type OfferChapter = { n: string; title: string; text: string };
export type OfferInspiration = { place: string; hotel: string; text: string };

export type Offer = {
  slug: string;
  href: string;
  menu: string;
  eyebrow: string;
  title: string;
  lede: string;
  card: string;
  image: string;
  alt: string;
  featured: boolean;
  chapters: OfferChapter[];
  inspirations?: OfferInspiration[];
};

export const offers: Offer[] = [
  {
    slug: "sur-mesure",
    href: "/preview-refonte/sur-mesure",
    menu: "Voyages sur mesure",
    eyebrow: "Sur mesure",
    title: "Un voyage écrit autour de vous.",
    lede: "L’itinéraire suit l’agenda, les villes où l’on reste, et le rythme que vous indiquez. La maison coordonne le vol, l’hôtel, la table, le transfert et le carnet.",
    card: "De la première conversation au dernier kilomètre. L’itinéraire, les maisons, les tables.",
    image: shot.kyoto,
    alt: "Jardin et temple, lumière douce",
    featured: true,
    chapters: [
      { n: "01", title: "La conversation", text: "Le projet commence par qui voyage, ce que vous voulez vivre, et quand. Rien n’est un circuit déposé à l’avance." },
      { n: "02", title: "L’itinéraire", text: "Les villes du titre sont celles du séjour. Une escale sans nuit n’entre pas dans le nom du voyage. Les étapes se confirment avant d’être promises." },
      { n: "03", title: "La tenue", text: "Vols, hôtels, tables, chauffeurs, accueil en aéroport. Le jet, si le voyage le demande : l’appareil est affrété et confirmé, du décollage à l’atterrissage." },
      { n: "04", title: "Le carnet", text: "Billets, confirmations et messages vivent dans l’espace. Agence IATA 20291655 : l’émission, lorsqu’il y a un billet, va dans le carnet. L’horaire reste celui du transporteur." },
    ],
    inspirations: [
      { place: "Kyoto", hotel: "Aman Kyoto", text: "Un jardin le matin, une table le soir, une journée laissée vide. La formalité, si le passeport en demande une, suit le fil : préparation, remplissage, validation, paiement, pièce." },
      { place: "Positano", hotel: "Le Sirenuse", text: "Quelques nuits sans programme chargé. Le chauffeur prend Naples. Une table complète se demande, puis se confirme." },
      { place: "Mahé", hotel: "Four Seasons Resort Seychelles", text: "Le transfert est celui que l’île confirme. L’accueil VIP se prépare si le terminal le justifie." },
    ],
  },
  {
    slug: "seminaires",
    href: "/preview-refonte/seminaires",
    menu: "Séminaires",
    eyebrow: "Pour l’entreprise",
    title: "Séminaires et congrès, tenus de bout en bout.",
    lede: "Une étude, pas un catalogue. Marrakech peut s’écrire jour par jour. Le groupe, la salle, les chauffeurs et le carnet restent dans les mêmes mains.",
    card: "Lieux d’exception, logistique, animation. Le dossier de Marrakech, et d’autres villes.",
    image: shot.koutoubia,
    alt: "Tour et jardin, lumière chaude",
    featured: true,
    chapters: [
      { n: "01", title: "L’arrivée", text: "Le groupe atterrit. L’horaire est celui des billets. Accueil VIP si le passage le demande, puis les chauffeurs jusqu’à l’hôtel. Le dîner de bienvenue est confirmé avant les valises." },
      { n: "02", title: "La salle", text: "Organisation complète : le lieu, la lumière, le déjeuner, l’animation écrite à l’avance. Un seul interlocuteur porte le fil, pour l’entreprise et pour chaque voyageur." },
      { n: "03", title: "Hors les murs", text: "Une après-midi dont le lieu se confirme avec la maison. Le soir, un dîner tenu comme un événement : conception, table, rythme. Rien n’est réservé seul." },
      { n: "04", title: "Le départ", text: "Les billets de retour sont dans le carnet. Les chauffeurs reprennent l’aéroport. S’il y a un jet, l’appareil est confirmé. Aucun prix n’est affiché dans cette étude." },
    ],
    inspirations: [
      { place: "Marrakech", hotel: "La Mamounia", text: "L’étude principale. Arrivée, salle, palmeraie ou médina, dernier matin. Le carnet du groupe est un dossier d’exemple." },
      { place: "Palmeraie", hotel: "Four Seasons Resort Marrakech", text: "Un incentive plus résidentiel : salle le matin, resort l’après-midi, dîner le second soir." },
      { place: "Marrakech", hotel: "Club Med La Palmeraie, Exclusive Collection", text: "Un séminaire dans le village, quand le groupe veut rester sur un seul lieu." },
      { place: "Paris", hotel: "Four Seasons Hotel George V", text: "Une journée de conseil. Salle, déjeuner, chauffeurs dans la ville." },
    ],
  },
  {
    slug: "kids",
    href: "/preview-refonte/kids",
    menu: "En famille",
    eyebrow: "Kids",
    title: "La journée d’une famille, tenue.",
    lede: "Chambres qui s’ouvrent l’une sur l’autre, club des enfants, lit bébé, siège dans la voiture. Les maisons nommées ici sont celles dont le club ou l’accueil des familles est connu.",
    card: "Club Med, Ikos, et les palaces qui reçoivent les enfants. Mer, îles, montagne.",
    image: shot.maldives,
    alt: "Lagon et ponton",
    featured: true,
    chapters: [
      { n: "01", title: "Le matin", text: "Les chambres communicantes et le lit bébé se demandent avec la réservation. Le petit-déjeuner se prend selon l’âge et le sommeil. La journée commence où l’on a dormi." },
      { n: "02", title: "Le club", text: "À Ikos, Heroes à partir de quatre ans, la crèche à partir d’environ six mois, Just4Teens à partir de douze ans. Au Club Med, le club du village, les âges confirmés avant le départ. Ailleurs, le club de la maison retenue, pas un nom inventé." },
      { n: "03", title: "L’après-midi", text: "Piscine, sieste, ou une nounou demandée à l’hôtel. Elle dépend d’une disponibilité. S’il y a une table en ville, le chauffeur part avec un siège enfant." },
      { n: "04", title: "Le soir", text: "Le carnet dit où l’on dort et ce qui est confirmé. La conciergerie répond sur WhatsApp, à toute heure. L’écran montré sur l’accueil est un exemple." },
    ],
    inspirations: [
      { place: "Halkidiki", hotel: "Ikos Olivia", text: "Heroes, Crèche et Just4Teens. Les mêmes clubs à Ikos Porto Petro et à Ikos Andalusia." },
      { place: "Seychelles", hotel: "Club Med Exclusive Collection", text: "Chambres proches, transfert avec siège, club du village. En montagne, le forfait et les cours font partie du séjour Club Med." },
      { place: "Desaru Coast", hotel: "Mandarin Oriental", text: "Kids’ Club, quatre à onze ans. Suites communicantes. La nounou se demande, elle reste soumise à disponibilité." },
      { place: "Val d’Isère", hotel: "Club Med Exclusive Collection", text: "La semaine de ski en famille. Les Arcs Panorama, Tignes et Valmorel sont des Exclusive Collection Spaces." },
      { place: "Dubaï", hotel: "Atlantis The Royal", text: "Explorers Club, Little Explorers avec un adulte, Teens Lounge." },
      { place: "Riviera Nayarit", hotel: "One&Only Mandarina", text: "KidsOnly ouvre par périodes, notamment l’été. La maison vérifie la saison." },
      { place: "Nassau", hotel: "Rosewood Baha Mar", text: "Rosewood Explorers. À Mayakoba, suites familiales et nounous sur préavis." },
      { place: "Maldives, Algarve, Sardaigne", hotel: "Cheval Blanc Randheli, Martinhal Sagres, Forte Village", text: "Accueil des familles à Randheli. Raposinhos à Sagres. Kids club et AcquaPark à Forte Village. Six Senses : Nest à Krabey Island et Yao Noi. Là où un Four Seasons ouvre Kids For All Seasons, le club est retenu s’il est ouvert pour les âges du voyage." },
    ],
  },
  {
    slug: "entre-nous",
    href: "/preview-refonte/entre-nous",
    menu: "À deux",
    eyebrow: "Entre nous",
    title: "Quelques nuits, sans programme chargé.",
    lede: "Un carnet d’escapades. L’hôtel, la table, la route, le fil. Ce sont des inspirations : aucun client n’est cité.",
    card: "Positano, Kyoto, Marrakech, une île, une nuit à Paris.",
    image: shot.amalfi,
    alt: "Côte escarpée et mer",
    featured: true,
    chapters: [
      { n: "01", title: "La première soirée", text: "Elle reste souvent à l’hôtel. Le rythme se dit avant le départ, pas dans un programme heure par heure imposé." },
      { n: "02", title: "La table", text: "Les meilleures tables, même complètes, se demandent. La demande part de la maison. La confirmation revient avant que vous ne comptiez dessus." },
      { n: "03", title: "La route", text: "Chauffeur depuis l’aéroport, accueil VIP si le terminal le justifie. Le voyage sur mesure se dessine autour de votre agenda." },
      { n: "04", title: "Le fil", text: "Le carnet porte les nuits et les confirmations. Un message si la journée change. Rien de l’étude n’est envoyé seul." },
    ],
    inspirations: [
      { place: "Positano", hotel: "Le Sirenuse", text: "La côte, un chauffeur depuis Naples, une table demandée." },
      { place: "Kyoto", hotel: "Aman Kyoto", text: "Peu de choses écrites d’avance. La formalité seulement si le passeport l’exige." },
      { place: "Marrakech", hotel: "Royal Mansour", text: "Un riad, pas un séminaire. Jardin, déjeuner, soirée si vous la souhaitez." },
      { place: "Paris", hotel: "Cheval Blanc Paris", text: "Une nuit en ville, une table, un club si vous le demandez." },
      { place: "Maldives", hotel: "One&Only Reethi Rah", text: "Le transfert que l’île confirme. Le jet seulement s’il a un sens, et seulement une fois l’appareil confirmé." },
    ],
  },
  {
    slug: "celebrer",
    href: "/preview-refonte/celebrer",
    menu: "Célébrations",
    eyebrow: "Pour célébrer",
    title: "Une soirée, de dix-huit heures à minuit.",
    lede: "Les heures donnent le rythme du récit. Ce ne sont pas des horaires de vol. Les accès se demandent, puis se confirment.",
    card: "Tables, clubs, Roland-Garros, Formule 1, galas. L’accès se demande.",
    image: "photo-1566737236500-c8ac43014a67",
    alt: "Salle sombre, lumières chaudes",
    featured: true,
    chapters: [
      { n: "01", title: "Dix-huit heures", text: "Les chauffeurs sont placés. Flotte premium, discrétion. À l’hôtel, les chambres de ceux qui restent sont prêtes. Cheval Blanc Paris peut tenir la nuit." },
      { n: "02", title: "Vingt heures", text: "La table, dans la maison ou dehors. Une table complète est tentée, puis confirmée. Le dîner est conçu comme un événement privé." },
      { n: "03", title: "Vingt-deux heures", text: "Le club se demande : table, soirée, accès. Quand la file est écartée, c’est l’adresse qui le confirme." },
      { n: "04", title: "Minuit", text: "Les retours. Le Concierge peut écrire dans le fil. L’échange montré sur l’accueil est un exemple : rien n’a été envoyé." },
    ],
    inspirations: [
      { place: "Paris", hotel: "Cheval Blanc Paris", text: "La soirée de référence. Four Seasons Hotel George V si la nuit se prolonge après un grand rendez-vous." },
      { place: "Roland-Garros", hotel: "Un palace parisien", text: "L’accès VIP se demande. Les places ne sont pas décrites comme déjà tenues. Le chauffeur tient les trajets." },
      { place: "Marrakech", hotel: "Royal Mansour", text: "Une célébration, distincte du séminaire. Dîner dans la maison ou une table en ville." },
    ],
  },
  {
    slug: "montagne",
    href: "/preview-refonte/montagne",
    menu: "Ski",
    eyebrow: "À la montagne",
    title: "Une semaine de ski, du lundi au dimanche.",
    lede: "Courchevel, dans cette inspiration. Forfaits et moniteurs se demandent, sauf lorsque le produit de la maison les comprend déjà. Aucun client n’est cité.",
    card: "Palaces et villages. Cheval Blanc, Aman, Club Med Exclusive Collection.",
    image: shot.peaks,
    alt: "Crêtes enneigées",
    featured: true,
    chapters: [
      { n: "01", title: "Lundi", text: "Arrivée. Le transfert vient de l’aéroport ou de la gare. Installation. Forfaits et moniteurs demandés, puis notés une fois confirmés." },
      { n: "02", title: "Les pistes", text: "Mardi sur le domaine. Le déjeuner en altitude s’il est réservé. Mercredi peut rester plus calme : guide, ou le spa du palace si la maison le confirme." },
      { n: "03", title: "La station", text: "Jeudi, une table, même complète, se demande. Vendredi, ceux qui arrivent en jet : appareil confirmé, accueil, chauffeur jusqu’à la station." },
      { n: "04", title: "Dimanche", text: "Le départ vers la vallée. Le carnet de la semaine reste dans l’espace. La conciergerie demeure joignable." },
    ],
    inspirations: [
      { place: "Courchevel", hotel: "Cheval Blanc Courchevel", text: "La semaine du récit. Palais, pistes, tables de la station." },
      { place: "Courchevel", hotel: "Aman Le Mélézin", text: "Une semaine plus retenue. Forfaits et moniteurs demandés à part." },
      { place: "Val d’Isère", hotel: "Club Med Exclusive Collection", text: "En montagne, le forfait de remontées et les cours de ski ou de snowboard font partie du séjour." },
      { place: "Les Arcs", hotel: "Les Arcs Panorama, Exclusive Collection Space", text: "Même logique. Tignes et Valmorel se préparent de la même façon. En famille, les sièges enfants font partie du transfert." },
    ],
  },
  {
    slug: "jet-prive",
    href: "/preview-refonte/jet-prive",
    menu: "Jet privé",
    eyebrow: "Le ciel",
    title: "L’appareil se confirme.",
    lede: "Affrètement d’avions privés, itinéraire et confort, du décollage à l’atterrissage. Rien n’est promis avant l’accord sur l’appareil.",
    card: "Itinéraire, appareil confirmé, puis le dernier kilomètre.",
    image: shot.jet,
    alt: "Avion d’affaires au sol",
    featured: false,
    chapters: [
      { n: "01", title: "L’itinéraire", text: "Le trajet se dessine autour de l’agenda. La maison confirme l’appareil." },
      { n: "02", title: "Le sol", text: "Chauffeur, transfert, accueil en aéroport. Le jet ne s’arrête pas à la piste." },
      { n: "03", title: "Le billet, s’il y en a un", text: "Agence IATA 20291655. L’émission va dans le carnet. L’heure n’est pas inventée ici." },
      { n: "04", title: "Autour", text: "Séminaire, escapade ou semaine à la montagne : le jet est un moyen, tenu par la même équipe." },
    ],
  },
  {
    slug: "evenements",
    href: "/preview-refonte/evenements",
    menu: "Événements",
    eyebrow: "Événements",
    title: "Conception et production.",
    lede: "Événements privés et corporate. Le motif, le lieu, le rythme. La maison écrit le déroulé avant le jour même.",
    card: "Privé ou corporate. Le lieu, les tables, la production.",
    image: "photo-1511795409834-ef04bbd61622",
    alt: "Salle de réception, lumière dorée",
    featured: false,
    chapters: [
      { n: "01", title: "Le motif", text: "Un dîner, une journée, un lancement. La conception suit l’ambition, pas une formule." },
      { n: "02", title: "Le lieu", text: "Palace, villa, ou adresse confirmée. Les avantages d’un tarif seulement s’ils sont inclus et confirmés." },
      { n: "03", title: "Les tables", text: "Même complètes, elles se demandent. Rien n’est réservé seul." },
      { n: "04", title: "Le jour", text: "Chauffeurs, accueil, fil avec la conciergerie. Le carnet porte ce qui est tenu." },
    ],
  },
  {
    slug: "hotels",
    href: "/preview-refonte/hotels",
    menu: "Hôtels",
    eyebrow: "Maisons",
    title: "Palaces, villas, adresses.",
    lede: "Accès aux maisons que le projet demande. Petit-déjeuner, surclassement ou crédit : seulement lorsque le tarif les inclut et que la maison les confirme.",
    card: "La nuit se confirme avec l’hôtel. Les avantages aussi.",
    image: shot.suite,
    alt: "Chambre claire, linge blanc",
    featured: false,
    chapters: [
      { n: "01", title: "Le choix", text: "La maison propose selon le motif : famille, à deux, séminaire, montagne, célébration." },
      { n: "02", title: "La nuit", text: "Chambres, villas, chambres communicantes quand il y a des enfants. Le nombre et les âges partent avec la demande." },
      { n: "03", title: "La confirmation", text: "Rien n’est annoncé avant la réponse de l’hôtel. Les avantages du tarif non plus." },
      { n: "04", title: "Le carnet", text: "La confirmation rejoint l’espace. Les numéros de pièces ne sont pas sur cette étude." },
    ],
  },
  {
    slug: "restaurants",
    href: "/preview-refonte/restaurants",
    menu: "Tables",
    eyebrow: "Tables",
    title: "Même lorsque la table est complète.",
    lede: "La demande part de l’agence. Une table complète est tentée, puis confirmée. Rien n’est réservé seul.",
    card: "Les meilleures tables. La demande, puis la confirmation.",
    image: shot.table,
    alt: "Table dressée, lumière basse",
    featured: false,
    chapters: [
      { n: "01", title: "La demande", text: "Le jour, le nombre, le ton du repas. La maison écrit à l’adresse." },
      { n: "02", title: "La réponse", text: "Elle revient avant que la table ne soit promise. Une adresse complète peut rester impossible : on le dit." },
      { n: "03", title: "Le trajet", text: "Le chauffeur, s’il faut quitter l’hôtel. En famille, le siège enfant est dans la voiture." },
      { n: "04", title: "Le soir", text: "La table peut ouvrir une célébration, ou rester le seul geste de la nuit." },
    ],
  },
  {
    slug: "clubs",
    href: "/preview-refonte/clubs",
    menu: "Clubs",
    eyebrow: "La nuit",
    title: "L’accès se demande.",
    lede: "Clubs privés, tables, soirées. La maison confirme avec l’adresse. La file, lorsqu’elle est écartée, l’est par cette confirmation.",
    card: "Clubs privés et tables. Sur confirmation de l’adresse.",
    image: "photo-1470225620780-dba8ba36b745",
    alt: "Salle de nuit, lumière basse",
    featured: false,
    chapters: [
      { n: "01", title: "La demande", text: "Le soir, le nombre, le genre de table. Rien n’est tenu pour acquis." },
      { n: "02", title: "L’adresse", text: "C’est elle qui confirme l’accès. La maison ne le promet pas à sa place." },
      { n: "03", title: "Les voitures", text: "Deux fins de soirée si le groupe se sépare. Les chauffeurs connaissent les deux." },
      { n: "04", title: "Le fil", text: "Minuit, le Concierge peut noter un changement. L’exemple de l’accueil n’envoie rien." },
    ],
  },
  {
    slug: "chauffeur",
    href: "/preview-refonte/chauffeur",
    menu: "Chauffeur",
    eyebrow: "La route",
    title: "Le dernier kilomètre, et les autres.",
    lede: "Flotte premium, chauffeurs d’expérience, discrétion. Le trajet se confirme quand la maison a les adresses.",
    card: "Discrétion, sièges enfants, deux fins de soirée si besoin.",
    image: shot.car,
    alt: "Berline sombre, de profil",
    featured: false,
    chapters: [
      { n: "01", title: "L’arrivée", text: "De l’aéroport ou de la gare jusqu’à l’hôtel. L’horaire suit le billet, il n’est pas inventé ici." },
      { n: "02", title: "La journée", text: "Séminaire, table, montagne. Les regroupements sont écrits à l’avance." },
      { n: "03", title: "Les enfants", text: "Le siège fait partie du transfert, au même titre que l’adresse." },
      { n: "04", title: "Le retour", text: "La voiture du départ est calée avec le vol ou le train." },
    ],
  },
  {
    slug: "accueil-vip",
    href: "/preview-refonte/accueil-vip",
    menu: "Accueil VIP",
    eyebrow: "L’aéroport",
    title: "Le passage, sans friction.",
    lede: "Fast-track, salons privés, assistance dédiée, lorsque le terminal le permet. Puis le chauffeur.",
    card: "Fast-track, salon, assistance. Puis la route.",
    image: shot.wing,
    alt: "Aile d’avion au-dessus des nuages",
    featured: false,
    chapters: [
      { n: "01", title: "Avant", text: "Le passage se prépare avec les noms et l’horaire du billet. L’horaire n’est pas réécrit ici." },
      { n: "02", title: "Au terminal", text: "Fast-track, salon privé, assistance. Ce que le terminal tient vraiment, pas une promesse générale." },
      { n: "03", title: "Après", text: "Le chauffeur prend le relais. En famille, le siège est déjà dans la voiture." },
      { n: "04", title: "Au retour", text: "Le même soin, si vous le demandez. Le carnet garde la confirmation." },
    ],
  },
];

export function offerBySlug(slug: string) {
  return offers.find((offer) => offer.slug === slug);
}

export const featuredOffers = offers.filter((offer) => offer.featured);

export const appBySlug: Record<string, { title: string; text: string; lines: readonly (readonly [string, string])[] }> = {
  "sur-mesure": {
    title: "L’itinéraire, dans la poche.",
    text: "Villes, nuits, vols, tables et transferts confirmés. Le carnet se met à jour quand la maison confirme.",
    lines: [
      ["Itinéraire", "Les villes du séjour"],
      ["Documents", "Au coffre"],
      ["Fil", "La maison, à toute heure"],
    ],
  },
  seminaires: {
    title: "Le programme des participants.",
    text: "Chaque voyageur ouvre le même séjour : arrivée, salle, dîner, retour. Les billets du groupe sont dans le carnet.",
    lines: [
      ["Programme", "Jour par jour"],
      ["Billets", "Dans le carnet"],
      ["Participants", "Le même fil"],
      ["Chauffeurs", "Les trajets tenus"],
    ],
  },
  kids: {
    title: "Le planning des enfants.",
    text: "Club, âges, lit bébé, chambres qui s’ouvrent, siège dans la voiture. Ce qui est demandé, puis ce qui est confirmé.",
    lines: [
      ["Club", "Âges confirmés"],
      ["Lit bébé", "Avec la réservation"],
      ["Siège", "Dans la voiture"],
      ["Nounou", "Si l’hôtel confirme"],
    ],
  },
  "entre-nous": {
    title: "Les nuits, et la table.",
    text: "Peu de lignes. L’hôtel, la table une fois confirmée, le fil si la journée change.",
    lines: [
      ["Nuits", "Dans le carnet"],
      ["Table", "Quand elle est confirmée"],
      ["Route", "Le chauffeur"],
    ],
  },
  celebrer: {
    title: "La soirée, dans le carnet.",
    text: "Chauffeurs, table, club, retours. Le carnet porte ce qui est confirmé. Les accès ne sont pas annoncés avant.",
    lines: [
      ["Chauffeurs", "Placés"],
      ["Table", "Confirmée"],
      ["Club", "Accès demandé"],
      ["Retours", "Dans le carnet"],
    ],
  },
  montagne: {
    title: "La semaine, du lundi au dimanche.",
    text: "Transfert, forfaits et moniteurs une fois demandés, table de la station. Le carnet reste ouvert jusqu’au dimanche.",
    lines: [
      ["Semaine", "Lundi — dimanche"],
      ["Forfaits", "Une fois confirmés"],
      ["Pistes", "Le domaine"],
      ["Départ", "Dimanche"],
    ],
  },
  "jet-prive": {
    title: "L’appareil, une fois confirmé.",
    text: "Le carnet dit que l’appareil est tenu. L’horaire n’est pas inventé ici. Le chauffeur prend le relais à l’arrivée.",
    lines: [
      ["Appareil", "Confirmé"],
      ["Itinéraire", "Dans le carnet"],
      ["Sol", "Chauffeur"],
    ],
  },
  evenements: {
    title: "Le déroulé du jour.",
    text: "Motif, lieu, tables, voitures. Le carnet du jour se met à jour quand une confirmation arrive.",
    lines: [
      ["Déroulé", "Écrit avant"],
      ["Lieu", "Confirmé"],
      ["Tables", "Demandées"],
    ],
  },
  hotels: {
    title: "La confirmation, au coffre.",
    text: "La nuit, la chambre, les avantages seulement s’ils sont inclus et confirmés. La pièce rejoint les documents.",
    lines: [
      ["Nuit", "Confirmée"],
      ["Chambre", "Dans le carnet"],
      ["Avantages", "S’ils sont inclus"],
    ],
  },
  restaurants: {
    title: "La table, notée.",
    text: "La demande, puis la réponse. Le carnet ne montre la table que lorsqu’elle est confirmée.",
    lines: [
      ["Demande", "Partie"],
      ["Réponse", "Avant la promesse"],
      ["Trajet", "Le chauffeur"],
    ],
  },
  clubs: {
    title: "L’accès, s’il est confirmé.",
    text: "L’adresse confirme. Le carnet le dit alors. Les voitures de la fin de soirée y sont aussi.",
    lines: [
      ["Accès", "Confirmé par l’adresse"],
      ["Table", "Si elle est tenue"],
      ["Voitures", "Les retours"],
    ],
  },
  chauffeur: {
    title: "Les trajets du séjour.",
    text: "Arrivée, journées, retour. L’horaire suit le billet. En famille, le siège est écrit sur le transfert.",
    lines: [
      ["Arrivée", "Aéroport ou gare"],
      ["Journée", "Les adresses"],
      ["Enfants", "Le siège"],
    ],
  },
  "accueil-vip": {
    title: "Le passage, noté avant l’avion.",
    text: "Fast-track, salon, assistance, lorsque le terminal le permet. Puis le chauffeur. La confirmation est dans le carnet.",
    lines: [
      ["Passage", "Préparé"],
      ["Terminal", "Ce qu’il tient"],
      ["Après", "Le chauffeur"],
    ],
  },
};
