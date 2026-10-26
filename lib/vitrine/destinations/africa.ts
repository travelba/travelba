import type { Destination } from "../types";

export const africa: Destination[] = [
  {
    slug: "namibie",
    name: "Namibie",
    region: "afrique",
    image: "photo-1484318571209-661cf29a69c3",
    alt: "Dune rouge sous un ciel pâle",
    line: "Windhoek, Sossusvlei, le Damaraland, la Skeleton Coast.",
    essay:
      "La Namibie est un pays de distances. Travel BA les tient en avion léger, et laisse à chaque lodge assez de nuits pour que le désert ne soit pas une photo prise depuis la voiture.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Namibie",
        title: "Quatre déserts, un seul fil",
        duration: "10 jours / 9 nuits",
        season: "Mai à octobre, saison sèche. La lumière sur les dunes est alors nette. Décembre à mars verdit le pays, et chauffe les journées.",
        lede: "On atterrit, on ne traverse pas. Les camps se succèdent par le ciel.",
        steps: [
          {
            when: "Jour 1",
            title: "Windhoek",
            text: "Accueil à l’aéroport, nuit de seuil. La ville ne se visite pas : elle sert à arriver.",
            stay: "Olive Exclusive",
          },
          {
            when: "Jours 2 à 4",
            title: "Sossusvlei",
            text: "Vol léger. Les dunes à l’heure où l’ombre est encore longue, depuis la réserve du lodge. Une journée peut n’être que le ciel.",
            stay: "Little Kulala",
          },
          {
            when: "Jours 5 et 6",
            title: "Damaraland",
            text: "Les éléphants du désert, avec le guide du camp, à l’allure de l’animal. Les soirs sont simples et justes.",
            stay: "Damaraland Camp",
          },
          {
            when: "Jours 7 à 9",
            title: "Skeleton Coast",
            text: "Vol vers Hoanib. La côte, les lions du désert si le guide les trouve, le silence. Rien n’est garanti du côté des animaux : la maison ne promet pas une liste.",
            stay: "Hoanib Skeleton Coast Camp",
          },
          {
            when: "Jour 10",
            title: "Le retour",
            text: "Vol léger vers Windhoek, correspondance internationale, accueil au départ.",
            stay: "Les avions du désert",
          },
        ],
        houses: [
          { name: "Olive Exclusive", where: "Windhoek", note: "Quelques suites, pour la nuit d’arrivée." },
          { name: "Little Kulala", where: "Sossusvlei", note: "La réserve privée aux portes des dunes." },
          { name: "Damaraland Camp", where: "Damaraland", note: "Le désert habité." },
          { name: "Hoanib Skeleton Coast Camp", where: "Skeleton Coast", note: "La côte des brumes." },
        ],
        experiences: [
          "Avions légers entre les camps",
          "Dunes aux premières heures",
          "Sorties avec le guide du lodge",
          "Accueil à Windhoek",
        ],
      },
    ],
  },
  {
    slug: "kenya",
    name: "Kenya",
    region: "afrique",
    image: "photo-1547471080-7cc2caa01a7e",
    alt: "Savane dorée et acacias",
    line: "Le Masai Mara, Laikipia, l’océan Indien.",
    essay:
      "Le Kenya de ce carnet n’est pas un circuit de parcs. C’est une escarpe au-dessus du Mara, une réserve privée plus au nord, puis la mer pour finir. Le véhicule est privé. Le guide aussi.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Kenya",
        title: "L’escarpe, la réserve, la mer",
        duration: "10 jours / 9 nuits",
        season:
          "Juillet à octobre pour la grande migration dans le Mara. Janvier et février offrent une autre fenêtre. Les longues pluies d’avril et mai se disent avant d’être choisies.",
        lede: "On arrive par Wilson, à Nairobi, et l’on ne reste pas dans la ville. Le premier vol de brousse part le matin.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "Masai Mara",
            text: "Vol vers l’escarpement. Les sorties se font à votre heure, dans votre véhicule. Le lodge regarde la plaine d’en haut. Les animaux restent des animaux : on les cherche, on ne les commande pas.",
            stay: "Angama Mara",
          },
          {
            when: "Jours 5 à 7",
            title: "Laikipia",
            text: "Un autre vol, un autre silence. Rhinocéros, collines, une réserve où les journées ne ressemblent pas à celles du Mara.",
            stay: "Segera Retreat",
          },
          {
            when: "Jours 8 et 9",
            title: "Diani",
            text: "La côte, deux nuits, le temps de poser le safari. L’océan, une villa, rien d’obligatoire.",
            stay: "Alfajiri Villas",
          },
          {
            when: "Jour 10",
            title: "Le retour",
            text: "Vol vers Nairobi, accueil, correspondance.",
            stay: "Les vols de brousse sont dans le carnet",
          },
        ],
        houses: [
          { name: "Angama Mara", where: "Masai Mara", note: "Au-dessus de la plaine." },
          { name: "Segera Retreat", where: "Laikipia", note: "La réserve privée, plus secrète." },
          { name: "Alfajiri Villas", where: "Diani", note: "Trois villas face à l’océan." },
        ],
        experiences: [
          "Véhicule et guide privés",
          "Vols de brousse entre les lieux",
          "Accueil à Nairobi",
          "Deux nuits de mer après le bush",
        ],
      },
    ],
  },
  {
    slug: "botswana",
    name: "Botswana",
    region: "afrique",
    image: "photo-1516426122078-c23e76319801",
    alt: "Éléphant dans l’herbe haute",
    line: "L’Okavango, puis les pans du Makgadikgadi.",
    essay:
      "Le Botswana se voyage par le ciel, de camp en camp. L’eau d’abord, là où les îles bougent. Le sel ensuite, sous un ciel qui n’a pas de bord. Travel BA ne met qu’un véhicule par famille.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Botswana",
        title: "L’eau, puis le sel",
        duration: "9 jours / 8 nuits",
        season:
          "Mai à octobre pour les pistes et l’eau basse. Novembre à mars, la saison verte, change les couleurs et ferme parfois une piste : la maison le dit.",
        lede: "Trois camps. Aucune route entre eux. Le carnet ne contient que les vols, les nuits et les heures de départ en 4x4.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Chief’s Island",
            text: "Arrivée à Maun, vol léger. Les terres hautes de l’Okavango, les sorties à l’aube et au soir, le milieu du jour au camp.",
            stay: "Mombo",
          },
          {
            when: "Jours 4 à 6",
            title: "Les eaux",
            text: "Un autre camp, plus dans l’eau. Mokoro si le niveau le permet. Les après-midi sont lentes.",
            stay: "andBeyond Xaranna",
          },
          {
            when: "Jours 7 et 8",
            title: "Makgadikgadi",
            text: "Le sel, les zèbres en saison, les étoiles. Le camp est une halte de silence après l’eau.",
            stay: "Jack’s Camp",
          },
          {
            when: "Jour 9",
            title: "Le retour",
            text: "Vol vers Maun, puis la correspondance. L’accueil reprend à l’aéroport.",
            stay: "Avions légers",
          },
        ],
        houses: [
          { name: "Mombo", where: "Okavango", note: "Chief’s Island, au-dessus de la plaine." },
          { name: "andBeyond Xaranna", where: "Okavango", note: "Le delta, dans l’eau." },
          { name: "Jack’s Camp", where: "Makgadikgadi", note: "Les pans de sel." },
        ],
        experiences: [
          "Vols légers entre les camps",
          "Véhicule privé à chaque étape",
          "Mokoro lorsque l’eau le permet",
          "Accueil à Maun",
        ],
      },
    ],
  },
  {
    slug: "afrique-du-sud",
    name: "Afrique du Sud",
    region: "afrique",
    image: "photo-1516026672322-bc52d61a55d5",
    alt: "Acacia seul dans une plaine dorée",
    line: "Le Cap, Franschhoek, Sabi Sand.",
    essay:
      "Le Cap pour la montagne et l’océan, Franschhoek pour deux nuits de vignes, Sabi Sand pour le bush en véhicule privé. La maison assemble les saisons quand le calendrier le permet, ou choisit celle que vous venez chercher.",
    rhythm: "journal",
    itineraries: [
      {
        anchor: "voyage",
        name: "Afrique du Sud",
        title: "La péninsule, la vigne, le bush",
        duration: "11 jours / 10 nuits",
        season:
          "Le Cap de novembre à avril. Le bush de mai à septembre, quand l’herbe basse laisse voir. Les deux ne coïncident pas toujours : le conseiller le dit.",
        lede: "On commence par la mer, on s’arrête dans les vignes, on finit à l’aube dans un véhicule qui n’appartient qu’à vous.",
        steps: [
          {
            when: "Jours 1 à 4",
            title: "Le Cap",
            text: "Accueil à l’aéroport. La péninsule avec un guide, Boulders tôt, une table demandée à La Colombe. Une journée reste pour la ville, sans liste.",
            stay: "Ellerman House",
          },
          {
            when: "Jours 5 et 6",
            title: "Franschhoek",
            text: "Route privée vers la vallée. Une cave, pas un circuit. Les repas peuvent rester à la maison.",
            stay: "La Residence",
          },
          {
            when: "Jours 7 à 10",
            title: "Sabi Sand",
            text: "Vol vers le bush. Lodge, véhicule privé, guide. Deux sorties par jour, le reste au camp. Les animaux ne se commandent pas.",
            stay: "Singita Ebony Lodge",
          },
          {
            when: "Jour 11",
            title: "Le retour",
            text: "Vol vers Johannesburg ou Le Cap, selon la correspondance. Accueil au départ.",
            stay: "Le dernier vol est écrit",
          },
        ],
        houses: [
          { name: "Ellerman House", where: "Bantry Bay", note: "Une maison face à l’Atlantique." },
          { name: "La Residence", where: "Franschhoek", note: "La vallée, en petit nombre." },
          { name: "Singita Ebony Lodge", where: "Sabi Sand", note: "Le bush, depuis la rivière." },
        ],
        experiences: [
          "Péninsule avec un guide privé",
          "Table demandée à La Colombe",
          "Véhicule privé à Sabi Sand",
          "Vol intérieur vers le lodge",
        ],
      },
    ],
  },
  {
    slug: "zambie",
    name: "Zambie",
    region: "afrique",
    image: "photo-1547970810-dc1eac37d174",
    alt: "Piste de terre dans la savane",
    line: "South Luangwa, le Zambèze, les chutes.",
    essay:
      "La Zambie est le pays de la marche. À South Luangwa, on descend du véhicule. Sur le fleuve, on prend le canoë. Aux chutes, on arrive tôt. Travel BA écrit ces trois gestes, et les vols qui les relient.",
    rhythm: "atlas",
    itineraries: [
      {
        anchor: "voyage",
        name: "Zambie",
        title: "Marcher, descendre le fleuve, voir l’eau tomber",
        duration: "9 jours / 8 nuits",
        season: "Juin à octobre. La marche et les pistes sont alors ouvertes. La saison verte change le fleuve et se dit à part.",
        lede: "Trois camps, trois manières d’être dehors. Les milieux de journée restent à l’ombre.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "South Luangwa",
            text: "Vol vers Mfuwe. Marche avec le guide le matin, sortie de nuit, sieste longue. Le parc se prend à pied, c’est sa raison d’être.",
            stay: "Chinzombo",
          },
          {
            when: "Jours 4 à 6",
            title: "Bas-Zambèze",
            text: "Un autre vol. Le fleuve, le canoë aux heures fraîches, les éléphants sur les îles. Le camp est au bord de l’eau.",
            stay: "Chiawa Camp",
          },
          {
            when: "Jours 7 et 8",
            title: "Livingstone",
            text: "Les chutes à l’ouverture, depuis la rive zambienne. Le lodge regarde le fleuve en amont. Une après-midi peut rester sans visite.",
            stay: "Thorntree River Lodge",
          },
          {
            when: "Jour 9",
            title: "Le départ",
            text: "Vol vers la correspondance. Les horaires de brousse ont de la marge.",
            stay: "Accueil au dernier aéroport",
          },
        ],
        houses: [
          { name: "Chinzombo", where: "South Luangwa", note: "Le parc que l’on marche." },
          { name: "Chiawa Camp", where: "Bas-Zambèze", note: "Le fleuve, à hauteur d’eau." },
          { name: "Thorntree River Lodge", where: "Livingstone", note: "Le Zambèze, avant les chutes." },
        ],
        experiences: [
          "Marche avec un guide à Luangwa",
          "Canoë sur le Zambèze",
          "Les chutes à l’ouverture",
          "Vols légers entre les camps",
        ],
      },
    ],
  },
  {
    slug: "maroc",
    name: "Maroc",
    region: "afrique",
    image: "photo-1489749798305-4fea3ae63d43",
    alt: "Minaret et ciel pâle au-dessus de la ville",
    line: "Marrakech, l’Atlas, la palmeraie de Skoura.",
    essay:
      "Marrakech d’abord, assez longtemps pour que la médina ne soit pas une traversée. L’Atlas ensuite, pour l’air. Puis Skoura, où les dîners ne se choisissent pas à l’avance : ils arrivent. Le chauffeur est le même du premier au dernier jour.",
    rhythm: "salon",
    itineraries: [
      {
        anchor: "voyage",
        name: "Maroc",
        title: "La ville, la montagne, la palmeraie",
        duration: "8 jours / 7 nuits",
        season:
          "Mars à mai, et septembre à novembre. L’été de Marrakech est trop chaud pour ce rythme. L’hiver dans le désert est beau, et les nuits sont froides.",
        lede: "Un seul pays, trois maisons, aucune journée remplie pour le principe.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Marrakech",
            text: "Accueil à l’aéroport. La médina à l’ouverture avec un guide, Majorelle tôt, un après-midi dans le riad. Le soir peut rester dans la maison.",
            stay: "Royal Mansour",
          },
          {
            when: "Jours 4 et 5",
            title: "Atlas",
            text: "Route vers Asni. La vallée, une marche courte, la terrasse. La montagne sert à ralentir, pas à cocher un col.",
            stay: "Kasbah Tamadot",
          },
          {
            when: "Jours 6 et 7",
            title: "Skoura",
            text: "Route vers la palmeraie. Ici, les repas sont des surprises tenues par la maison du lieu. Une sortie dans les palmes, peut-être une nuit plus loin si vous la demandez.",
            stay: "Dar Ahlam",
          },
          {
            when: "Jour 8",
            title: "Le retour",
            text: "Route vers Marrakech, accueil au vol. L’heure de départ tient compte de la piste.",
            stay: "Le même chauffeur",
          },
        ],
        houses: [
          { name: "Royal Mansour", where: "Marrakech", note: "Les riads privés, dans la ville." },
          { name: "Kasbah Tamadot", where: "Asni", note: "L’Atlas, au-dessus de la plaine." },
          { name: "Dar Ahlam", where: "Skoura", note: "La palmeraie, et des dîners que l’on ne choisit pas." },
        ],
        experiences: [
          "Médina à l’ouverture",
          "Chauffeur du premier au dernier jour",
          "Atlas sans programme chargé",
          "Dîners de Skoura, tenus par la maison du lieu",
        ],
      },
    ],
  },
  {
    slug: "egypte",
    name: "Égypte",
    region: "afrique",
    image: "photo-1539768942893-daf53e448371",
    alt: "Architecture de terre et ciel chaud",
    line: "Le Caire, le Nil, Assouan.",
    essay:
      "L’Égypte se lit avec un égyptologue, pas avec un haut-parleur. Le Caire d’abord, les pyramides à l’ouverture, le musée. Puis le fleuve, cabine par cabine. Puis Assouan, quand le Nil devient large.",
    rhythm: "film",
    itineraries: [
      {
        anchor: "voyage",
        name: "Égypte",
        title: "La pierre, le fleuve, le cataracte",
        duration: "10 jours / 9 nuits",
        season: "Octobre à avril. L’été sur le Nil est une autre décision, et la maison la nomme comme telle.",
        lede: "Un guide pour tout le voyage. Des heures d’ouverture, pas des heures de foule.",
        steps: [
          {
            when: "Jours 1 à 3",
            title: "Le Caire",
            text: "Accueil à l’aéroport. Les pyramides à l’ouverture, le Grand Musée égyptien avec l’égyptologue, le Caire islamique le matin suivant. Les soirées restent sur le Nil.",
            stay: "Four Seasons Hotel Cairo at Nile Plaza",
          },
          {
            when: "Jours 4 à 7",
            title: "Le Nil",
            text: "Vol vers Louxor, embarquement. Temples le matin, cabine l’après-midi, le fleuve fait le déplacement. Edfou, Kom Ombo, selon la navigation du bateau.",
            stay: "Oberoi Zahra",
          },
          {
            when: "Jours 8 et 9",
            title: "Assouan",
            text: "La terrasse, Philæ tôt, une felouque au couchant. Le barrage seulement si vous le demandez.",
            stay: "Sofitel Legend Old Cataract",
          },
          {
            when: "Jour 10",
            title: "Le retour",
            text: "Vol vers Le Caire, correspondance, accueil au départ.",
            stay: "Les vols intérieurs sont tenus",
          },
        ],
        houses: [
          { name: "Four Seasons Hotel Cairo at Nile Plaza", where: "Le Caire", note: "Le fleuve, dès la première nuit." },
          { name: "Oberoi Zahra", where: "Le Nil", note: "La cabine, entre Louxor et Assouan." },
          { name: "Sofitel Legend Old Cataract", where: "Assouan", note: "La terrasse au-dessus du Nil." },
        ],
        experiences: [
          "Égyptologue privé sur tout le voyage",
          "Pyramides et temples à l’ouverture",
          "Navigation sur le Nil",
          "Felouque à Assouan",
        ],
      },
    ],
  },
];
